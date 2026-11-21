# XPanel 管理 API 参考

所有管理接口（除 `/api/login` 与 `/api/logout` 外）均需携带登录后返回的 `xp_sid` Cookie。

## 目录
- [1. 认证与会话](#1-认证与会话)
- [2. 节点管理](#2-节点管理)
- [3. 用户管理](#3-用户管理)
- [4. 系统设置与日志](#4-系统设置与日志)

---

## 1. 认证与会话

```bash
# 登录并保存 Cookie
curl -s -c /tmp/xp.cookie -X POST http://127.0.0.1:7002/api/login \
  -H 'content-type: application/json' \
  -d '{"username":"admin","password":"your-password"}'

# 检查会话与面板当前 base URL
curl -s -b /tmp/xp.cookie http://127.0.0.1:7002/api/session
```

---

## 2. 节点管理

### 查询节点列表
```bash
curl -s -b /tmp/xp.cookie http://127.0.0.1:7002/api/nodes
```
返回字段中 `online: true` 表示最近 300 秒内有心跳/上报，`token` 为该节点专用对接密钥。

### 添加 Hysteria2 节点
```bash
curl -s -b /tmp/xp.cookie -X POST http://127.0.0.1:7002/api/nodes \
  -H 'content-type: application/json' \
  -d '{
    "name": "HK-HY2-01",
    "protocol": "hysteria2",
    "host": "hk.example.com",
    "port": 443,
    "sni": "hk.example.com",
    "insecure": false,
    "up_mbps": 100,
    "down_mbps": 200,
    "obfs": true,
    "obfs_password": "",
    "port_hopping": "20000-50000",
    "enabled": true
  }'
```
- `obfs: true` 且 `obfs_password` 留空时，后端自动生成 8 字节随机 hex 密码。
- 返回示例：`{"id": 1, "token": "a1b2c3...", "reality_public_key": ""}`。

### 添加 VLESS + Reality 节点
```bash
curl -s -b /tmp/xp.cookie -X POST http://127.0.0.1:7002/api/nodes \
  -H 'content-type: application/json' \
  -d '{
    "name": "JP-VLESS-Reality",
    "protocol": "vless",
    "host": "1.2.3.4",
    "port": 443,
    "sni": "www.microsoft.com",
    "network": "tcp",
    "tls_mode": 2,
    "flow": "xtls-rprx-vision",
    "reality_dest": "www.microsoft.com:443",
    "reality_server_names": "www.microsoft.com",
    "enabled": true
  }'
```
- `tls_mode`: `2` = Reality，`1` = TLS，`0` = 不加密。
- 当 `protocol="vless"` 且 `tls_mode=2` 时，若 `reality_private_key` / `reality_public_key` / `reality_short_ids` 留空，后端会自动生成 X25519 密钥对与 shortId。

### 更新 / 删除 / 重置节点 Token
- 更新节点：`PUT /api/nodes/:id`（传入需修改的字段）
- 删除节点：`DELETE /api/nodes/:id`
- 重置节点通信密钥：`POST /api/nodes/:id/token`

---

## 3. 用户管理

### 创建用户
```bash
curl -s -b /tmp/xp.cookie -X POST http://127.0.0.1:7002/api/users \
  -H 'content-type: application/json' \
  -d '{
    "name": "user-01",
    "expires_date": "2027-12-31",
    "traffic_limit_gb": 100,
    "speed_limit": 0,
    "device_limit": 3,
    "node_ids": []
  }'
```
- `expires_date`: `YYYY-MM-DD` 或 `""`（长期有效）。
- `traffic_limit_gb`: 数字或 `null`（不限流量）。
- `node_ids`: 空数组 `[]` 表示可用全部启用节点；传入节点 ID 数组则仅限指定节点。

### 常用用户操作
- 查询用户：`GET /api/users`
- 更新用户：`PUT /api/users/:id`
- 删除用户：`DELETE /api/users/:id`
- 重置已用流量：`POST /api/users/:id/reset-traffic`
- 更换订阅令牌：`POST /api/users/:id/reset-sub`
- 重置连接 UUID：`POST /api/users/:id/reset-uuid`
- 订阅入口：`GET /sub/<sub_token>`（支持 `?flag=clash|rocket|general`）

---

## 4. 系统设置与日志

- 读取 / 更新基础设置：`GET /api/settings`、`PUT /api/settings`（字段：`panel_url`、`sub_name`、`pull_interval`、`push_interval`）
- 查询运行日志：`GET /api/logs?source=node&limit=50`（`source` 可选 `auth`、`sub`、`node`）
- 概览数据：`GET /api/overview`
