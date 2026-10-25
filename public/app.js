'use strict';

const state = { user: '', base: '', nodes: [], users: [] };
const $ = (sel) => document.querySelector(sel);
const el = (id) => document.getElementById(id);

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function toast(msg, isError = false) {
  const t = el('toast');
  t.textContent = msg;
  t.className = isError ? 'show error' : 'show';
  clearTimeout(toast._t);
  toast._t = setTimeout(() => (t.className = ''), 2200);
}

async function api(path, options = {}) {
  const res = await fetch(path, {
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json' },
    ...options,
  });
  if (res.status === 401) {
    showLogin();
    throw new Error('未登录');
  }
  const text = await res.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { error: text };
  }
  if (!res.ok) throw new Error(data.error || `请求失败 (${res.status})`);
  return data;
}

function showLogin() {
  el('app').hidden = true;
  el('login').hidden = false;
}

function showApp() {
  el('login').hidden = true;
  el('app').hidden = false;
  el('who').textContent = state.user;
}

/* ---------------- 弹窗 ---------------- */

function openModal(title, bodyHtml, footButtons) {
  el('modal-title').textContent = title;
  el('modal-body').innerHTML = bodyHtml;
  const foot = el('modal-foot');
  foot.innerHTML = '';
  for (const b of footButtons || []) {
    const btn = document.createElement('button');
    btn.className = `btn ${b.kind || ''}`;
    btn.textContent = b.label;
    btn.onclick = () => b.onClick?.();
    foot.appendChild(btn);
  }
  el('modal').hidden = false;
}

function closeModal() {
  el('modal').hidden = true;
  el('modal-body').innerHTML = '';
}

function copyText(text) {
  navigator.clipboard?.writeText(text).then(
    () => toast('已复制'),
    () => toast('复制失败，请手动选择', true)
  );
}

/* ---------------- 视图 ---------------- */

function switchView(name) {
  for (const btn of document.querySelectorAll('.side button')) {
    btn.classList.toggle('active', btn.dataset.view === name);
  }
  for (const id of ['dashboard', 'nodes', 'users', 'settings']) {
    el(`view-${id}`).hidden = id !== name;
  }
  if (name === 'dashboard') renderDashboard();
  if (name === 'nodes') renderNodes();
  if (name === 'users') renderUsers();
  if (name === 'settings') renderSettings();
}

/* ---------------- 仪表盘 ---------------- */

