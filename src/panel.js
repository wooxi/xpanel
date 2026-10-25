'use strict';

const zlib = require('node:zlib');
const { db, now, getSetting } = require('./db');
const L = require('./lib');
const sub = require('./subscribe');
const logs = require('./logs');

/** uid -> Map(ip -> 最后上报时间) */
const aliveMap = new Map();
const ALIVE_TTL = 10 * 60;

/** nodeId -> 上次写「同步」日志的时间戳，用于给 nodex 轮询去重 */
const syncLogAt = new Map();
const SYNC_LOG_GAP = 10 * 60;

function clientIp(req) {
  const xf = String((req.headers && req.headers['x-forwarded-for']) || '').split(',')[0].trim();
  return xf || (req.socket && req.socket.remoteAddress) || '';
}

function logNodeSync(node, req) {
  const t = now();
  if (t - (syncLogAt.get(node.id) || 0) < SYNC_LOG_GAP) return;
  syncLogAt.set(node.id, t);
  logs.add({
    level: 'info',
    source: 'node',
    action: 'sync',
    message: `节点「${node.name}」拉取配置`,
    meta: { node_id: node.id, type: node.type, host: node.host, port: node.port },
    ip: clientIp(req),
  });
}

function aliveOf(uid) {
  const m = aliveMap.get(uid);
  if (!m) return [];
  const cutoff = now() - ALIVE_TTL;
  return [...m.entries()].filter(([, ts]) => ts >= cutoff).map(([ip]) => ip);
}

function recordAlive(uid, ips) {
  let m = aliveMap.get(uid);
  if (!m) aliveMap.set(uid, (m = new Map()));
  const ts = now();
  for (const ip of ips) m.set(String(ip), ts);
  db.prepare('UPDATE users SET last_online_at = ? WHERE id = ?').run(ts, uid);
}

function findNode(token) {
  if (!token) return null;
  return db.prepare('SELECT * FROM nodes WHERE token = ?').get(token) || null;
}

function availableUsers() {
  const ts = now();
  return db
    .prepare(
      `SELECT id, uuid, speed_limit, device_limit FROM users
       WHERE banned = 0
         AND (expires_at IS NULL OR expires_at > ?)
         AND (traffic_limit IS NULL OR up + down < traffic_limit)
       ORDER BY id ASC`
    )
    .all(ts);
}

function buildNodeConfig(node) {
  const push = Number(getSetting('push_interval', '60')) || 60;
  const pull = Number(getSetting('pull_interval', '60')) || 60;
  return {
    protocol: 'hysteria',
    listen_ip: '0.0.0.0',
    server_port: Number(node.port),
    network: null,
    networkSettings: null,
    version: 2,
    host: node.host,
    server_name: node.sni || undefined,
    tls_settings: {
      server_name: node.sni || node.host,
      allow_insecure: !!node.insecure,
    },
    up_mbps: Number(node.up_mbps) || 0,
    down_mbps: Number(node.down_mbps) || 0,
    obfs: node.obfs ? 'salamander' : null,
    'obfs-password': node.obfs ? node.obfs_password || null : null,
    base_config: { push_interval: push, pull_interval: pull },
  };
}

function json(res, status, payload, headers = {}) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
    ...headers,
  });
  res.end(body);
}

function fail(res, status, message) {
  json(res, status, { status: 'fail', message });
}

