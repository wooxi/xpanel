'use strict';

const { db, now } = require('./db');

const LEVELS = ['info', 'warn', 'error'];
const KEEP_DAYS = 30;

/**
 * 写入一条事件日志。
 * 日志是旁路能力：任何写入失败都只打到 stderr，绝不向上抛，
 * 以免因为磁盘/锁问题影响订阅、节点同步这些主流程。
 */
function add({ level = 'info', source, action, message, meta, ip } = {}) {
  try {
    db.prepare(
      'INSERT INTO logs (ts, level, source, action, message, meta, ip) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(
      now(),
      LEVELS.includes(level) ? level : 'info',
      String(source || 'system').slice(0, 32),
      String(action || '').slice(0, 64),
      String(message || '').slice(0, 500),
      meta == null ? null : JSON.stringify(meta).slice(0, 2000),
      ip == null ? null : String(ip).slice(0, 64)
    );
  } catch (e) {
    console.error('[logs] write failed:', e.message);
  }
}

function query({ limit = 100, offset = 0, source = '', level = '', q = '' } = {}) {
  const where = [];
  const args = [];
  if (source) {
    where.push('source = ?');
    args.push(String(source));
  }
  if (level) {
    where.push('level = ?');
    args.push(String(level));
  }
  if (q) {
    where.push('(message LIKE ? OR action LIKE ? OR ip LIKE ?)');
    const k = `%${q}%`;
    args.push(k, k, k);
  }
  const cond = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const take = Math.min(Math.max(Number(limit) || 100, 1), 500);
  const skip = Math.max(Number(offset) || 0, 0);

  const rows = db
    .prepare(`SELECT id, ts, level, source, action, message, meta, ip FROM logs ${cond} ORDER BY id DESC LIMIT ? OFFSET ?`)
    .all(...args, take, skip);
  const total = db.prepare(`SELECT COUNT(*) AS c FROM logs ${cond}`).get(...args).c;
  const sources = db
    .prepare("SELECT source, COUNT(*) AS c FROM logs GROUP BY source ORDER BY c DESC")
    .all();

  return { rows, total, sources, limit: take, offset: skip };
}

/** 保留最近 KEEP_DAYS 天，避免事件表无限膨胀 */
function prune() {
  try {
    db.prepare('DELETE FROM logs WHERE ts < ?').run(now() - KEEP_DAYS * 86400);
  } catch (e) {
    console.error('[logs] prune failed:', e.message);
  }
}

module.exports = { add, query, prune, KEEP_DAYS };
