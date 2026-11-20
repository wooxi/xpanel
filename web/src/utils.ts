import type { NodeItem, UserItem } from './types';

const SIZE_UNITS = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];

/** 将字节数格式化为数值和单位 */
export function fmtBytesParts(bytes: number): { value: string; unit: string } {
  const n = Number(bytes) || 0;
  if (n <= 0) return { value: '0', unit: 'B' };
  let i = 0;
  let v = n;
  while (v >= 1024 && i < SIZE_UNITS.length - 1) {
    v /= 1024;
    i += 1;
  }
  const digits = v < 10 ? 2 : v < 100 ? 1 : 0;
  return { value: v.toFixed(digits), unit: SIZE_UNITS[i] };
}

/** 将字节数格式化为可读字符串 */
export function fmtBytes(bytes: number): string {
  const { value, unit } = fmtBytesParts(bytes);
  return `${value} ${unit}`;
}

/** 格式化相对时间（秒级时间戳） */
export function relTime(ts: number | null | undefined): string {
  if (!ts) return '从未上报';
  const diff = Math.floor(Date.now() / 1000) - Number(ts);
  if (diff < 0) return '刚刚';
  if (diff < 60) return `${diff} 秒前`;
  if (diff < 3600) return `${Math.floor(diff / 60)} 分钟前`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} 小时前`;
  return `${Math.floor(diff / 86400)} 天前`;
}

/** 格式化绝对时间（秒级时间戳） */
export function fmtDateTime(ts: number | null | undefined): string {
  if (!ts) return '—';
  return new Date(ts * 1000).toLocaleString('zh-CN', { hour12: false });
}

/** 获取本地时区 YYYY-MM-DD（修复原版用 UTC toISOString 导致跨日高亮错位的 Bug） */
export function localTodayStr(): string {
  const d = new Date();
  const shifted = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return shifted.toISOString().slice(0, 10);
}

/** 计算距离到期日期的天数 */
export function daysLeft(dateStr: string | null | undefined): number | null {
  if (!dateStr) return null;
  const target = new Date(`${dateStr}T23:59:59`);
  if (Number.isNaN(target.getTime())) return null;
  return Math.ceil((target.getTime() - Date.now()) / 86400000);
}

/** 剩余时长口语化文案 */
export function fmtRemain(days: number | null): string {
  if (days == null) return '长期有效';
  if (days < 0) return `已过期 ${Math.abs(days)} 天`;
  if (days === 0) return '今天到期';
  if (days === 1) return '明天到期';
  if (days < 31) return `剩余 ${days} 天`;
  if (days < 365) return `剩余 ${Math.round(days / 30)} 个月`;
  return `剩余 ${(days / 365).toFixed(days % 365 === 0 ? 0 : 1)} 年`;
}

/** 获取用户状态（直接结合后端返回的精确标志位，避免前后端状态不一致） */
export function getUserStatus(u: UserItem): { color: string; text: string; isNormal: boolean } {
  if (u.banned) return { color: 'error', text: '已停用', isNormal: false };
  if (u.expired) return { color: 'error', text: '已过期', isNormal: false };
  if (u.over_limit) return { color: 'warning', text: '已超量', isNormal: false };
  return { color: 'success', text: '正常', isNormal: true };
}

/** 节点协议简短标签 */
export function getNodeProtoLabel(n: NodeItem): string {
  if (String(n.protocol || 'hysteria2').toLowerCase() === 'vless') {
    const net = n.network === 'ws' ? 'WS' : 'TCP';
    const sec = Number(n.tls_mode) === 2 ? 'Reality' : Number(n.tls_mode) === 1 ? 'TLS' : '无加密';
    return `VLESS · ${net}+${sec}`;
  }
  return `HY2${n.obfs ? ` + ${n.obfs}` : ''}`;
}

/** 判断 URL 是否为内网地址 */
export function isPrivateBaseUrl(url: string): boolean {
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

/** 过滤某用户实际可用的已启用节点列表（修复原版未按 node_ids 过滤的 Bug） */
export function getUserAllowedNodes(user: UserItem, allNodes: NodeItem[]): NodeItem[] {
  const enabledNodes = allNodes.filter((n) => n.enabled);
  if (!user.node_ids || user.node_ids.length === 0) return enabledNodes;
  const allowed = new Set(user.node_ids);
  return enabledNodes.filter((n) => allowed.has(n.id));
}
