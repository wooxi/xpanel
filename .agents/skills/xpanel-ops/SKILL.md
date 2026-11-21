---
name: xpanel-ops
description: XPanel 控制面板与 NodeX 节点端全链路运维与部署技能。当用户需要部署或升级 XPanel 面板、在服务器/Docker/OpenWrt路由器上部署 NodeX 节点端、通过 API 或控制台添加/管理代理节点（Hysteria2 / VLESS）与用户订阅、配置节点对接、或排查节点离线/心跳/订阅异常时触发。
---

# XPanel + NodeX 系统运维指南

本系统采用「控制面与节点端分离」架构：
- **XPanel**（控制面板）：管理节点、用户、配额与订阅，监听默认端口 `7002`，通过 `/api/v1/server/UniProxy` 与节点端通信。
- **NodeX**（节点端）：拉取配置与用户、托管 Xray / Hysteria2 内核、上报流量与心跳。同一套源码提供三种分发形态：**标准二进制版 (`nodex`)**、**容器版 (`nodex-docker`)**、**OpenWrt 路由器版 (`nodex-luci`)**。

---

## 第一步：探测目标环境（强制前置检查）

在执行任何部署或运维操作前，先确认目标主机的操作系统、架构与运行时环境（本地执行或通过 `ssh` 远程执行）：

```bash
sh scripts/probe_env.sh
# 或远程执行（兼容 OpenWrt ash 与 Linux bash）：
ssh <host> 'sh -s' < scripts/probe_env.sh
```

根据探测结果选择对应形态：

| 目标环境特征 | 面板推荐方案 | 节点端推荐方案 |
|---|---|---|
| 通用 Linux 服务器 / LXC（有 Docker） | `xpanel` Docker Compose | `nodex-docker`（需 `network_mode: host`） |
| 通用 Linux 服务器（无 Docker / 轻量优先） | Node.js 22 直接运行 `server.js` | `nodex` 二进制 + systemd |
| OpenWrt 路由器（有 `opkg` / `/etc/openwrt_release`） | 不建议部署在路由器 | `nodex-luci`（`ipk` 包 + LuCI 界面） |

---

## 第二步：标准工作流

### 场景 A：部署 XPanel 控制面板

1. 克隆仓库 `https://github.com/wooxi/xpanel`，准备 `.env`（首次启动会初始化管理员账号密码）：
   ```env
   ADMIN_USER=admin
   ADMIN_PASS=<强密码>
   ```
2. **Docker Compose 部署**：
   ```bash
   docker compose up -d
   ```
   若已存在运行中的数据目录 `./data`，严禁删除或覆盖 `./data/xpanel.db`。
3. **验证可用性**：`curl -I http://<host>:7002/` 返回 `200 OK`。
4. **公网对接提醒**：若节点端部署在公网而面板在内网/反代后，需在面板「设置 → 面板公开地址（`panel_url`）」填写节点可达的完整 URL（如 `https://panel.example.com`），并确保反代透传 `X-Forwarded-For` 且不改写 `/sub/*` 与 `/api/*`。

### 场景 B：通过 API 自动化添加节点 / 管理用户

智能体应优先通过 XPanel HTTP API 完成节点创建、用户管理与状态核验，无需手工操作界面。完整接口字段与 `curl` 示例见 [references/xpanel-api.md](references/xpanel-api.md)。

核心步骤：
1. `POST /api/login` 登录获取 `xp_sid` Cookie。
2. `POST /api/nodes` 创建节点（支持 `hysteria2` 或 `vless`），响应会返回 `id`（节点 ID）与 `token`（每个节点独立通信密钥）。
3. 记住三项对接信息：
   - **面板地址**：`<panel_url>/api/v1/server/UniProxy`
   - **节点 ID**：`<id>`
   - **对接密钥**：`<token>`（注意：XPanel 为**每节点独立 Token**）

### 场景 C：部署节点端并对接面板

根据第一步探测到的目标设备系统，按 [references/nodex-deploy.md](references/nodex-deploy.md) 执行对应部署：
- **Linux 服务器 / Docker**：部署 `nodex` 或 `nodex-docker`，放行对应节点端口（Hysteria2 需放行 UDP，若有 `port_hopping` 需配置端口跳跃范围）。
- **OpenWrt 路由器**：安装 `nodex_*.ipk` + `luci-app-nodex_*.ipk` 与 `xray`/`hysteria` 内核（注意路由器闪存/内存空间及防火墙入站规则）。

### 场景 D：核验上线与排障

1. 调用 `GET /api/nodes` 检查目标节点的 `online` 是否为 `true`、`last_report_at` 是否更新。
2. 调用 `GET /api/logs?source=node` 查看节点拉取配置记录。
3. 常见异常排查清单：
   - **节点一直「待上报」**：检查节点端填写的面板地址是否包含 `/api/v1/server/UniProxy`、节点 ID 与 Token 是否一一对应、容器版是否启用了 `network_mode: host`。
   - **客户端连不上但面板显示在线**：检查服务器/路由器防火墙是否放行对应端口（HY2 为 UDP，VLESS 为 TCP），以及 TLS/SNI/Reality 公钥（`reality_public_key`）是否一致。
   - **订阅拉取为空或提示已停用/已过期**：检查用户 `banned`、`expires_at`、`traffic_limit` 以及 `user_nodes` 节点绑定范围。
