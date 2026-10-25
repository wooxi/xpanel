'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { db, getSetting } = require('./db');
const L = require('./lib');

const TEMPLATE_PATH = path.join(__dirname, '..', 'resources', 'clash.yaml.tpl');
let cachedTemplate = null;

function loadTemplate() {
  const custom = getSetting('clash_template', '');
  if (custom.trim()) return custom;
  if (cachedTemplate == null) cachedTemplate = fs.readFileSync(TEMPLATE_PATH, 'utf8');
  return cachedTemplate;
}

function activeNodes(userId) {
  const all = db.prepare('SELECT * FROM nodes WHERE enabled = 1 ORDER BY sort ASC, id ASC').all();
  const scoped = db.prepare('SELECT node_id FROM user_nodes WHERE uid = ?').all(userId);
  if (!scoped.length) return all;
  const allowed = new Set(scoped.map((r) => r.node_id));
  return all.filter((n) => allowed.has(n.id));
}

function nodeYaml(user, node) {
  const item = L.clashNode(user, node);
  const lines = [`  - name: ${L.yq(item.name)}`];
  for (const [k, v] of Object.entries(item)) {
    if (k === 'name') continue;
    if (typeof v === 'boolean') lines.push(`    ${k}: ${v}`);
    else if (typeof v === 'number') lines.push(`    ${k}: ${v}`);
    else lines.push(`    ${k}: ${L.yq(v)}`);
  }
  return lines.join('\n');
}

function placeholderNode(reason) {
  return [
    `  - name: ${L.yq(reason)}`,
    '    type: hysteria2',
    '    server: "127.0.0.1"',
    '    port: 1',
    '    password: "expired"',
    '    sni: "expired.invalid"',
    '    skip-cert-verify: true',
  ].join('\n');
}

function appName(user) {
  return getSetting('sub_name', '') || user.name || 'xpanel';
}

function renderClash(user, nodes, tplOverride) {
  const tpl = tplOverride == null ? loadTemplate() : String(tplOverride);
  const list = nodes.map((n) => nodeYaml(user, n)).join('\n');
  const proxies = list || placeholderNode(unavailableReason(user));
  // 把「自动选择 / 故障转移」这类空策略组填上节点
  const names = nodes.map((n) => L.yq(n.name)).join(', ');
  const groupFill = names ? `proxies: [${names}]` : 'proxies: []';
  // 主选择组：策略组 + DIRECT + 全部节点，可直接手动选到具体节点
  const members = ['"自动选择"', '"故障转移"', '"DIRECT"', ...nodes.map((n) => L.yq(n.name))].join(', ');
  return tpl
    .replace('{{PROXIES}}', proxies)
    .replace('{{GROUP_MEMBERS}}', members)
    .replaceAll('{{APP_NAME}}', appName(user))
    .replaceAll('proxies: []', groupFill);
}

function unavailableReason(user) {
  if (user.banned) return '订阅已停用，请联系管理员';
  if (L.isExpired(user)) return '订阅已到期，请联系管理员';
  if (L.isOverLimit(user)) return '流量已用尽，请联系管理员';
  return '暂无可用节点，请联系管理员';
}

function renderRocket(user, nodes) {
  const total = user.traffic_limit == null ? '不限' : L.fmtSize(user.traffic_limit);
  const lines = [
    `STATUS=↑${L.fmtSize(user.up)} ↓${L.fmtSize(user.down)} TOT:${total} 到期:${L.fmtDate(user.expires_at)}`,
  ];
  for (const n of nodes) lines.push(L.hysteria2Link(user, n));
  return L.base64(lines.join('\r\n'));
}

function renderGeneral(user, nodes) {
  const links = nodes.map((n) => L.hysteria2Link(user, n));
  return L.base64(links.join('\r\n'));
}

function defaultTemplate() {
  if (cachedTemplate == null) cachedTemplate = fs.readFileSync(TEMPLATE_PATH, 'utf8');
  return cachedTemplate;
}

module.exports = { activeNodes, renderClash, renderRocket, renderGeneral, unavailableReason, appName, defaultTemplate };