function readBody(req, limit = 1 << 20) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) {
        reject(new Error('body too large'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

async function parseJson(req) {
  const raw = await readBody(req);
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/** UniProxy 路由，返回 true 表示已处理 */
async function handle(req, res, url) {
  const prefix = '/api/v1/server/UniProxy';
  if (!url.pathname.startsWith(prefix)) return false;

  const action = url.pathname.slice(prefix.length).replace(/^\//, '');
  const token = url.searchParams.get('token');
  const node = findNode(token);
  if (!node) {
    fail(res, 403, 'invalid token');
    return true;
  }

  const nodeIdParam = url.searchParams.get('node_id');
  if (nodeIdParam && Number(nodeIdParam) !== node.id) {
    fail(res, 403, 'node_id mismatch');
    return true;
  }

  if (req.method === 'GET' && action === 'config') {
    node.last_report_at = now();
    db.prepare('UPDATE nodes SET last_report_at = ? WHERE id = ?').run(node.last_report_at, node.id);
    logNodeSync(node, req);
    json(res, 200, buildNodeConfig(node));
    return true;
  }

  if (req.method === 'GET' && action === 'user') {
    const users = availableUsers();
    const payload = JSON.stringify({ users });
    const etag = `"${require('node:crypto').createHash('sha1').update(payload).digest('hex')}"`;
    if (req.headers['if-none-match'] === etag) {
      res.writeHead(304, { etag });
      res.end();
      return true;
    }
    json(res, 200, { users }, { etag });
    return true;
  }

  if (req.method === 'POST' && action === 'push') {
    const data = await parseJson(req);
    if (!data || typeof data !== 'object') return fail(res, 422, 'invalid data'), true;

    const update = db.prepare('UPDATE users SET up = up + ?, down = down + ? WHERE id = ?');
    const daily = db.prepare(
      `INSERT INTO traffic_daily (uid, node_id, day, up, down) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(uid, node_id, day) DO UPDATE SET up = up + excluded.up, down = down + excluded.down`
    );
    const day = L.localDay();
    const ts = now();

    const tx = db.transaction((rows) => {
      for (const [uid, pair] of rows) {
        if (!Array.isArray(pair) || pair.length !== 2) continue;
        const up = Number(pair[0]) || 0;
        const down = Number(pair[1]) || 0;
        if (up < 0 || down < 0) continue;
        update.run(up, down, Number(uid));
        daily.run(Number(uid), node.id, day, up, down);
      }
    });
    tx(Object.entries(data));

    db.prepare('UPDATE nodes SET last_report_at = ? WHERE id = ?').run(ts, node.id);
    json(res, 200, { data: true });
    return true;
  }

  if (req.method === 'POST' && action === 'alive') {
    const data = await parseJson(req);
    if (!data || typeof data !== 'object') return fail(res, 422, 'invalid data'), true;
    for (const [uid, ips] of Object.entries(data)) {
      if (Array.isArray(ips)) recordAlive(Number(uid), ips);
    }
    json(res, 200, { data: true });
    return true;
  }

  if (req.method === 'GET' && action === 'alivelist') {
    const out = {};
    for (const u of availableUsers()) {
      if (u.device_limit > 0) out[u.id] = aliveOf(u.id);
    }
    json(res, 200, { alive: out });
    return true;
  }

  if (req.method === 'POST' && action === 'status') {
    const data = await parseJson(req);
    const ts = now();
    const text = data && typeof data === 'object' ? JSON.stringify(data).slice(0, 2000) : '';
    db.prepare('UPDATE nodes SET last_report_at = ?, last_status = ? WHERE id = ?').run(ts, text, node.id);
    json(res, 200, { data: true, code: 0, message: 'success' });
    return true;
  }

  fail(res, 404, 'unknown action');
  return true;
}

function sendRaw(res, status, contentType, body, extra = {}) {
  let buf = Buffer.isBuffer(body) ? body : Buffer.from(body, 'utf8');
  const headers = { 'content-type': contentType, ...extra };
  const ae = String((res.req && res.req.headers['accept-encoding']) || '');
  if (buf.length >= 1024 && /\bgzip\b/.test(ae)) {
    buf = zlib.gzipSync(buf);
    headers['content-encoding'] = 'gzip';
    headers.vary = 'Accept-Encoding';
  }
  headers['content-length'] = buf.length;
  res.writeHead(status, headers);
  res.end(buf);
}

/** 订阅与单节点链接，返回 true 表示已处理 */
function handleSubscribe(req, res, url) {
  const subMatch = url.pathname.match(/^\/sub\/([A-Za-z0-9]+)\/?$/);
  if (subMatch) {
    const user = db.prepare('SELECT * FROM users WHERE sub_token = ?').get(subMatch[1]);
    if (!user) return sendRaw(res, 404, 'text/plain; charset=utf-8', 'subscription not found'), true;

    const flag = (url.searchParams.get('flag') || '').toLowerCase();
    const format = ['clash', 'rocket', 'general'].includes(flag) ? flag : L.detectFormat(req.headers['user-agent']);
    const nodes = L.isActive(user) ? sub.activeNodes(user.id) : [];
    logs.add({
      level: L.isActive(user) ? 'info' : 'warn',
      source: 'sub',
      action: 'subscribe',
      message: L.isActive(user)
        ? `${user.name} 获取订阅`
        : `${user.name} 获取订阅被拒：${sub.unavailableReason(user)}`,
      meta: {
        uid: user.id,
        format,
        nodes: nodes.length,
        ua: String(req.headers['user-agent'] || '').slice(0, 120),
      },
      ip: clientIp(req),
    });
    const headers = {
      'profile-update-interval': '12',
      'subscription-userinfo': L.userInfoHeader(user),
      'cache-control': 'no-store',
    };

    if (format === 'clash') {
      const body = sub.renderClash(user, nodes);
      return sendRaw(res, 200, 'text/yaml; charset=utf-8', body, headers), true;
    }
    const body = format === 'rocket' ? sub.renderRocket(user, nodes) : sub.renderGeneral(user, nodes);
    return sendRaw(res, 200, 'text/plain; charset=utf-8', body, headers), true;
  }

  const linkMatch = url.pathname.match(/^\/link\/([A-Za-z0-9]+)\/(\d+)$/);
  if (linkMatch) {
    const user = db.prepare('SELECT * FROM users WHERE sub_token = ?').get(linkMatch[1]);
    if (!user) return sendRaw(res, 404, 'text/plain; charset=utf-8', 'not found'), true;
    if (!L.isActive(user)) return sendRaw(res, 403, 'text/plain; charset=utf-8', sub.unavailableReason(user)), true;
    const node = db.prepare('SELECT * FROM nodes WHERE id = ? AND enabled = 1').get(Number(linkMatch[2]));
    if (!node) return sendRaw(res, 404, 'text/plain; charset=utf-8', 'node not found'), true;
    return sendRaw(res, 200, 'text/plain; charset=utf-8', L.hysteria2Link(user, node)), true;
  }

  return false;
}

module.exports = { handle, handleSubscribe, aliveMap, aliveOf, findNode };
