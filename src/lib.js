'use strict';

const crypto = require('node:crypto');

const GB = 1024 ** 3;

function uuid() {
  return crypto.randomUUID();
}

function randomToken(bytes = 16) {
  return crypto.randomBytes(bytes).toString('hex');
}

function sha256(input) {
  return crypto.createHash('sha256').update(String(input)).digest('hex');
}

/** 客户端流量统计头，Clash / 小火箭 / v2rayN 都读这个 */
function userInfoHeader(user) {
  const total = user.traffic_limit == null ? 0 : user.traffic_limit;
  const expire = user.expires_at == null ? 0 : user.expires_at;
  return `upload=${user.up}; download=${user.down}; total=${total}; expire=${expire}`;
}

function fmtGiB(bytes) {
  return (bytes / GB).toFixed(2);
}

const SIZE_UNITS = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];

/** 102400GB → 100TB */
function fmtSize(bytes) {
  let v = Number(bytes) || 0;
  if (v <= 0) return '0B';
  let i = 0;
  while (v >= 1024 && i < SIZE_UNITS.length - 1) {
    v /= 1024;
    i += 1;
  }
  return `${v >= 100 ? v.toFixed(0) : v.toFixed(2)}${SIZE_UNITS[i]}`;
}

/** hysteria2:// 单节点链接 */
function hysteria2Link(user, node) {
  const auth = encodeURIComponent(user.uuid);
  const host = String(node.host).includes(':') ? `[${node.host}]` : node.host;
  const params = new URLSearchParams();
  if (node.sni) params.set('sni', node.sni);
  params.set('insecure', node.insecure ? '1' : '0');
  if (node.obfs) {
    params.set('obfs', 'salamander');
    if (node.obfs_password) params.set('obfs-password', node.obfs_password);
  }
  const name = encodeURIComponent(node.name || node.host);
  return `hysteria2://${auth}@${host}:${node.port}?${params.toString()}#${name}`;
}

/** Clash / mihomo 的 hysteria2 节点对象 */
function clashNode(user, node) {
  const item = {
    name: node.name,
    type: 'hysteria2',
    server: node.host,
    port: Number(node.port),
    password: user.uuid,
    udp: true,
  };
  if (node.sni) item.sni = node.sni;
  if (node.insecure) item['skip-cert-verify'] = true;
  if (node.up_mbps) item.up = `${node.up_mbps} Mbps`;
  if (node.down_mbps) item.down = `${node.down_mbps} Mbps`;
  if (node.obfs) {
    item.obfs = 'salamander';
    if (node.obfs_password) item['obfs-password'] = node.obfs_password;
  }
  return item;
}

const CLASH_UA = [
  'clash', 'mihomo', 'clashmeta', 'clash-verge', 'clashverge', 'flclash',
  'stash', 'surfboard', 'loon', 'nekobox', 'nekoray', 'clashx',
];

const ROCKET_UA = ['shadowrocket', 'rocket', 'srocket'];

const SINGBOX_UA = ['sing-box', 'singbox', 'sfa', 'sfi', 'sfm'];

/** 按 UA 判断订阅格式 */
function detectFormat(ua) {
  const s = String(ua || '').toLowerCase();
  if (CLASH_UA.some((k) => s.includes(k))) return 'clash';
  if (ROCKET_UA.some((k) => s.includes(k))) return 'rocket';
  if (SINGBOX_UA.some((k) => s.includes(k))) return 'singbox';
  return 'general';
}

function base64(text) {
  return Buffer.from(text, 'utf8').toString('base64');
}

/** YAML 双引号字符串（JSON 字符串即为合法 YAML） */
function yq(value) {
  return JSON.stringify(String(value));
}

function fmtDate(ts) {
  if (!ts) return '不限期';
  const d = new Date(ts * 1000);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** 剩余流量文案 */
function trafficText(user) {
  if (user.traffic_limit == null) return '不限';
  const left = Math.max(0, user.traffic_limit - user.up - user.down);
  return `${fmtGiB(left)} GiB`;
}

function isExpired(user) {
  return user.expires_at != null && user.expires_at <= Math.floor(Date.now() / 1000);
}

function isOverLimit(user) {
  if (user.traffic_limit == null) return false;
  return user.up + user.down >= user.traffic_limit;
}

/** 用户当前是否可用（对节点下发 / 订阅） */
function isActive(user) {
  return !user.banned && !isExpired(user) && !isOverLimit(user);
}

module.exports = {
  GB,
  fmtSize,
  uuid,
  randomToken,
  sha256,
  userInfoHeader,
  fmtGiB,
  hysteria2Link,
  clashNode,
  detectFormat,
  base64,
  yq,
  fmtDate,
  trafficText,
  isExpired,
  isOverLimit,
  isActive,
};
