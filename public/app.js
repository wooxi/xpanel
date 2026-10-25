'use strict';

/* xpanel 控制台前端
   ---------------------------------------------------------------
   无构建、无依赖，单文件渲染所有视图。
   */

const state = {
  user: '',
  base: '',
  nodes: [],
  users: [],
  view: 'dashboard',
  userQuery: '',
  userFilter: 'all',
};

const el = (id) => document.getElementById(id);
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

const PAGE_META = {
  dashboard: '仪表盘',
  nodes: '节点',
  users: '用户',
  logs: '日志',
  settings: '设置',
};

/* ───────────────────────── 基础工具 ───────────────────────── */

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

async function api(path, options = {}) {
  const res = await fetch(path, {
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json' },
    ...options,
  });
  const text = await res.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch { data = { error: text }; }
  if (!res.ok) {
    if (res.status === 401 && !path.startsWith('/api/login')) showLogin();
    throw new Error(data.error || `请求失败 (${res.status})`);
  }
  return data;
}

/* 字节格式化，自动选择单位 */
function fmtBytes(bytes) {
  const n = Number(bytes) || 0;
  if (n <= 0) return { v: '0', u: 'B' };
  const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
  let i = 0;
  let v = n;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i += 1; }
  let digits = 0;
  if (v < 10) digits = 2;
  else if (v < 100) digits = 1;
  return { v: v.toFixed(digits), u: units[i] };
}

function fmtGb(gb) {
  if (gb == null) return null;
  return fmtNumber(Number(gb) * 1024 * 1024 * 1024);
}

function fmtNumber(bytes) {
  const n = Number(bytes) || 0;
  const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
  let i = 0;
  let v = n;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i += 1; }
  if (i <= 1) return `${Math.round(v)}${units[i]}`;
  if (v < 10) return `${v.toFixed(2)}${units[i]}`;
  if (v < 100) return `${v.toFixed(1)}${units[i]}`;
  return `${Math.round(v)}${units[i]}`;
}

function fmtTime(ts) {
  if (!ts) return '—';
  return new Date(ts * 1000).toLocaleString('zh-CN', { hour12: false });
}

