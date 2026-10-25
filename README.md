# XPanel

控制面板。管理节点、用户与订阅链接，通过 UniProxy 接口驱动节点端程序完成下发与计量。

[English](README.en.md) · [节点端 NodeX](https://github.com/wooxi/nodex) · [路由器版](https://github.com/wooxi/nodex-luci) · [容器版](https://github.com/wooxi/nodex-docker)

---

## 定位

XPanel 是这套方案的控制面：唯一的数据源，唯一的用户入口。节点端按周期来拉配置并回传流量，XPanel 落库、计算配额、生成订阅。

它面向自建与小队使用，不是商业化面板。没有支付网关、工单系统、开放注册和邀请码——只保留管理员后台。这个取舍决定了它的体积：常驻内存十几 MB，数据全部落在一个 SQLite 文件里。

## 功能

**节点**

- 面向 Hysteria 2，覆盖域名、端口、SNI、证书校验、Salamander 混淆与上下行带宽
- 每个节点独立通信 Token，一键复制对接信息
- 节点级启停，停用后立即停止下发用户
- 最后通信时间与心跳状态

**用户**

- 到期时间与流量配额，支持不限量
- 上下行限速、设备数限制
- 一键重置 UUID（连接密码）或订阅 Token
- 流量清零与手动校准
- 到期或超量后自动从节点侧撤下，同时订阅接口返回提示节点而非空配置，避免客户端误删已导入的配置

**订阅**

| 客户端 | 说明 |
|---|---|
| Clash / Mihomo | 完整策略组与规则集，输出 YAML |
| Shadowrocket | Base64 订阅，首行为配额与到期提示 |
| 通用 | 按 User-Agent 自动选择格式 |
| 单节点 | 标准 `hysteria2://` URI，便于快速验证 |

**模板**

Clash 模板在线编辑，可改策略组、健康检查参数与规则集，带语法高亮与格式化。模板支持变量占位符，节点与分组在渲染时注入。可随时恢复内置默认模板。

内置模板的规则集与策略组参数对齐 XBoard 的默认配置，两者可互换使用。

**运行记录**

登录、订阅拉取、节点同步三类事件落库并可按来源筛选。节点同步按用户与时间窗口去重，不会因为节点每 60 秒轮询而淹没日志。记录保留 30 天后自动清理。

## 部署

```bash
git clone https://github.com/wooxi/xpanel
cd xpanel

cat > .env <<'EOF'
ADMIN_USER=admin
ADMIN_PASS=change-me-to-something-long
EOF

docker compose up -d
```

默认监听 `7002`，访问 `http://<host>:7002`。`.env` 只在首次启动时用于初始化管理员，之后可在「设置」中修改密码并同时注销其他会话。

### 环境变量

| 变量 | 默认值 | 说明 |
|---|---|---|
| `ADMIN_USER` | `admin` | 初始管理员账号 |
| `ADMIN_PASS` | — | 初始密码，首次启动写入数据库 |
| `PORT` | `7002` | 监听端口 |
| `DATA_DIR` | `/data` | 数据目录，含 SQLite 与 WAL |

## 对接节点

节点端可以是 [NodeX](https://github.com/wooxi/nodex)、[路由器版](https://github.com/wooxi/nodex-luci)、[容器版](https://github.com/wooxi/nodex-docker)，或任何实现 UniProxy 接口的程序。

1. XPanel → 节点 → 新建，保存后复制对接信息
2. 节点端填写面板地址、节点 Token、节点 ID
3. 节点类型留空，由面板返回决定
4. 拉取与推送间隔建议 60 秒

保存后节点开始拉取参数与用户名单，并上报流量与心跳。

> 节点端的面板地址是**全局**配置而非按节点区分。一个节点端实例同时只能对接一个面板。

## 数据

全部状态在 `DATA_DIR/xpanel.db`（SQLite with WAL）。

```bash
docker compose exec xpanel sh -c 'sqlite3 /data/xpanel.db ".backup /data/backup.db"'
```

备份时连同 `-wal`、`-shm` 一起复制，或先停容器。反向代理部署时请确保 `/sub/*` 与 `/api/*` 路径不被改写。

## 兼容性

| 项 | 要求 |
|---|---|
| 运行时 | Node.js 22 |
| 平台 | `linux/amd64`，镜像基于 `node:22-alpine` |
| 数据库 | SQLite 3，随镜像提供 |
| 反向代理 | 需透传 `X-Forwarded-For`，订阅接口按 UA 分流 |

## 许可

待补充。