function countUp(node) {
  const to = Number(node.dataset.to);
  const dec = Number(node.dataset.dec || 0);
  if (!Number.isFinite(to)) return (node.textContent = '0');
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
    return (node.textContent = to.toFixed(dec));
  }
  const t0 = performance.now();
  const dur = 560;
  const tick = (t) => {
    const p = Math.min(1, (t - t0) / dur);
    const e = 1 - Math.pow(1 - p, 3);
    node.textContent = (to * e).toFixed(dec);
    if (p < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

function fmtG(gb) {
  const v = Number(gb);
  if (!Number.isFinite(v)) return '0 GB';
  return v >= 1024 ? `${(v / 1024).toFixed(2)} TB` : `${v.toFixed(2)} GB`;
}

function splitSize(bytes) {
  const gb = (Number(bytes) || 0) / 1024 ** 3;
  return gb >= 1024 ? [gb / 1024, 'TB'] : [gb, 'GB'];
}

async function renderDashboard() {
  const [d, n] = await Promise.all([api('/api/overview'), api('/api/nodes')]);
  state.nodes = n.nodes || [];
  const [todayVal, todayUnit] = splitSize(d.traffic_today);
  const [totalVal, totalUnit] = splitSize(d.traffic_total);
  const cards = [
    ['节点', d.nodes_enabled, `共 ${d.nodes} 个`, 0],
    ['用户', d.users_active, `共 ${d.users} 个`, 0],
    ['今日流量', todayVal, todayUnit, 2],
    ['累计流量', totalVal, totalUnit, 2],
  ];
  el('cards').innerHTML = cards
    .map(
      ([label, value, unit, dec]) =>
        `<div class="card"><div class="label">${label}</div><div class="value"><span class="num" data-to="${Number(value)}" data-dec="${dec}">0</span><small>${esc(unit)}</small></div></div>`
    )
    .join('');
  el('cards').querySelectorAll('.num').forEach(countUp);

  const nodes = state.nodes;
  el('dash-nodes').innerHTML = nodes.length
    ? `<table><thead><tr><th>节点</th><th>地址</th><th>状态</th><th>最后上报</th></tr></thead><tbody>${nodes
        .map(
          (n) => `<tr><td>${esc(n.name)}</td><td class="mono">${esc(n.host)}:${esc(n.port)}</td>
          <td>${n.enabled ? (n.online ? '<span class="tag ok">在线</span>' : '<span class="tag warn">待上报</span>') : '<span class="tag">已停用</span>'}</td>
          <td class="muted small">${n.last_report_at ? new Date(n.last_report_at * 1000).toLocaleString('zh-CN', { hour12: false }) : '—'}</td></tr>`
        )
        .join('')}</tbody></table>`
    : '<div class="empty">还没有节点，先去「节点」页添加</div>';
}

/* ---------------- 节点 ---------------- */

async function loadNodes() {
  const d = await api('/api/nodes');
  state.nodes = d.nodes;
}

async function renderNodes() {
  await loadNodes();
  const box = el('node-list');
  if (!state.nodes.length) {
    box.innerHTML = '<div class="empty">还没有节点。添加后，把「面板地址 + 密钥」填进 NodeX 即可对接。</div>';
    return;
  }
  box.innerHTML = `<table>
    <thead><tr><th>名称</th><th>地址</th><th>SNI</th><th>状态</th><th>操作</th></tr></thead>
    <tbody>${state.nodes
      .map(
        (n) => `<tr>
          <td>${esc(n.name)}</td>
          <td class="mono">${esc(n.host)}:${esc(n.port)}</td>
          <td class="mono small">${esc(n.sni || '—')}</td>
          <td>${n.enabled ? (n.online ? '<span class="tag ok">在线</span>' : '<span class="tag warn">待上报</span>') : '<span class="tag">已停用</span>'}</td>
          <td><div class="actions">
            <button class="btn sm" data-act="connect" data-id="${n.id}">对接信息</button>
            <button class="btn sm" data-act="edit-node" data-id="${n.id}">编辑</button>
            <button class="btn sm danger" data-act="del-node" data-id="${n.id}">删除</button>
          </div></td></tr>`
      )
      .join('')}</tbody></table>`;

  box.querySelectorAll('button[data-act]').forEach((btn) => {
    const id = Number(btn.dataset.id);
    const node = state.nodes.find((x) => x.id === id);
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
    node ? '编辑节点' : '添加节点',
    `<label class="field"><span>节点名称（订阅里显示）</span><input id="f-name" value="${esc(n.name || '')}" placeholder="日本 · 大阪 01" /></label>
     <div class="row2">
       <label class="field"><span>服务器地址</span><input id="f-host" value="${esc(n.host || '')}" placeholder="1.2.3.4 或 node.example.com" /></label>
       <label class="field"><span>端口</span><input id="f-port" type="number" value="${esc(n.port || 443)}" /></label>
     </div>
     <label class="field"><span>SNI / 域名</span><input id="f-sni" value="${esc(n.sni || '')}" placeholder="browser.yourdomain.com" />
       <div class="hint">Hysteria2 的 TLS 认证名，与节点里配置的一致即可</div></label>
     <div class="row2">
       <label class="field"><span>上行 Mbps（可选）</span><input id="f-up" type="number" value="${esc(n.up_mbps || '')}" /></label>
       <label class="field"><span>下行 Mbps（可选）</span><input id="f-down" type="number" value="${esc(n.down_mbps || '')}" /></label>
     </div>
     <label class="field"><span>混淆（可选）</span>
       <select id="f-obfs"><option value="">关闭</option><option value="1" ${n.obfs ? 'selected' : ''}>salamander</option></select>
     </label>
     <label class="field"><span>混淆密码</span><input id="f-obfs-pass" value="${esc(n.obfs_password || '')}" /></label>
     <div class="row2">
       <label class="field"><span>跳过证书校验</span>
         <select id="f-insecure"><option value="0">否</option><option value="1" ${n.insecure ? 'selected' : ''}>是</option></select>
       </label>
       <label class="field"><span>启用</span>
         <select id="f-enabled"><option value="1">启用</option><option value="0" ${n.enabled === 0 ? 'selected' : ''}>停用</option></select>
       </label>
     </div>`,
    [
      { label: '取消', onClick: closeModal },
      {
        label: '保存',
        kind: 'primary',
        onClick: async () => {
          const payload = {
            name: el('f-name').value.trim(),
            host: el('f-host').value.trim(),
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
            toast('已保存');
            renderNodes();
          } catch (e) {
            toast(e.message, true);
          }
        },
      },
    ]
  );
}

async function delNode(node) {
  if (!confirm(`删除节点「${node.name}」？订阅里会立即移除。`)) return;
  try {
    await api(`/api/nodes/${node.id}`, { method: 'DELETE' });
    toast('已删除');
    renderNodes();
  } catch (e) {
    toast(e.message, true);
  }
}

function connectInfo(node) {
  const base = state.base.replace(/\/$/, '');
  const box = (label, value) =>
    `<div class="field"><span>${label}</span><div class="copy-box"><input readonly value="${esc(value)}" /><button class="btn sm" data-copy="${esc(value)}">复制</button></div></div>`;
  openModal(
    `对接 NodeX · ${node.name}`,
    `<div class="hint" style="margin-bottom:14px">在 NodeX 的节点配置里填下面三项，保存后节点会自动拉取用户与配置。</div>
     ${box('面板地址', `${base}/api/v1/server/UniProxy`)}
     ${box('对接密钥', node.token)}
     ${box('节点 ID', String(node.id))}
     <div class="hint">NodeX 的「节点类型」留空即可；拉取/上报间隔由本面板下发（默认 60 秒）。</div>`,
    [{ label: '关闭', kind: 'primary', onClick: closeModal }]
  );
  el('modal-body').querySelectorAll('[data-copy]').forEach((b) => (b.onclick = () => copyText(b.dataset.copy)));
}

/* ---------------- 用户 ---------------- */

async function loadUsers() {
  const d = await api('/api/users');
  state.users = d.users;
}

async function renderUsers() {
  await loadUsers();
  const box = el('user-list');
  if (!state.users.length) {
    box.innerHTML = '<div class="empty">还没有用户。添加后每人会有一条订阅链接。</div>';
    return;
  }
  box.innerHTML = `<table>
    <thead><tr><th>用户</th><th>到期</th><th>流量</th><th>限速/设备</th><th>状态</th><th>操作</th></tr></thead>
    <tbody>${state.users
      .map((u) => {
        const used = fmtG(u.used_gb ?? 0);
        const total = u.traffic_limit_gb == null ? '不限' : fmtG(u.traffic_limit_gb);
        const badge = u.banned
          ? '<span class="tag bad">已停用</span>'
          : u.expired
          ? '<span class="tag bad">已到期</span>'
          : u.over_limit
          ? '<span class="tag warn">流量用尽</span>'
          : '<span class="tag ok">正常</span>';
        return `<tr>
          <td>${esc(u.name)}<div class="mono small muted">${esc(u.uuid.slice(0, 8))}…</div></td>
          <td class="small">${esc(u.expires_date || '不限期')}</td>
          <td class="small">${esc(used)} / ${esc(total)}</td>
          <td class="small">${u.speed_limit ? `${u.speed_limit} Mbps` : '不限'} · ${u.device_limit || '不限'} 设备</td>
          <td>${badge}</td>
          <td><div class="actions">
            <button class="btn sm" data-act="sub" data-id="${u.id}">订阅</button>
            <button class="btn sm" data-act="edit-user" data-id="${u.id}">编辑</button>
            <button class="btn sm danger" data-act="del-user" data-id="${u.id}">删除</button>
          </div></td></tr>`;
      })
      .join('')}</tbody></table>`;

  box.querySelectorAll('button[data-act]').forEach((btn) => {
    const id = Number(btn.dataset.id);
    const user = state.users.find((x) => x.id === id);
    btn.onclick = () => {
      if (btn.dataset.act === 'edit-user') userForm(user);
      if (btn.dataset.act === 'del-user') delUser(user);
      if (btn.dataset.act === 'sub') subInfo(user);
    };
  });
}

function userForm(user) {
  const u = user || {};
  openModal(
    user ? `编辑用户 · ${u.name}` : '添加用户',
    `<label class="field"><span>备注名</span><input id="u-name" value="${esc(u.name || '')}" placeholder="朋友 A" /></label>
     <div class="row2">
       <label class="field"><span>到期日期</span><input id="u-expire" type="date" value="${esc(u.expires_date || '')}" />
         <div class="hint">留空＝不限期</div></label>
       <label class="field"><span>流量额度（GB）</span><input id="u-quota" type="number" step="0.1" value="${esc(u.traffic_limit_gb ?? '')}" />
         <div class="hint">留空＝不限</div></label>
     </div>
     <div class="row2">
       <label class="field"><span>限速（Mbps）</span><input id="u-speed" type="number" value="${esc(u.speed_limit || 0)}" /></label>
       <label class="field"><span>设备数</span><input id="u-device" type="number" value="${esc(u.device_limit || 0)}" /></label>
     </div>
     <label class="field"><span>状态</span>
       <select id="u-banned"><option value="0">正常</option><option value="1" ${u.banned ? 'selected' : ''}>停用</option></select>
     </label>`,
    [
      { label: '取消', onClick: closeModal },
      {
        label: '保存',
        kind: 'primary',
        onClick: async () => {
          const payload = {
            name: el('u-name').value.trim(),
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
            toast('已保存');
            renderUsers();
          } catch (e) {
            toast(e.message, true);
          }
        },
      },
    ]
  );
}

async function delUser(user) {
  if (!confirm(`删除用户「${user.name}」？其订阅链接会立即失效。`)) return;
  try {
    await api(`/api/users/${user.id}`, { method: 'DELETE' });
    toast('已删除');
    renderUsers();
  } catch (e) {
    toast(e.message, true);
  }
}

function subInfo(user) {
  const base = state.base.replace(/\/$/, '');
  const url = user.sub_url || `${base}/sub/${user.sub_token}`;
  const row = (label, value) =>
    `<div class="field"><span>${label}</span><div class="copy-box"><input readonly value="${esc(value)}" /><button class="btn sm" data-copy="${esc(value)}">复制</button></div></div>`;

  const links = state.nodes
    .filter((n) => n.enabled)
    .map((n) => {
      const link = `${base}/link/${user.sub_token}/${n.id}`;
      return `<div class="field"><span>${esc(n.name)} · 单节点</span><div class="copy-box"><input readonly value="${esc(link)}" /><button class="btn sm" data-copy="${esc(link)}">复制</button></div></div>`;
    })
    .join('');

  openModal(
    `订阅 · ${user.name}`,
    `${row('订阅链接（Clash / 小火箭通用）', url)}
     <div class="hint" style="margin:-8px 0 14px">
       默认自动识别客户端。手动指定格式：加 <code>?flag=clash</code>、<code>?flag=rocket</code> 或 <code>?flag=general</code>。
     </div>
     <div style="display:flex;gap:10px;margin-bottom:16px">
       <button class="btn sm" data-open="${esc(url)}?flag=clash">Clash 配置</button>
       <button class="btn sm" data-open="${esc(url)}?flag=rocket">小火箭链接</button>
       <button class="btn sm" data-open="${esc(url)}?flag=general">通用订阅</button>
     </div>
     <div class="field"><span>单节点链接</span></div>
     ${links || '<div class="hint">还没有可用节点</div>'}
     <div style="display:flex;gap:10px;margin-top:18px">
       <button class="btn sm" id="u-reset-traffic">重置流量</button>
       <button class="btn sm" id="u-reset-sub">换新订阅链接</button>
     </div>`,
    [{ label: '关闭', kind: 'primary', onClick: closeModal }]
  );

  el('modal-body').querySelectorAll('[data-copy]').forEach((b) => (b.onclick = () => copyText(b.dataset.copy)));
  el('modal-body').querySelectorAll('[data-open]').forEach((b) => (b.onclick = () => window.open(b.dataset.open, '_blank')));
  el('u-reset-traffic').onclick = async () => {
    await api(`/api/users/${user.id}/reset-traffic`, { method: 'POST' });
    toast('流量已重置');
    closeModal();
    renderUsers();
  };
  el('u-reset-sub').onclick = async () => {
    if (!confirm('换新链接后，旧订阅链接立即失效，确定？')) return;
    const updated = await api(`/api/users/${user.id}/reset-sub`, { method: 'POST' });
    const merged = { ...user, ...updated };
    closeModal();
    renderUsers();
    subInfo(merged);
  };
}

/* ---------------- 设置 ---------------- */

async function renderSettings() {
  const s = await api('/api/settings');
  el('set-panel-url').value = s.panel_url || '';
  el('set-sub-name').value = s.sub_name || '';
  el('set-pull').value = s.pull_interval || 60;
  el('set-push').value = s.push_interval || 60;
  const t = await api('/api/template');
  el('set-template').value = t.content || '';
  const note = el('template-note');
  if (note) note.textContent = t.isDefault ? '当前显示的是内置默认模板，直接保存即改为自定义。' : '当前使用自定义模板。';
}

/* ---------------- 启动 ---------------- */

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
  el('login-error').textContent = '';
  try {
    await api('/api/login', {
      method: 'POST',
      body: JSON.stringify({ username: el('login-user').value.trim(), password: el('login-pass').value }),
    });
    el('login-pass').value = '';
    await boot();
    await loadNodes();
  } catch (err) {
    el('login-error').textContent = err.message;
  }
};

el('logout').onclick = async () => {
  await api('/api/logout', { method: 'POST' }).catch(() => {});
  showLogin();
};

document.querySelectorAll('.side button').forEach((btn) => (btn.onclick = () => switchView(btn.dataset.view)));
el('add-node').onclick = () => nodeForm(null);
el('add-user').onclick = () => userForm(null);

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
    toast('已保存');
  } catch (e) {
    toast(e.message, true);
  }
};

el('save-template').onclick = async () => {
  try {
    await api('/api/template', { method: 'PUT', body: JSON.stringify({ content: el('set-template').value }) });
    toast('模板已保存');
  } catch (e) {
    toast(e.message, true);
  }
};

el('reset-template').onclick = async () => {
  if (!confirm('恢复为内置模板？当前自定义内容会被清空。')) return;
  await api('/api/template', { method: 'PUT', body: JSON.stringify({ content: '' }) });
  el('set-template').value = '';
  toast('已恢复默认');
};

el('modal').onclick = (e) => {
  if (e.target === el('modal')) closeModal();
};
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !el('modal').hidden) closeModal();
});

boot();
