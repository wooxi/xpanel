'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const admin = require('./src/admin');
const panel = require('./src/panel');

const PORT = Number(process.env.PORT || 7002);
const HOST = process.env.HOST || '0.0.0.0';
const PUBLIC_DIR = path.join(__dirname, 'public');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.json': 'application/json; charset=utf-8',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
};

admin.init();

function serveStatic(req, res, url) {
  let rel = decodeURIComponent(url.pathname);
  if (rel === '/' || rel === '') rel = '/index.html';
  const file = path.normalize(path.join(PUBLIC_DIR, rel));
  if (!file.startsWith(PUBLIC_DIR)) {
    res.writeHead(403).end('forbidden');
    return;
  }
  fs.readFile(file, (err, data) => {
    if (err) {
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end('not found');
      return;
    }
    res.writeHead(200, {
      'content-type': MIME[path.extname(file)] || 'application/octet-stream',
      'content-length': data.length,
      'cache-control': 'no-cache',
      'x-content-type-options': 'nosniff',
      'x-frame-options': 'DENY',
    });
    res.end(data);
  });
}

const server = http.createServer(async (req, res) => {
  const started = Date.now();
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

  res.on('finish', () => {
    if (url.pathname.startsWith('/api/v1/server/UniProxy')) return; // 心跳太吵，不记
    console.log(`${req.method} ${url.pathname} ${res.statusCode} ${Date.now() - started}ms`);
  });

  try {
    if (await panel.handle(req, res, url)) return;
    if (panel.handleSubscribe(req, res, url)) return;
    if (await admin.handle(req, res, url)) return;
    serveStatic(req, res, url);
  } catch (err) {
    console.error('[xpanel] request failed:', err);
    if (!res.headersSent) {
      res.writeHead(500, { 'content-type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: 'internal error' }));
    } else {
      res.end();
    }
  }
});

server.listen(PORT, HOST, () => {
  console.log(`[xpanel] listening on http://${HOST}:${PORT}`);
  const logs = require('./src/logs');
  logs.prune();
  setInterval(() => logs.prune(), 24 * 3600 * 1000).unref();
});

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    console.log(`[xpanel] ${sig}, shutting down`);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 5000);
  });
}
