'use strict';

const path = require('node:path');
const fs = require('node:fs');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });

const Database = require('better-sqlite3');
const db = new Database(path.join(DATA_DIR, 'xpanel.db'));
db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');
db.pragma('busy_timeout = 5000');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS nodes (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT    NOT NULL,
  host          TEXT    NOT NULL,
  port          INTEGER NOT NULL DEFAULT 443,
  sni           TEXT    NOT NULL DEFAULT '',
  insecure      INTEGER NOT NULL DEFAULT 0,
  obfs          TEXT    NOT NULL DEFAULT '',
  obfs_password TEXT    NOT NULL DEFAULT '',
  up_mbps       INTEGER NOT NULL DEFAULT 0,
  down_mbps     INTEGER NOT NULL DEFAULT 0,
  token         TEXT    NOT NULL UNIQUE,
  enabled       INTEGER NOT NULL DEFAULT 1,
  sort          INTEGER NOT NULL DEFAULT 0,
  last_report_at INTEGER,
  last_status   TEXT    NOT NULL DEFAULT '',
  created_at    INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT    NOT NULL,
  uuid          TEXT    NOT NULL UNIQUE,
  sub_token     TEXT    NOT NULL UNIQUE,
  expires_at    INTEGER,
  traffic_limit INTEGER,
  speed_limit   INTEGER NOT NULL DEFAULT 0,
  device_limit  INTEGER NOT NULL DEFAULT 0,
  up            INTEGER NOT NULL DEFAULT 0,
  down          INTEGER NOT NULL DEFAULT 0,
  banned        INTEGER NOT NULL DEFAULT 0,
  created_at    INTEGER NOT NULL,
  last_online_at INTEGER
);

CREATE TABLE IF NOT EXISTS user_nodes (
  uid     INTEGER NOT NULL,
  node_id INTEGER NOT NULL,
  PRIMARY KEY (uid, node_id)
);

CREATE TABLE IF NOT EXISTS traffic_daily (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  uid     INTEGER NOT NULL,
  node_id INTEGER NOT NULL,
  day     TEXT    NOT NULL,
  up      INTEGER NOT NULL DEFAULT 0,
  down    INTEGER NOT NULL DEFAULT 0,
  UNIQUE(uid, node_id, day)
);

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS sessions (
  token      TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS logs (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  ts      INTEGER NOT NULL,
  level   TEXT    NOT NULL DEFAULT 'info',
  source  TEXT    NOT NULL,
  action  TEXT    NOT NULL,
  message TEXT    NOT NULL,
  meta    TEXT,
  ip      TEXT
);

CREATE INDEX IF NOT EXISTS idx_traffic_day ON traffic_daily(day);
CREATE INDEX IF NOT EXISTS idx_users_sub ON users(sub_token);
CREATE INDEX IF NOT EXISTS idx_nodes_token ON nodes(token);
CREATE INDEX IF NOT EXISTS idx_logs_ts ON logs(ts DESC);
CREATE INDEX IF NOT EXISTS idx_logs_source ON logs(source);
`);

const now = () => Math.floor(Date.now() / 1000);

function getSetting(key, fallback = '') {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? row.value : fallback;
}

function setSetting(key, value) {
  db.prepare(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
  ).run(key, String(value ?? ''));
}

function getAllSettings() {
  const out = {};
  for (const row of db.prepare('SELECT key, value FROM settings').all()) out[row.key] = row.value;
  return out;
}

module.exports = { db, now, getSetting, setSetting, getAllSettings, DATA_DIR };
