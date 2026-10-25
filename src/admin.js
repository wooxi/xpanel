'use strict';

const crypto = require('node:crypto');
const { db, now, getSetting, setSetting, getAllSettings } = require('./db');
const L = require('./lib');

const SESSION_TTL = 7 * 24 * 3600;
const COOKIE = 'xp_sid';

/* ---------------- 密码与会话 ---------------- */

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  if (!stored || !stored.includes(':')) return false;
  const [salt, hash] = stored.split(':');
  const test = crypto.scryptSync(String(password), salt, 64);
  const expect = Buffer.from(hash, 'hex');
  return test.length === expect.length && crypto.timingSafeEqual(test, expect);
}

/** 首次启动用环境变量初始化管理员 */
function ensureAdmin() {
  if (getSetting('admin_pass', '')) return;
  const user = process.env.ADMIN_USER || 'admin';
  const pass = process.env.ADMIN_PASS || 'xpanel';
  setSetting('admin_user', user);
  setSetting('admin_pass', hashPassword(pass));
  console.log(`[xpanel] 已初始化管理员：${user}`);
}

function ensureDefaults() {
  if (!getSetting('push_interval')) setSetting('push_interval', '60');
  if (!getSetting('pull_interval')) setSetting('pull_interval', '60');
  if (!getSetting('sub_name')) setSetting('sub_name', '');
  if (!getSetting('panel_url')) setSetting('panel_url', '');
}

function parseCookies(req) {
  const raw = req.headers.cookie || '';
  const out = {};
  for (const part of raw.split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

function createSession() {
  const token = L.randomToken(24);
  const ts = now();
  db.prepare('INSERT INTO sessions (token, created_at, expires_at) VALUES (?, ?, ?)').run(token, ts, ts + SESSION_TTL);
  db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(ts);
  return token;
}

function currentUser(req) {
  const sid = parseCookies(req)[COOKIE];
  if (!sid) return null;
  const row = db.prepare('SELECT * FROM sessions WHERE token = ?').get(sid);
  if (!row || row.expires_at < now()) return null;
  return getSetting('admin_user', 'admin');
}

const loginGuard = new Map();
function loginBlocked(ip) {
  const g = loginGuard.get(ip);
  if (!g) return false;
  if (g.until > Date.now()) return true;
  loginGuard.delete(ip);
  return false;
}

function noteLoginFail(ip) {
  const g = loginGuard.get(ip) || { count: 0, until: 0 };
  g.count += 1;
  if (g.count >= 5) {
    g.until = Date.now() + 5 * 60 * 1000;
    g.count = 0;
  }
  loginGuard.set(ip, g);
}

/* ---------------- 工具 ---------------- */

function json(res, status, payload, headers = {}) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
    ...headers,
  });
  res.end(body);
}

