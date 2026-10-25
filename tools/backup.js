// 在线备份 SQLite 到 data/backups/，保留最近 14 份
// 用法：docker exec xpanel node /app/tools/backup.js
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const DATA_DIR = process.env.DATA_DIR || '/data';
const SRC = path.join(DATA_DIR, 'xpanel.db');
const OUT = path.join(DATA_DIR, 'backups');
const KEEP = 14;

async function main() {
  if (!fs.existsSync(SRC)) {
    console.error('数据库不存在:', SRC);
    process.exit(1);
  }
  fs.mkdirSync(OUT, { recursive: true });
  const d = new Date();
  const p2 = (n) => String(n).padStart(2, '0');
  const stamp = `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}-${p2(d.getHours())}${p2(d.getMinutes())}`;
  const dst = path.join(OUT, `xpanel-${stamp}.db`);

  const db = new Database(SRC, { readonly: true });
  await db.backup(dst);
  db.close();

  const files = fs
    .readdirSync(OUT)
    .filter((f) => f.startsWith('xpanel-') && f.endsWith('.db'))
    .sort()
    .reverse();
  for (const f of files.slice(KEEP)) fs.unlinkSync(path.join(OUT, f));

  const size = (fs.statSync(dst).size / 1024).toFixed(0);
  console.log(`备份完成 ${dst} (${size}KB)，保留 ${Math.min(files.length, KEEP)} 份`);
}

main().catch((e) => {
  console.error('备份失败:', e.message);
  process.exit(1);
});
