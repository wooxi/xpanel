'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const L = require('../src/lib');

test('fmtSize 选择合适单位', () => {
  assert.equal(L.fmtSize(0), '0B');
  assert.equal(L.fmtSize(512), '512B');
  assert.equal(L.fmtSize(1024 ** 3), '1.00GB');
  assert.equal(L.fmtSize(109951162777600), '100TB');
  assert.equal(L.fmtSize(245241854264), '228GB');
});

test('hysteria2Link 带 sni 与 insecure', () => {
  const u = { uuid: 'b7956a22-83c0-4700-ba1c-6048600a0f55' };
  const n = { host: 'node1.example.com', port: 2026, sni: 'node1.example.com', insecure: 1, obfs: '', obfs_password: '' };
  const link = L.hysteria2Link(u, n);
  assert.equal(
    link,
    'hysteria2://b7956a22-83c0-4700-ba1c-6048600a0f55@node1.example.com:2026?sni=node1.example.com&insecure=1#node1.example.com',
  );
});

test('hysteria2Link 带 obfs', () => {
  const u = { uuid: 'abc' };
  const n = { host: '1.2.3.4', port: 443, sni: '', insecure: 0, obfs: 'salamander', obfs_password: 'pw' };
  const link = L.hysteria2Link(u, n);
  assert.match(link, /obfs=salamander/);
  assert.match(link, /obfs-password=pw/);
  assert.match(link, /insecure=0/);
  assert.doesNotMatch(link, /sni=/);
});

test('IPv6 主机加方括号', () => {
  const link = L.hysteria2Link({ uuid: 'abc' }, { host: '2001:db8::1', port: 443, sni: '', insecure: 0, obfs: '' });
  assert.match(link, /@\[2001:db8::1\]:443/);
});

test('isExpired / isOverLimit 各自判断，isActive 合并', () => {
  const now = Math.floor(Date.now() / 1000);
  assert.equal(L.isExpired({ expires_at: now - 10 }), true);
  assert.equal(L.isExpired({ expires_at: now + 100 }), false);
  assert.equal(L.isExpired({ expires_at: null }), false);

  assert.equal(L.isOverLimit({ traffic_limit: 100, up: 80, down: 40 }), true);
  assert.equal(L.isOverLimit({ traffic_limit: 100, up: 10, down: 20 }), false);
  assert.equal(L.isOverLimit({ traffic_limit: null, up: 1e9, down: 0 }), false);

  assert.equal(L.isActive({ expires_at: now + 100, traffic_limit: 100, up: 0, down: 0 }), true);
  assert.equal(L.isActive({ expires_at: now - 10 }), false);
  assert.equal(L.isActive({ expires_at: now + 100, banned: 1 }), false);
  assert.equal(L.isActive({ expires_at: now + 100, traffic_limit: 10, up: 9, down: 5 }), false);
});