function readBody(req, limit = 2 << 20) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) {
        reject(new Error('too large'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

async function body(req) {
  const raw = await readBody(req);
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function str(v, max = 200) {
  return String(v ?? '').trim().slice(0, max);
}

function int(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

/** 'YYYY-MM-DD' -> 当天 23:59:59 时间戳；空 -> null */
function dateToTs(v) {
  const s = str(v, 20);
  if (!s) return null;
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const ts = Math.floor(new Date(`${m[1]}-${m[2]}-${m[3]}T23:59:59+08:00`).getTime() / 1000);
  return Number.isFinite(ts) ? ts : null;
}

function tsToDate(ts) {
  if (!ts) return '';
  const d = new Date(ts * 1000);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function baseUrl(req) {
  const configured = getSetting('panel_url', '');
  if (configured) return configured.replace(/\/+$/, '');
  const proto = req.headers['x-forwarded-proto'] || 'http';
  return `${proto}://${req.headers.host || 'localhost'}`;
}

function userView(req, row) {
  const gb = (b) => (b == null ? null : Number((b / L.GB).toFixed(2)));
  const subUrl = `${baseUrl(req)}/sub/${row.sub_token}`;
  return {
    id: row.id,
    name: row.name,
    uuid: row.uuid,
    sub_token: row.sub_token,
    sub_url: subUrl,
    expires_at: row.expires_at,
    expires_date: tsToDate(row.expires_at),
    traffic_limit: row.traffic_limit,
    traffic_limit_gb: gb(row.traffic_limit),
    used: row.up + row.down,
    used_gb: gb(row.up + row.down),
    remaining_gb: row.traffic_limit == null ? null : gb(Math.max(0, row.traffic_limit - row.up - row.down)),
    speed_limit: row.speed_limit,
    device_limit: row.device_limit,
    banned: row.banned,
    active: L.isActive(row),
    expired: L.isExpired(row),
    over_limit: L.isOverLimit(row),
    last_online_at: row.last_online_at,
    created_at: row.created_at,
  };
}

/* ---------------- 路由 ---------------- */

async function handle(req, res, url) {
  const path = url.pathname;
  if (!path.startsWith('/api/')) return false;

  // 登录
  if (path === '/api/login' && req.method === 'POST') {
    const ip = req.socket.remoteAddress || 'unknown';
    if (loginBlocked(ip)) return json(res, 429, { error: '尝试过多，请 5 分钟后再试' }), true;
    const data = await body(req);
    const ok =
      str(data.username) === getSetting('admin_user', 'admin') &&
      verifyPassword(str(data.password), getSetting('admin_pass', ''));
    if (!ok) {
      noteLoginFail(ip);
      return json(res, 401, { error: '账号或密码错误' }), true;
    }
    const sid = createSession();
    return json(
      res,
      200,
      { ok: true },
      { 'set-cookie': `${COOKIE}=${sid}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_TTL}` }
    ), true;
  }

  if (path === '/api/logout' && req.method === 'POST') {
    const sid = parseCookies(req)[COOKIE];
    if (sid) db.prepare('DELETE FROM sessions WHERE token = ?').run(sid);
    return json(res, 200, { ok: true }, { 'set-cookie': `${COOKIE}=; Path=/; HttpOnly; Max-Age=0` }), true;
  }

  const admin = currentUser(req);
  if (!admin) return json(res, 401, { error: '未登录' }), true;

  if (path === '/api/session' && req.method === 'GET') {
    return json(res, 200, { user: admin, base: baseUrl(req) }), true;
  }

  if (path === '/api/overview' && req.method === 'GET') {
    const nodes = db.prepare('SELECT COUNT(*) c FROM nodes').get().c;
    const nodesOn = db.prepare('SELECT COUNT(*) c FROM nodes WHERE enabled = 1').get().c;
    const users = db.prepare('SELECT COUNT(*) c FROM users').get().c;
    const u = db.prepare('SELECT COALESCE(SUM(up + down), 0) s FROM users').get().s;
    const day = new Date().toISOString().slice(0, 10);
    const today = db.prepare('SELECT COALESCE(SUM(up + down), 0) s FROM traffic_daily WHERE day = ?').get(day).s;
    const activeUsers = db
      .prepare(
        `SELECT COUNT(*) c FROM users WHERE banned = 0
           AND (expires_at IS NULL OR expires_at > ?)
           AND (traffic_limit IS NULL OR up + down < traffic_limit)`
      )
      .get(now()).c;
    return json(res, 200, {
      nodes,
      nodes_enabled: nodesOn,
      users,
      users_active: activeUsers,
      traffic_total: u,
      traffic_today: today,
    }), true;
  }

  /* ---- 节点 ---- */
  if (path === '/api/nodes' && req.method === 'GET') {
    const rows = db.prepare('SELECT * FROM nodes ORDER BY sort ASC, id ASC').all();
    return json(res, 200, {
      nodes: rows.map((r) => ({
        ...r,
        online: r.last_report_at ? now() - r.last_report_at < 300 : false,
      })),
    }), true;
  }

  if (path === '/api/nodes' && req.method === 'POST') {
    const d = await body(req);
    const name = str(d.name);
    const host = str(d.host, 200);
    if (!name || !host) return json(res, 400, { error: '名称和地址必填' }), true;
    const port = int(d.port, 443);
    const token = L.randomToken(16);
    const info = db
      .prepare(
        `INSERT INTO nodes (name, host, port, sni, insecure, obfs, obfs_password, up_mbps, down_mbps, token, enabled, sort, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        name,
        host,
        port,
        str(d.sni, 200),
        d.insecure ? 1 : 0,
        d.obfs ? 'salamander' : '',
        str(d.obfs_password, 100),
        int(d.up_mbps),
        int(d.down_mbps),
        token,
        d.enabled === false ? 0 : 1,
        int(d.sort),
        now()
      );
    return json(res, 200, { id: info.lastInsertRowid, token }), true;
  }

  const nodeIdMatch = path.match(/^\/api\/nodes\/(\d+)$/);
  if (nodeIdMatch) {
    const id = Number(nodeIdMatch[1]);
    const row = db.prepare('SELECT * FROM nodes WHERE id = ?').get(id);
    if (!row) return json(res, 404, { error: '节点不存在' }), true;

    if (req.method === 'PUT') {
      const d = await body(req);
      db.prepare(
        `UPDATE nodes SET name = ?, host = ?, port = ?, sni = ?, insecure = ?, obfs = ?, obfs_password = ?,
           up_mbps = ?, down_mbps = ?, enabled = ?, sort = ? WHERE id = ?`
      ).run(
        str(d.name) || row.name,
        str(d.host, 200) || row.host,
        int(d.port, row.port),
        str(d.sni, 200),
        d.insecure ? 1 : 0,
        d.obfs ? 'salamander' : '',
        str(d.obfs_password, 100),
        int(d.up_mbps),
        int(d.down_mbps),
        d.enabled === false ? 0 : 1,
        int(d.sort),
        id
      );
      return json(res, 200, { ok: true }), true;
    }

    if (req.method === 'DELETE') {
      db.prepare('DELETE FROM nodes WHERE id = ?').run(id);
      return json(res, 200, { ok: true }), true;
    }
  }

  const tokenMatch = path.match(/^\/api\/nodes\/(\d+)\/token$/);
  if (tokenMatch && req.method === 'POST') {
    const id = Number(tokenMatch[1]);
    if (!db.prepare('SELECT id FROM nodes WHERE id = ?').get(id)) {
      return json(res, 404, { error: '节点不存在' }), true;
    }
    const token = L.randomToken(16);
    db.prepare('UPDATE nodes SET token = ? WHERE id = ?').run(token, id);
    return json(res, 200, { token }), true;
  }

  /* ---- 用户 ---- */
  if (path === '/api/users' && req.method === 'GET') {
    const rows = db.prepare('SELECT * FROM users ORDER BY id ASC').all();
    return json(res, 200, { users: rows.map((r) => userView(req, r)) }), true;
  }

  if (path === '/api/users' && req.method === 'POST') {
    const d = await body(req);
    const name = str(d.name) || '未命名';
    const limitGb = d.traffic_limit_gb;
    const trafficLimit = limitGb === '' || limitGb == null ? null : Math.round(Number(limitGb) * L.GB);
    const uuid = L.uuid();
    const subToken = L.randomToken(12);
    const info = db
      .prepare(
        `INSERT INTO users (name, uuid, sub_token, expires_at, traffic_limit, speed_limit, device_limit, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(name, uuid, subToken, dateToTs(d.expires_date), trafficLimit, int(d.speed_limit), int(d.device_limit), now());
    const row = db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid);
    return json(res, 200, userView(req, row)), true;
  }

  const userIdMatch = path.match(/^\/api\/users\/(\d+)$/);
  if (userIdMatch) {
    const id = Number(userIdMatch[1]);
    const row = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
    if (!row) return json(res, 404, { error: '用户不存在' }), true;

    if (req.method === 'PUT') {
      const d = await body(req);
      const limitGb = d.traffic_limit_gb;
      const trafficLimit = limitGb === '' || limitGb == null ? null : Math.round(Number(limitGb) * L.GB);
      db.prepare(
        `UPDATE users SET name = ?, expires_at = ?, traffic_limit = ?, speed_limit = ?, device_limit = ?, banned = ? WHERE id = ?`
      ).run(
        str(d.name) || row.name,
        dateToTs(d.expires_date),
        trafficLimit,
        int(d.speed_limit),
        int(d.device_limit),
        d.banned ? 1 : 0,
        id
      );
      return json(res, 200, userView(req, db.prepare('SELECT * FROM users WHERE id = ?').get(id))), true;
    }

    if (req.method === 'DELETE') {
      db.prepare('DELETE FROM users WHERE id = ?').run(id);
      return json(res, 200, { ok: true }), true;
    }
  }

  const resetTraffic = path.match(/^\/api\/users\/(\d+)\/reset-traffic$/);
  if (resetTraffic && req.method === 'POST') {
    db.prepare('UPDATE users SET up = 0, down = 0 WHERE id = ?').run(Number(resetTraffic[1]));
    return json(res, 200, { ok: true }), true;
  }

  const resetSub = path.match(/^\/api\/users\/(\d+)\/reset-sub$/);
  if (resetSub && req.method === 'POST') {
    const id = Number(resetSub[1]);
    const token = L.randomToken(12);
    db.prepare('UPDATE users SET sub_token = ? WHERE id = ?').run(token, id);
    const row = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
    return json(res, 200, userView(req, row)), true;
  }

  /* ---- 设置与模板 ---- */
  if (path === '/api/settings' && req.method === 'GET') {
    const s = getAllSettings();
    delete s.admin_pass;
    return json(res, 200, s), true;
  }

  if (path === '/api/settings' && req.method === 'PUT') {
    const d = await body(req);
    const keys = ['panel_url', 'sub_name', 'push_interval', 'pull_interval'];
    for (const k of keys) if (k in d) setSetting(k, str(d[k], 2000));
    return json(res, 200, { ok: true }), true;
  }

  if (path === '/api/template' && req.method === 'GET') {
    const custom = getSetting('clash_template', '');
    const isDefault = !custom.trim();
    return json(res, 200, { content: isDefault ? require('./subscribe').defaultTemplate() : custom, isDefault }), true;
  }

  if (path === '/api/template' && req.method === 'PUT') {
    const d = await body(req);
    setSetting('clash_template', String(d.content ?? ''));
    return json(res, 200, { ok: true }), true;
  }

  return json(res, 404, { error: 'not found' }), true;
}

function init() {
  ensureDefaults();
  ensureAdmin();
}

module.exports = { handle, init, hashPassword, verifyPassword, currentUser };