function relTime(ts) {
  if (!ts) return '从未上报';
  const diff = Math.floor(Date.now() / 1000) - Number(ts);
  if (diff < 0) return '刚刚';
  if (diff < 60) return `${diff} 秒前`;
  if (diff < 3600) return `${Math.floor(diff / 60)} 分钟前`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} 小时前`;
  return `${Math.floor(diff / 86400)} 天前`;
}

function daysLeft(dateStr) {
  if (!dateStr) return null;
  const target = new Date(`${dateStr}T23:59:59`);
  if (Number.isNaN(target.getTime())) return null;
  return Math.ceil((target.getTime() - Date.now()) / 86400000);
}

/* 剩余时长的口语化描述：大数字换成月/年，避免出现「剩余 8833 天」这类噪音 */
function fmtRemain(days) {
  if (days == null) return '长期有效';
  if (days < 0) return `已过期 ${Math.abs(days)} 天`;
  if (days === 0) return '今天到期';
  if (days === 1) return '明天到期';
  if (days < 31) return `剩余 ${days} 天`;
  if (days < 365) return `剩余 ${Math.round(days / 30)} 个月`;
  return `剩余 ${(days / 365).toFixed(days % 365 === 0 ? 0 : 1)} 年`;
}

function clampPct(n) {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, n));
}

function meterLevel(pct) {
  if (pct >= 90) return 'lv-danger';
  if (pct >= 70) return 'lv-warn';
  return 'lv-ok';
}

/* 稳定色板：同一名字永远得到同一组颜色 */
const AVATAR_PALETTE = [
  ['#e8f1fd', '#1f5fd0'],
  ['#e6f6ea', '#1a7f37'],
  ['#fdf0e6', '#b54708'],
  ['#f6ecfd', '#8250df'],
  ['#e6f4f6', '#0e7490'],
  ['#fdeff2', '#be123c'],
  ['#eef0fb', '#4338ca'],
  ['#f3f4f6', '#374151'],
];

function avatarStyle(name) {
  let h = 0;
  const s = String(name || 'u');
  for (let i = 0; i < s.length; i += 1) h = (h * 31 + s.charCodeAt(i)) % 997;
  const [bg, fg] = AVATAR_PALETTE[h % AVATAR_PALETTE.length];
  return `background:${bg};color:${fg}`;
}

function initials(name) {
  const s = String(name || '?').trim();
  if (!s) return '?';
  const ch = s[0];
  return /[\u4e00-\u9fff]/.test(ch) ? ch : ch.toUpperCase();
}

/* ───────────────────────── Toast ───────────────────────── */

const TOAST_ICONS = {
  ok: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>',
  err: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 8v4.5M12 16h.01"/></svg>',
  info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/></svg>',
};

function toast(msg, kind = 'ok') {
  const box = el('toast');
  const node = document.createElement('div');
  node.className = `toast ${kind}`;
  node.innerHTML = `${TOAST_ICONS[kind] || TOAST_ICONS.info}<span>${esc(msg)}</span>`;
  box.appendChild(node);
  setTimeout(() => {
    node.classList.add('leave');
    setTimeout(() => node.remove(), 200);
  }, 2600);
}

/* ───────────────────────── 弹窗 ───────────────────────── */

let modalResolver = null;

function openModal(title, bodyHtml, footButtons, opts = {}) {
  el('modal-title').textContent = title;
  el('modal-body').innerHTML = bodyHtml;
  const card = $('.modal-card');
  card.classList.toggle('wide', !!opts.wide);

  const foot = el('modal-foot');
  foot.innerHTML = '';
  for (const b of footButtons || []) {
    const btn = document.createElement('button');
    btn.className = `btn ${b.kind === 'primary' ? 'btn-primary' : b.kind === 'danger' ? 'btn-danger' : ''}`.trim();
    btn.textContent = b.label;
    btn.onclick = b.onClick;
    foot.appendChild(btn);
  }

  el('modal').hidden = false;
  if (opts.focus) setTimeout(() => el(opts.focus)?.focus(), 30);
}

function closeModal() {
  el('modal').hidden = true;
  el('modal-body').innerHTML = '';
  el('modal-foot').innerHTML = '';
  if (modalResolver) { modalResolver(false); modalResolver = null; }
}

/* 替代原生 confirm */
function confirmDialog({ title, message, confirmText = '确认删除', danger = true }) {
  return new Promise((resolve) => {
    modalResolver = resolve;
    openModal(
      title,
      `<p>${esc(message)}</p>`,
      [
        { label: '取消', onClick: () => { modalResolver = null; resolve(false); closeModal(); } },
        {
          label: confirmText,
          kind: danger ? 'danger' : 'primary',
          onClick: () => { modalResolver = null; resolve(true); closeModal(); },
        },
      ]
    );
  });
}

function copyText(text) {
  const done = () => toast('已复制到剪贴板');
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(text).then(done).catch(() => fallbackCopy(text, done));
  } else {
    fallbackCopy(text, done);
  }
}

function fallbackCopy(text, done) {
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.cssText = 'position:fixed;opacity:0;top:-1000px';
  document.body.appendChild(ta);
  ta.select();
  try { document.execCommand('copy'); done(); } catch { toast('复制失败，请手动选择', 'err'); }
  ta.remove();
}

/* ───────────────────────── 视图切换 ───────────────────────── */

function showLogin() {
  document.body.classList.remove('booting');
  el('app').hidden = true;
  el('login').hidden = false;
}

function showApp() {
  document.body.classList.remove('booting');
  el('login').hidden = true;
  el('app').hidden = false;
  el('who').textContent = state.user;
  el('who-avatar').textContent = initials(state.user);
}

function switchView(view) {
  state.view = view;
  el('page-title').textContent = PAGE_META[view] || '';

  $$('.nav-item').forEach((n) => n.classList.toggle('active', n.dataset.view === view));
  $$('.view').forEach((v) => { v.hidden = v.id !== `view-${view}`; });

  renderView(view);
}

function renderView(view) {
  if (view === 'dashboard') renderDashboard();
  if (view === 'nodes') renderNodes();
  if (view === 'users') renderUsers();
  if (view === 'logs') renderLogs();
  if (view === 'settings') renderSettings();
}

/* ───────────────────────── 仪表盘 ───────────────────────── */

const KPI_ICONS = {
  node: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="6.4" rx="2.2"/><rect x="3" y="13.6" width="18" height="6.4" rx="2.2"/><path d="M6.6 7.2h.01M9.8 7.2h.01M6.6 16.8h.01M9.8 16.8h.01"/></svg>',
  user: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8.2" r="3.9"/><path d="M4.9 20.4c0-3.55 3.18-5.9 7.1-5.9s7.1 2.35 7.1 5.9"/></svg>',
  flow: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M3.6 16.6 8.4 11l4 3.5 3.5-4.3 4.5 5.4"/><path d="M3.6 20.4h16.8"/></svg>',
  total: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="12" cy="6.4" rx="7.3" ry="2.8"/><path d="M4.7 6.4v5.3c0 1.55 3.27 2.8 7.3 2.8s7.3-1.25 7.3-2.8V6.4"/><path d="M4.7 11.7v5.3c0 1.55 3.27 2.8 7.3 2.8s7.3-1.25 7.3-2.8v-5.3"/></svg>',
};

function kpiCard({ icon, tone, label, value, unit, sub }) {
  return `
    <div class="kpi">
      <div class="kpi-top">
        <span class="kpi-icon ${tone ? `i-${tone}` : ''}">${icon}</span>
        <span class="kpi-label">${esc(label)}</span>
      </div>
      <div class="kpi-value"><span>${esc(value)}</span>${unit ? `<span class="kpi-unit">${esc(unit)}</span>` : ''}</div>
      ${sub ? `<div class="kpi-sub">${sub}</div>` : ''}
    </div>`;
}

async function renderDashboard() {
  const [d, n] = await Promise.all([api('/api/overview'), api('/api/nodes')]);
  state.nodes = n.nodes || [];

  const online = state.nodes.filter((x) => x.enabled && x.online).length;
  const enabled = state.nodes.filter((x) => x.enabled).length;
  const today = fmtBytes(d.traffic_today);
  const total = fmtBytes(d.traffic_total);

  el('cards').innerHTML = [
    kpiCard({
      icon: KPI_ICONS.node, tone: enabled && online === enabled ? 'ok' : 'warn',
      label: '可用节点',
      value: String(enabled),
      unit: '个',
      sub: `<b class="${online ? '' : 'sub-warn'}">${online}</b> / ${d.nodes} 在线`,
    }),
    kpiCard({
      icon: KPI_ICONS.user, tone: 'brand',
      label: '活跃用户',
      value: String(d.users_active),
      unit: '人',
      sub: `${d.users} 个账号`,
    }),
    kpiCard({
      icon: KPI_ICONS.flow,
      label: '今日流量',
      value: today.v,
      unit: today.u,
    }),
    kpiCard({
      icon: KPI_ICONS.total,
      label: '累计流量',
      value: total.v,
      unit: total.u,
    }),
  ].join('');

  /* 节点状态 */
  const nodeBox = el('dash-nodes');
  if (!state.nodes.length) {
    nodeBox.innerHTML = emptyState({
      title: '还没有节点',
      action: '<button class="btn btn-sm" data-jump="nodes">去添加节点</button>',
    });
  } else {
    nodeBox.innerHTML = `<div class="list-body">${state.nodes.map((x) => {
      const tag = !x.enabled
        ? '<span class="tag tag-idle"><i class="tag-dot"></i>已停用</span>'
        : x.online
          ? '<span class="tag tag-ok"><i class="tag-dot"></i>在线</span>'
          : '<span class="tag tag-warn"><i class="tag-dot"></i>待上报</span>';
      const cap = x.up_mbps || x.down_mbps
        ? `${x.up_mbps || '∞'}/${x.down_mbps || '∞'} Mbps`
        : '不限速';
      const parts = [`${esc(x.host)}:${esc(x.port)}`];
      if (x.sni) parts.push(esc(x.sni));
      parts.push(cap);
      return `
        <div class="list-row">
          <div class="list-main">
            <div class="list-title">
              ${esc(x.name)}
              <span class="proto">HY2${esc(x.obfs ? ' + ' + x.obfs : '')}</span>
            </div>
            <div class="list-meta">${parts.join(' · ')}</div>
          </div>
          <div class="list-side">${tag}
            <div class="s">${x.last_report_at ? relTime(x.last_report_at) : '从未上报'}</div>
          </div>
        </div>`;
    }).join('')}</div>`;
  }

  /* 用户流量 */
  const totalTraffic = fmtBytes(d.traffic_total);
  el('dash-stats').innerHTML = `
    <div><span>账号</span><b>${d.users}</b></div>
    <div><span>活跃</span><b>${d.users_active}</b></div>
    <div><span>累计流量</span><b>${totalTraffic.v}<small>${totalTraffic.u}</small></b></div>`;

  const userBox = el('dash-users');
  let list = Array.isArray(n.users) ? [...n.users] : [];
  if (!list.length) {
    const u = await api('/api/users');
    state.users = u.users || [];
    list = [...state.users];
  }
  const sorted = list.filter((u) => Number(u.used_gb) > 0).sort((a, b) => b.used_gb - a.used_gb).slice(0, 6);

  if (!sorted.length) {
    userBox.innerHTML = emptyState({
      title: '暂无流量记录',
    });
  } else {
    userBox.innerHTML = `<div class="list-body">${sorted.map((u) => {
      const used = Number(u.used_gb) || 0;
      const limit = u.traffic_limit_gb == null ? null : Number(u.traffic_limit_gb);
      const pct = limit ? clampPct((used / limit) * 100) : 0;
      return `
        <div class="list-row">
          <div class="list-main">
            <div class="list-title">${esc(u.name || '未命名')}</div>
            <div class="meter">
              ${limit
                ? `<div class="meter-track"><div class="meter-fill ${meterLevel(pct)}" style="width:${pct}%"></div></div>`
                : '<div class="meter-track" style="visibility:hidden"></div>'}
              <div class="meter-text">
                <span>${fmtGb(used)}</span>
                <span>${limit ? `上限 ${fmtGb(limit)}` : '不限量'}</span>
              </div>
            </div>
          </div>
        </div>`;
    }).join('')}</div>`;
  }

  renderTrend(d.trend || []);

  el('nav-node-count').textContent = String(d.nodes);
  el('nav-user-count').textContent = String(d.users);
}

function renderTrend(trend) {
  const box = el('trend-chart');
  const sum = el('trend-sum');
  const max = Math.max(...trend.map((t) => t.total), 0);
  const total = trend.reduce((acc, t) => acc + t.total, 0);
  const avg = trend.length ? total / trend.length : 0;

  sum.textContent = total > 0 ? `7 日均 ${fmtNumber(avg)}` : '暂无数据';

  if (!trend.length || max === 0) {
    box.innerHTML = emptyState({ title: '暂无流量记录' });
    return;
  }

  const todayStr = new Date().toISOString().slice(0, 10);
  box.innerHTML = `<div class="trend">${trend.map((t) => {
    const pct = t.total ? Math.max(1.5, (t.total / max) * 100) : 0;
    const [, mm, dd] = t.day.split('-');
    const isToday = t.day === todayStr;
    return `
      <div class="trend-col ${isToday ? 'is-today' : ''}" title="${t.day} · ${t.total ? fmtNumber(t.total) : '无流量'}">
        <div class="trend-v">${t.total ? fmtNumber(t.total) : '—'}</div>
        <div class="trend-track">${pct ? `<div class="trend-bar" style="height:${pct.toFixed(1)}%"></div>` : ''}</div>
        <div class="trend-x">${mm}-${dd}</div>
      </div>`;
  }).join('')}</div>`;
}

function emptyState({ title, desc, action = '' }) {
  return `
    <div class="empty">
      <div class="empty-icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="4.5" width="17" height="15" rx="2.5"/><path d="M8 10h8M8 14h5"/></svg>
      </div>
      <b>${esc(title)}</b>
      ${action}
    </div>`;
}

/* ───────────────────────── 节点 ───────────────────────── */

async function loadNodes() {
  const d = await api('/api/nodes');
  state.nodes = d.nodes || [];
  el('nav-node-count').textContent = String(state.nodes.length);
}

async function renderNodes() {
  await loadNodes();
  const box = el('node-list');
  const total = state.nodes.length;
  const online = state.nodes.filter((n) => n.enabled && n.online).length;
  const pending = state.nodes.filter((n) => n.enabled && !n.online).length;
  const disabled = state.nodes.filter((n) => !n.enabled).length;
  el('node-summary').innerHTML = total
    ? `<div class="statbar">
         <div class="statbar-item"><span class="statbar-k">节点</span><span class="statbar-v">${total}</span></div>
         <div class="statbar-item"><span class="statbar-k">在线</span><span class="statbar-v ${online ? 'v-ok' : ''}">${online}</span></div>
         <div class="statbar-item"><span class="statbar-k">待上报</span><span class="statbar-v ${pending ? 'v-warn' : ''}">${pending}</span></div>
         <div class="statbar-item"><span class="statbar-k">已停用</span><span class="statbar-v">${disabled}</span></div>
       </div>`
    : '<span class="summary-badge">尚未接入节点</span>';

  if (!state.nodes.length) {
    box.innerHTML = emptyState({
      title: '还没有节点',
      action: '<button class="btn btn-sm" data-jump="add-node-action">立即添加</button>',
    });
    return;
  }

  box.innerHTML = state.nodes.map((n) => {
    const offline = !n.enabled || !n.online;
    const status = !n.enabled
      ? '<span class="tag tag-idle"><i class="tag-dot"></i>已停用</span>'
      : n.online
        ? '<span class="tag tag-ok"><i class="tag-dot"></i>在线</span>'
        : '<span class="tag tag-warn"><i class="tag-dot"></i>待上报</span>';
    const rate = n.up_mbps || n.down_mbps
      ? `${n.up_mbps || 0} / ${n.down_mbps || 0} Mbps`
      : '未设置';
    return `
      <div class="node-card ${offline ? 'offline' : ''}">
        <div class="node-top">
          <div style="min-width:0">
            <div class="node-name" title="${esc(n.name)}">${esc(n.name)}</div>
            <div class="node-addr">${esc(n.host)}:${esc(n.port)}</div>
          </div>
          ${status}
        </div>
        <dl class="node-specs">
          <div class="node-spec"><dt>SNI</dt><dd title="${esc(n.sni || '')}">${esc(n.sni || '—')}</dd></div>
          <div class="node-spec"><dt>最后上报</dt><dd>${n.last_report_at ? relTime(n.last_report_at) : '从未'}</dd></div>
          <div class="node-spec"><dt>上行 / 下行</dt><dd>${esc(rate)}</dd></div>
          <div class="node-spec"><dt>混淆</dt><dd>${n.obfs ? 'salamander' : '关闭'}</dd></div>
        </dl>
        <div class="node-foot">
          <span class="mono" style="font-size:11px;color:var(--ink-4)">#${esc(n.id)}</span>
          <div class="node-actions">
            <button class="btn btn-sm btn-ghost" data-act="connect" data-id="${n.id}">对接</button>
            <button class="btn btn-sm btn-ghost" data-act="edit-node" data-id="${n.id}">编辑</button>
            <button class="btn btn-sm btn-ghost" data-act="del-node" data-id="${n.id}" style="color:var(--danger)">删除</button>
          </div>
        </div>
      </div>`;
  }).join('');

  box.querySelectorAll('button[data-act]').forEach((btn) => {
    const node = state.nodes.find((x) => x.id === Number(btn.dataset.id));
    btn.onclick = () => {
      if (btn.dataset.act === 'edit-node') nodeForm(node);
      if (btn.dataset.act === 'del-node') delNode(node);
      if (btn.dataset.act === 'connect') connectInfo(node);
    };
  });
}

function nodeForm(node) {
  const n = node || {};
  openModal(
    node ? `编辑节点 · ${n.name}` : '添加节点',
    `<label class="field">
       <span class="field-label">节点名称</span>
       <input type="text" id="f-name" value="${esc(n.name || '')}" placeholder="日本 · 大阪 01" />
     </label>
     <div class="field-row">
       <label class="field"><span class="field-label">服务器地址</span><input type="text" id="f-host" value="${esc(n.host || '')}" placeholder="1.2.3.4 或 node.example.com" /></label>
       <label class="field"><span class="field-label">端口</span><input id="f-port" type="number" value="${esc(n.port || 443)}" /></label>
     </div>
     <label class="field">
       <span class="field-label">SNI / 域名</span>
       <input type="text" id="f-sni" value="${esc(n.sni || '')}" placeholder="browser.yourdomain.com" />
     </label>
     <div class="field-row">
       <label class="field"><span class="field-label">上行 Mbps</span><input id="f-up" type="number" value="${esc(n.up_mbps || '')}" placeholder="0" /></label>
       <label class="field"><span class="field-label">下行 Mbps</span><input id="f-down" type="number" value="${esc(n.down_mbps || '')}" placeholder="0" /></label>
     </div>
     <div class="field-row">
       <label class="field"><span class="field-label">混淆</span>
         <select id="f-obfs"><option value="">关闭</option><option value="1" ${n.obfs ? 'selected' : ''}>salamander</option></select>
       </label>
       <label class="field"><span class="field-label">混淆密码</span><input type="text" id="f-obfs-pass" value="${esc(n.obfs_password || '')}" placeholder="可选" /></label>
     </div>
     <div class="field-row">
       <label class="field"><span class="field-label">跳过证书校验</span>
         <select id="f-insecure"><option value="0">否</option><option value="1" ${n.insecure ? 'selected' : ''}>是</option></select>
       </label>
       <label class="field"><span class="field-label">启用状态</span>
         <select id="f-enabled"><option value="1">启用</option><option value="0" ${n.enabled === 0 ? 'selected' : ''}>停用</option></select>
       </label>
     </div>`,
    [
      { label: '取消', onClick: closeModal },
      {
        label: node ? '保存修改' : '添加节点',
        kind: 'primary',
        onClick: async () => {
          const name = el('f-name').value.trim();
          const host = el('f-host').value.trim();
          if (!name || !host) { toast('节点名称与地址不能为空', 'err'); return; }
          const payload = {
            name,
            host,
            port: Number(el('f-port').value) || 443,
            sni: el('f-sni').value.trim(),
            up_mbps: Number(el('f-up').value) || 0,
            down_mbps: Number(el('f-down').value) || 0,
            obfs: el('f-obfs').value === '1',
            obfs_password: el('f-obfs-pass').value.trim(),
            insecure: el('f-insecure').value === '1',
            enabled: el('f-enabled').value === '1',
          };
          try {
            if (node) await api(`/api/nodes/${node.id}`, { method: 'PUT', body: JSON.stringify(payload) });
            else await api('/api/nodes', { method: 'POST', body: JSON.stringify(payload) });
            closeModal();
            toast(node ? '节点已更新' : '节点已添加');
            renderNodes();
          } catch (e) { toast(e.message, 'err'); }
        },
      },
    ],
    { focus: 'f-name' }
  );
}

async function delNode(node) {
  const ok = await confirmDialog({
    title: '删除节点',
    message: `删除「${node.name}」后，订阅配置会立即移除该节点，NodeX 侧也会停止上报。此操作不可撤销。`,
  });
  if (!ok) return;
  try {
    await api(`/api/nodes/${node.id}`, { method: 'DELETE' });
    toast('节点已删除');
    renderNodes();
  } catch (e) { toast(e.message, 'err'); }
}

function baseIsPrivate(url) {
  const host = String(url).replace(/^https?:\/\//, '').split('/')[0].split(':')[0];
  return (
    host === 'localhost' ||
    /^127\./.test(host) ||
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
    /^169\.254\./.test(host)
  );
}

function connectInfo(node) {
  const base = state.base.replace(/\/$/, '');
  const row = (label, value) => `
    <div class="field">
      <span class="field-label">${esc(label)}</span>
      <div style="display:flex;gap:6px">
        <input type="text" readonly value="${esc(value)}" class="mono" style="font-size:12px;flex:1;min-width:0" />
        <button class="btn btn-sm" data-copy="${esc(value)}" style="flex:none">复制</button>
      </div>
    </div>`;

  openModal(
    `对接 NodeX · ${node.name}`,
    `<p style="margin-bottom:14px;color:var(--ink-3)">在 NodeX 的节点配置里填入以下三项，保存后节点会自动拉取用户与配置。</p>
     ${row('面板地址', `${base}/api/v1/server/UniProxy`)}
     ${row('对接密钥', node.token)}
     ${row('节点 ID', String(node.id))}
     ${baseIsPrivate(base) ? `<div class="note note-warn" style="margin-bottom:10px">
       <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M12 4.5 21 19.5H3z"/><path d="M12 10v4M12 17h.01"/></svg>
       <span>当前面板地址是内网 IP。若节点部署在公网，请先到「设置 → 面板公开地址」改成节点能访问的域名或公网地址，否则节点会连不上。</span>
     </div>` : ''}
     <div class="note" style="margin-top:4px">
       <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 16v-4.5M12 8h.01"/></svg>
       <span>NodeX 的「节点类型」留空即可；拉取与上报间隔由面板下发，默认 60 秒。</span>
     </div>`,
    [{ label: '关闭', onClick: closeModal }],
    { wide: true }
  );
  el('modal-body').querySelectorAll('[data-copy]').forEach((b) => {
    b.onclick = () => copyText(b.dataset.copy);
  });
}

/* ───────────────────────── 用户 ───────────────────────── */

async function loadUsers() {
  const d = await api('/api/users');
  state.users = d.users || [];
  el('nav-user-count').textContent = String(state.users.length);
}

function userStatus(u) {
  if (u.banned) return { cls: 'tag-danger', text: '停用' };
  const dl = daysLeft(u.expires_date);
  if (dl != null && dl < 0) return { cls: 'tag-danger', text: '已过期' };
  if (u.traffic_limit_gb != null && Number(u.used_gb) >= Number(u.traffic_limit_gb)) {
    return { cls: 'tag-warn', text: '已超量' };
  }
  return { cls: 'tag-ok', text: '正常' };
}

function filteredUsers() {
  const q = state.userQuery.trim().toLowerCase();
  return state.users.filter((u) => {
    if (state.userFilter === 'active' && userStatus(u).text !== '正常') return false;
    if (state.userFilter === 'expired' && userStatus(u).text === '正常') return false;
    if (!q) return true;
    return String(u.name || '').toLowerCase().includes(q)
      || String(u.uuid || '').toLowerCase().includes(q);
  });
}

async function renderUsers() {
  await loadUsers();
  const box = el('user-list');
  const rows = filteredUsers();

  if (!state.users.length) {
    box.innerHTML = emptyState({
      title: '还没有用户',
      action: '<button class="btn btn-sm" data-jump="add-user-action">立即添加</button>',
    });
    return;
  }

  if (!rows.length) {
    box.innerHTML = emptyState({ title: '没有匹配的用户' });
    return;
  }

  box.innerHTML = `<div class="table-responsive"><table class="table">
    <thead>
      <tr>
        <th style="width:32%">用户</th>
        <th style="width:24%">流量</th>
        <th style="width:14%">到期</th>
        <th style="width:16%">限制</th>
        <th style="width:8%">状态</th>
        <th class="col-actions" style="width:1%">操作</th>
      </tr>
    </thead>
    <tbody>
      ${rows.map((u) => {
        const used = Number(u.used_gb) || 0;
        const limit = u.traffic_limit_gb == null ? null : Number(u.traffic_limit_gb);
        const pct = limit ? clampPct((used / limit) * 100) : 0;
        const st = userStatus(u);
        const dl = daysLeft(u.expires_date);
        const expSub = u.expires_date ? fmtRemain(dl) : '';
        const limits = [];
        if (u.speed_limit) limits.push(`${u.speed_limit} Mbps`);
        limits.push(u.device_limit ? `${u.device_limit} 台设备` : '不限设备');
        return `
          <tr>
            <td>
              <div class="cell-user">
                <span class="u-avatar" style="${avatarStyle(u.name)}">${esc(initials(u.name))}</span>
                <div class="cell-user-text">
                  <b title="${esc(u.name)}">${esc(u.name || '未命名')}</b>
                  <small class="mono" title="${esc(u.uuid)}">${esc(u.uuid || '')}</small>
                </div>
              </div>
            </td>
            <td class="td-traffic">
              <div class="meter">
                ${limit
                  ? `<div class="meter-track"><div class="meter-fill ${meterLevel(pct)}" style="width:${pct}%"></div></div>`
                  : '<div class="meter-track" style="visibility:hidden"></div>'}
                <div class="meter-text">
                  <span>${fmtGb(used)}</span>
                  <span>${limit ? fmtGb(limit) : '不限量'}</span>
                </div>
              </div>
            </td>
            <td class="td-stack">
              <div class="a">${esc(u.expires_date || '不限期')}</div>
              <div class="b">${esc(expSub)}</div>
            </td>
            <td class="td-stack">
              <div class="a">${esc(limits[0])}</div>
              <div class="b">${esc(limits[1] || '')}</div>
            </td>
            <td><span class="tag ${st.cls}"><i class="tag-dot"></i>${esc(st.text)}</span></td>
            <td class="col-actions">
              <div class="row-actions">
                <button class="btn btn-sm btn-ghost" data-act="sub" data-id="${u.id}">订阅</button>
                <button class="btn btn-sm btn-ghost" data-act="edit-user" data-id="${u.id}">编辑</button>
                <button class="btn btn-sm btn-ghost" data-act="del-user" data-id="${u.id}" style="color:var(--danger)">删除</button>
              </div>
            </td>
          </tr>`;
      }).join('')}
    </tbody>
  </table></div>`;

  box.querySelectorAll('button[data-act]').forEach((btn) => {
    const user = state.users.find((x) => x.id === Number(btn.dataset.id));
    btn.onclick = () => {
      if (btn.dataset.act === 'sub') subInfo(user);
      if (btn.dataset.act === 'edit-user') userForm(user);
      if (btn.dataset.act === 'del-user') delUser(user);
    };
  });
}

function userForm(user) {
  const u = user || {};
  openModal(
    user ? `编辑用户 · ${u.name}` : '添加用户',
    `<label class="field">
       <span class="field-label">备注名</span>
       <input type="text" id="u-name" value="${esc(u.name || '')}" placeholder="朋友 A" />
     </label>
     <div class="field-row">
       <label class="field"><span class="field-label">到期日期</span><input id="u-expire" type="date" value="${esc(u.expires_date || '')}" />
       <label class="field"><span class="field-label">流量额度（GB）</span><input id="u-quota" type="number" step="0.1" min="0" value="${esc(u.traffic_limit_gb ?? '')}" placeholder="留空不限" />
     </div>
     <div class="field-row">
       <label class="field"><span class="field-label">限速（Mbps）</span><input id="u-speed" type="number" min="0" value="${esc(u.speed_limit || 0)}" />
       <label class="field"><span class="field-label">设备数</span><input id="u-device" type="number" min="0" value="${esc(u.device_limit || 0)}" />
     </div>
     <label class="field"><span class="field-label">账号状态</span>
       <select id="u-banned"><option value="0">正常</option><option value="1" ${u.banned ? 'selected' : ''}>停用</option></select>
     </label>`,
    [
      { label: '取消', onClick: closeModal },
      {
        label: user ? '保存修改' : '创建用户',
        kind: 'primary',
        onClick: async () => {
          const name = el('u-name').value.trim();
          if (!name) { toast('请填写备注名', 'err'); return; }
          const payload = {
            name,
            expires_date: el('u-expire').value,
            traffic_limit_gb: el('u-quota').value === '' ? null : Number(el('u-quota').value),
            speed_limit: Number(el('u-speed').value) || 0,
            device_limit: Number(el('u-device').value) || 0,
            banned: el('u-banned').value === '1',
          };
          try {
            if (user) await api(`/api/users/${user.id}`, { method: 'PUT', body: JSON.stringify(payload) });
            else await api('/api/users', { method: 'POST', body: JSON.stringify(payload) });
            closeModal();
            toast(user ? '用户已更新' : '用户已创建');
            renderUsers();
          } catch (e) { toast(e.message, 'err'); }
        },
      },
    ],
    { focus: 'u-name' }
  );
}

async function delUser(user) {
  const ok = await confirmDialog({
    title: '删除用户',
    message: `删除「${user.name}」后，其订阅链接会立即失效，已连接的客户端也无法再拉取配置。此操作不可撤销。`,
  });
  if (!ok) return;
  try {
    await api(`/api/users/${user.id}`, { method: 'DELETE' });
    toast('用户已删除');
    renderUsers();
  } catch (e) { toast(e.message, 'err'); }
}

function subInfo(user) {
  const base = state.base.replace(/\/$/, '');
  const subUrl = user.sub_url || `${base}/sub/${user.sub_token}`;
  const nodes = state.nodes.filter((n) => n.enabled);

  const row = (label, value) => `
    <div class="field">
      <span class="field-label">${esc(label)}</span>
      <div style="display:flex;gap:6px">
        <input type="text" readonly value="${esc(value)}" class="mono" style="font-size:12px;flex:1;min-width:0" />
        <button class="btn btn-sm" data-copy="${esc(value)}" style="flex:none">复制</button>
      </div>
    </div>`;

  openModal(
    `订阅 · ${user.name}`,
    `${row('订阅链接（自动识别客户端）', subUrl)}
     ${row('Clash 专用', `${subUrl}?flag=clash`)}
     <div class="field">
       <span class="field-label">单节点链接</span>
       <div class="link-list">
         ${nodes.length
           ? nodes.map((n) => {
             const url = `${base}/link/${user.sub_token}/${n.id}`;
             return `<div class="link-row">
               <span class="link-row-name">${esc(n.name)}</span>
               <code class="link-row-url" title="${esc(url)}">${esc(url)}</code>
               <button class="btn btn-sm btn-ghost" data-copy="${esc(url)}">复制</button>
             </div>`;
           }).join('')
           : '<div class="link-empty">暂无可用节点</div>'}
       </div>
     </div>
     <div class="row-actions" style="justify-content:flex-start;gap:6px;margin-top:2px">
       <button class="btn btn-sm" id="u-reset-traffic">重置已用流量</button>
       <button class="btn btn-sm" id="u-reset-sub" style="color:var(--danger)">更换订阅令牌</button>
     </div>
     <div class="note" style="margin-top:14px">
       <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 16v-4.5M12 8h.01"/></svg>
       <span>更换令牌后旧链接立即失效，需要重新分发。重置流量不会影响到期时间。</span>
     </div>`,
    [{ label: '关闭', onClick: closeModal }],
    { wide: true }
  );

  const body = el('modal-body');
  body.querySelectorAll('[data-copy]').forEach((b) => { b.onclick = () => copyText(b.dataset.copy); });

  el('u-reset-traffic').onclick = async () => {
    const ok = await confirmDialog({
      title: '重置流量',
      message: `将「${user.name}」的已用流量清零？此操作立即生效。`,
      confirmText: '重置',
      danger: false,
    });
    if (!ok) return;
    try {
      await api(`/api/users/${user.id}/reset-traffic`, { method: 'POST' });
      toast('流量已重置');
      renderUsers();
      subInfo({ ...user, used_gb: 0 });
    } catch (e) { toast(e.message, 'err'); }
  };

  el('u-reset-sub').onclick = async () => {
    const ok = await confirmDialog({
      title: '更换订阅令牌',
      message: '旧订阅链接会立即失效，需要重新分发给用户。',
      confirmText: '更换',
      danger: false,
    });
    if (!ok) return;
    try {
      const updated = await api(`/api/users/${user.id}/reset-sub`, { method: 'POST' });
      toast('订阅令牌已更换');
      renderUsers();
      subInfo({ ...user, ...updated });
    } catch (e) { toast(e.message, 'err'); }
  };
}

/* ───────────────────────── 模板编辑器 ───────────────────────── */

let tplEditorReady = false;

const VAR_RE = /\{\{[A-Z0-9_]+\}\}/g;

function hlValue(raw) {
  const v = String(raw);
  if (!v) return '';
  /* 规则行：DOMAIN-SUFFIX,a.com,PROXY —— 高亮末尾策略名 */
  if (/^[A-Z-]+(,[^,\s]+)+\s*$/.test(v.trim()) && !v.includes('{{')) {
    const segs = v.trim().split(',');
    return `${esc(segs.slice(0, -1).join(','))},<span class="tk-anchor">${esc(segs[segs.length - 1])}</span>`;
  }

  let out = '';
  let last = 0;
  let m;
  VAR_RE.lastIndex = 0;
  while ((m = VAR_RE.exec(v)) !== null) {
    out += hlScalar(v.slice(last, m.index));
    out += `<span class="tk-var">${esc(m[0])}</span>`;
    last = m.index + m[0].length;
  }
  out += hlScalar(v.slice(last));
  return out;
}

function hlScalar(text) {
  if (!text) return '';
  const t = text.trim();
  if (!t) return esc(text);
  if (/^-?\d+(\.\d+)?$/.test(t)) return `<span class="tk-num">${esc(text)}</span>`;
  if (/^(true|false|null|yes|no|on|off)$/i.test(t)) return `<span class="tk-bool">${esc(text)}</span>`;
  if (/^".*"$/.test(t) || /^'.*'$/.test(t)) return `<span class="tk-str">${esc(text)}</span>`;
  return esc(text);
}

function hlLine(line) {
  if (line === '') return '';
  const indent = (line.match(/^[ \t]*/) || [''])[0];
  let rest = line.slice(indent.length);
  let out = esc(indent);

  if (rest.startsWith('#')) return `${out}<span class="tk-com">${esc(rest)}</span>`;

  const dm = rest.match(/^-\s+/);
  if (dm) {
    out += '<span class="tk-dash">- </span>';
    rest = rest.slice(dm[0].length);
    if (rest.startsWith('#')) return `${out}<span class="tk-com">${esc(rest)}</span>`;
  }

  const km = rest.match(/^([A-Za-z0-9_.\-\u4e00-\u9fff]+)(\s*:)(\s*)([\s\S]*)$/);
  if (km) {
    return `${out}<span class="tk-key">${esc(km[1])}</span>${esc(km[2])}${esc(km[3])}${hlValue(km[4])}`;
  }
  return out + hlValue(rest);
}

function highlightYaml(src) {
  return src.split('\n').map(hlLine).join('\n');
}

function tplEditorInit() {
  const ta = el('set-template');
  const gutter = el('tpl-linenos');
  const hl = el('tpl-highlight');
  const stat = el('tpl-stat');
  const warn = el('tpl-warn');

  function paint() {
    const text = ta.value;
    const lines = text.split('\n');

    if (Number(gutter.dataset.lines) !== lines.length) {
      gutter.dataset.lines = lines.length;
      gutter.innerHTML = lines.map((_, i) => `<div>${i + 1}</div>`).join('');
    }
    hl.innerHTML = `${highlightYaml(text)}\n`;
    stat.textContent = `${lines.length} 行 · ${text.length} 字符`;

    if (text.includes('{{PROXIES}}')) {
      warn.textContent = '';
    } else {
      warn.textContent = '缺少 {{PROXIES}} 占位符，节点将无法注入';
    }
    tplEditorReady = true;
  }

  function syncScroll() {
    gutter.scrollTop = ta.scrollTop;
    hl.scrollTop = ta.scrollTop;
    hl.scrollLeft = ta.scrollLeft;
  }

  paint();

  if (ta.dataset.bound) return;
  ta.dataset.bound = '1';

  ta.addEventListener('input', () => { paint(); syncScroll(); });
  ta.addEventListener('scroll', syncScroll);

  ta.addEventListener('keydown', (e) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      const start = ta.selectionStart;
      const end = ta.selectionEnd;

      if (!e.shiftKey && start === end) {
        ta.value = `${ta.value.slice(0, start)}  ${ta.value.slice(end)}`;
        ta.selectionStart = start + 2;
        ta.selectionEnd = start + 2;
      } else {
        // 多行选区整体缩进 / 反缩进，行首为空时不补空格
        const lineStart = ta.value.lastIndexOf('\n', start - 1) + 1;
        const block = ta.value.slice(lineStart, end);
        const shifted = block.split('\n').map((line) => {
          if (e.shiftKey) {
            if (line.startsWith('  ')) return line.slice(2);
            if (line.startsWith(' ')) return line.slice(1);
            return line;
          }
          return line.length ? `  ${line}` : line;
        }).join('\n');
        ta.value = ta.value.slice(0, lineStart) + shifted + ta.value.slice(end);
        ta.selectionStart = lineStart;
        ta.selectionEnd = lineStart + shifted.length;
      }
      paint();
      syncScroll();
      return;
    }

    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
      e.preventDefault();
      el('save-template').click();
    }
  });

  const SECTION_ANCHORS = {
    dns: /^dns:/m,
    'proxy-groups': /^proxy-groups:/m,
    rules: /^rules:/m,
  };

  $$('.tpl-sec-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      $$('.tpl-sec-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      const sec = btn.dataset.sec;

      if (sec === 'all') {
        ta.focus();
        ta.setSelectionRange(0, 0);
        ta.scrollTop = 0;
        syncScroll();
        return;
      }
      const pat = SECTION_ANCHORS[sec];
      const m = pat && pat.exec(ta.value);
      if (!m) { toast(`模板中没有 "${btn.textContent}" 区块`, 'err'); return; }

      ta.focus();
      const lineNo = ta.value.slice(0, m.index).split('\n').length - 1;
      ta.scrollTop = Math.max(0, lineNo * 20 - 60);
      ta.setSelectionRange(m.index, m.index + m[0].length);
      syncScroll();
    });
  });

  $$('.var-chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      const s = ta.selectionStart;
      const token = chip.dataset.var;
      ta.value = `${ta.value.slice(0, s)}${token}${ta.value.slice(ta.selectionEnd)}`;
      ta.selectionStart = s + token.length;
      ta.selectionEnd = s + token.length;
      ta.focus();
      paint();
      syncScroll();
    });
  });
}

/* ───────────────────────── 日志 ───────────────────────── */

const LOG_LIMIT = 60;
const LOG_SRC = { auth: '登录', sub: '订阅', node: '节点' };
const logState = { source: '', q: '', offset: 0, rows: [], total: 0, timer: 0 };

function logTime(ts) {
  const d = new Date(ts * 1000);
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

function logExtra(r) {
  let meta = null;
  try { meta = r.meta ? JSON.parse(r.meta) : null; } catch { meta = null; }
  if (!meta) return '';
  const bits = [];
  if (meta.format) bits.push(meta.format);
  if (meta.nodes != null) bits.push(`${meta.nodes} 节点`);
  if (meta.type) bits.push(meta.type);
  return bits.join(' · ');
}

function logRow(r) {
  const extra = logExtra(r);
  return `
    <div class="log-row${r.level === 'warn' ? ' warn' : ''}">
      <time class="log-time">${logTime(r.ts)}</time>
      <span class="log-src">${esc(LOG_SRC[r.source] || r.source)}</span>
      <span class="log-msg">${esc(r.message)}${extra ? `<i>${esc(extra)}</i>` : ''}</span>
      <span class="log-ip">${esc(r.ip || '—')}</span>
    </div>`;
}

async function renderLogs(reset = true) {
  if (reset) { logState.offset = 0; logState.rows = []; }
  const qs = new URLSearchParams({ limit: LOG_LIMIT, offset: logState.offset });
  if (logState.source) qs.set('source', logState.source);
  if (logState.q) qs.set('q', logState.q);
  let data;
  try { data = await api(`/api/logs?${qs}`); } catch (e) { toast(e.message, 'error'); return; }
  logState.total = data.total;
  logState.rows = logState.rows.concat(data.rows);
  logState.offset = logState.rows.length;

  const box = el('log-list');
  if (!logState.rows.length) {
    box.innerHTML = emptyState({ title: logState.q || logState.source ? '没有匹配的日志' : '暂无日志' });
    el('log-foot').hidden = true;
    return;
  }
  box.innerHTML = logState.rows.map(logRow).join('');
  el('log-foot').hidden = logState.rows.length >= logState.total;
}

/* ───────────────────────── 设置 ───────────────────────── */

async function renderSettings() {
  const [s, t] = await Promise.all([api('/api/settings'), api('/api/template')]);
  el('set-panel-url').value = s.panel_url || '';
  el('set-sub-name').value = s.sub_name || '';
  el('set-pull').value = s.pull_interval || 60;
  el('set-push').value = s.push_interval || 60;

  const base = state.base.replace(/\/$/, '');
  el('kv-sub-entry').textContent = `${base}/sub/{token}`;

  const badge = el('tpl-badge');
  badge.textContent = t.isDefault ? '内置默认' : '已自定义';
  badge.className = t.isDefault ? 'tag' : 'tag tag-accent';

  const ta = el('set-template');
  ta.value = t.content || '';
  tplEditorInit();
  ta.scrollTop = 0;
  el('tpl-linenos').scrollTop = 0;
  el('tpl-highlight').scrollTop = 0;

  // 右侧「接管状态」只在两处数据齐备时刷新，失败不影响表单可用性
  Promise.all([api('/api/nodes'), api('/api/users')]).then(([n, u]) => {
    const nodes = n.nodes || [];
    const users = u.users || [];
    const live = nodes.filter((x) => x.enabled).length;
    const valid = users.filter((x) => userStatus(x).text === '正常').length;
    el('kv-node-count').textContent = `${live} / ${nodes.length}`;
    el('kv-user-count').textContent = `${valid} / ${users.length}`;
    el('kv-tpl-source').textContent = t.isDefault ? '内置' : '自定义';
  }).catch(() => {});
}

/* ───────────────────────── 启动 ───────────────────────── */

async function boot() {
  try {
    const s = await api('/api/session');
    state.user = s.user;
    state.base = s.base;
    showApp();
    switchView('dashboard');
  } catch {
    showLogin();
  }
}

el('login-form').onsubmit = async (e) => {
  e.preventDefault();
  const errBox = el('login-error');
  errBox.textContent = '';
  errBox.classList.remove('show');
  try {
    await api('/api/login', {
      method: 'POST',
      body: JSON.stringify({
        username: el('login-user').value.trim(),
        password: el('login-pass').value,
      }),
    });
    el('login-pass').value = '';
    await boot();
  } catch (err) {
    errBox.textContent = err.message;
    errBox.classList.add('show');
  }
};

/* ── 用户菜单 ── */
const userMenu = el('user-menu');
el('user-chip').onclick = (e) => {
  e.stopPropagation();
  el('user-menu').hidden = !el('user-menu').hidden;
};
userMenu.onclick = (e) => e.stopPropagation();
document.addEventListener('click', () => {
  el('user-menu').hidden = true;
});

userMenu.querySelectorAll('.menu-item').forEach((btn) => {
  btn.onclick = () => {
    el('user-menu').hidden = true;
    if (btn.dataset.act === 'logout') doLogout();
    else if (btn.dataset.act === 'password') passwordDialog();
  };
});

async function doLogout() {
  await api('/api/logout', { method: 'POST' }).catch(() => {});
  showLogin();
}

function passwordDialog() {
  openModal(
    '修改密码',
    `
    <label class="field">
      <span class="field-label">当前密码</span>
      <input type="password" id="pw-cur" autocomplete="current-password" placeholder="••••••••••" />
    </label>
    <label class="field">
      <span class="field-label">新密码</span>
      <input type="password" id="pw-new" autocomplete="new-password" placeholder="至少 8 位" />
    </label>
    <label class="field">
      <span class="field-label">确认新密码</span>
      <input type="password" id="pw-confirm" autocomplete="new-password" placeholder="再次输入" />
    </label>
    <div class="form-note" id="pw-note"></div>
  `,
    [
      { label: '取消', onClick: closeModal },
      { label: '保存', kind: 'primary', onClick: submitPassword },
    ],
    { focus: 'pw-cur' }
  );
}

async function submitPassword() {
  const cur = el('pw-cur').value;
  const next = el('pw-new').value;
  const again = el('pw-confirm').value;
  const note = el('pw-note');
  note.textContent = '';
  if (!cur) return void (note.textContent = '请输入当前密码');
  if (next.length < 8) return void (note.textContent = '新密码至少 8 位字符');
  if (next !== again) return void (note.textContent = '两次输入的新密码不一致');
  try {
    await api('/api/password', { method: 'POST', body: JSON.stringify({ current: cur, next }) });
    closeModal();
    toast('密码已修改');
  } catch (err) {
    note.textContent = err.message || '修改失败';
  }
}

$$('.nav-item').forEach((item) => {
  item.onclick = () => switchView(item.dataset.view);
});

document.addEventListener('click', (e) => {
  const jump = e.target.closest('[data-jump]');
  if (!jump) return;
  const target = jump.dataset.jump;
  if (target === 'nodes' || target === 'users' || target === 'settings' || target === 'dashboard') {
    switchView(target);
    return;
  }
  if (target === 'add-node-action') nodeForm(null);
  if (target === 'add-user-action') userForm(null);
});

el('btn-refresh').onclick = async () => {
  const btn = el('btn-refresh');
  btn.classList.add('spin');
  try {
    await renderView(state.view);
    if (state.view === 'dashboard') await renderDashboard();
  } catch (e) {
    toast(e.message, 'err');
  } finally {
    setTimeout(() => btn.classList.remove('spin'), 400);
  }
};

el('add-node').onclick = () => nodeForm(null);
el('add-user').onclick = () => userForm(null);

el('user-search').addEventListener('input', (e) => {
  state.userQuery = e.target.value;
  renderUsers();
});

$$('#user-filter .seg-item').forEach((btn) => {
  btn.onclick = () => {
    $$('#user-filter .seg-item').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    state.userFilter = btn.dataset.filter;
    renderUsers();
  };
});

el('log-search').addEventListener('input', (e) => {
  clearTimeout(logState.timer);
  logState.q = e.target.value.trim();
  logState.timer = setTimeout(() => renderLogs(true), 250);
});

$$('#log-filter .seg-item').forEach((btn) => {
  btn.onclick = () => {
    $$('#log-filter .seg-item').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    logState.source = btn.dataset.src;
    renderLogs(true);
  };
});

el('log-more').onclick = () => renderLogs(false);

el('save-settings').onclick = async () => {
  try {
    await api('/api/settings', {
      method: 'PUT',
      body: JSON.stringify({
        panel_url: el('set-panel-url').value.trim(),
        sub_name: el('set-sub-name').value.trim(),
        pull_interval: el('set-pull').value,
        push_interval: el('set-push').value,
      }),
    });
    const s = await api('/api/session');
    state.base = s.base;
    el('kv-sub-entry').textContent = `${state.base.replace(/\/$/, '')}/sub/{token}`;
    toast('设置已保存');
  } catch (e) { toast(e.message, 'err'); }
};

el('tpl-format').onclick = () => {
  const ta = el('set-template');
  ta.value = ta.value
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trimEnd() + '\n';
  ta.dispatchEvent(new Event('input'));
  toast('已格式化');
};

el('tpl-preview').onclick = async () => {
  const content = el('set-template').value;
  if (!content.trim()) { toast('模板为空', 'err'); return; }
  try {
    const d = await api('/api/template/preview', {
      method: 'POST',
      body: JSON.stringify({ content }),
    });
    openModal(
      '模板预览',
      `<p style="margin-bottom:12px;color:var(--ink-3)">
         以 ${esc(d.user)} 的身份渲染，共 ${d.lines} 行、注入 ${d.nodes} 个节点。内容与实际下发一致。
       </p>
       <pre class="preview-block">${highlightYaml(d.content)}</pre>`,
      [{ label: '关闭', onClick: closeModal }],
      { wide: true }
    );
  } catch (e) { toast(e.message, 'err'); }
};

el('save-template').onclick = async () => {
  try {
    const content = el('set-template').value;
    if (!content.includes('{{PROXIES}}')) {
      toast('模板必须包含 {{PROXIES}} 占位符', 'err');
      return;
    }
    await api('/api/template', { method: 'PUT', body: JSON.stringify({ content }) });
    const badge = el('tpl-badge');
    badge.textContent = '已自定义';
    badge.className = 'tag tag-accent';
    toast('模板已保存');
  } catch (e) { toast(e.message, 'err'); }
};

el('reset-template').onclick = async () => {
  const ok = await confirmDialog({
    title: '恢复默认模板',
    message: '当前自定义内容将被内置模板覆盖，且无法撤销。',
    confirmText: '恢复默认',
  });
  if (!ok) return;
  try {
    await api('/api/template', { method: 'PUT', body: JSON.stringify({ content: '' }) });
    const fresh = await api('/api/template');
    const ta = el('set-template');
    ta.value = fresh.content || '';
    ta.dispatchEvent(new Event('input'));
    const badge = el('tpl-badge');
    badge.textContent = '内置默认';
    badge.className = 'tag';
    toast('已恢复默认模板');
  } catch (e) { toast(e.message, 'err'); }
};

el('modal').onclick = (e) => {
  if (e.target === el('modal')) closeModal();
};
el('modal-close').onclick = closeModal;
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !el('modal').hidden) closeModal();
});

boot();
