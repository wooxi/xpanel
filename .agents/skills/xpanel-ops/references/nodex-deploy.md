# NodeX 多环境部署与对接参考

NodeX 是 XPanel 的配套节点端程序，支持三种部署形态。无论哪种形态，**与 XPanel 对接时需填写的三要素完全一致**：
- **面板地址**：`http(s)://<panel-host>:7002/api/v1/server/UniProxy`（注意不同节点端版本对是否带后缀的要求，如 `nodex` 面板对接填面板根地址或完整 UniProxy 地址需按界面提示，XPanel 对接弹窗标准为 `<base>/api/v1/server/UniProxy`）
- **通信密钥**：XPanel 对应节点的 `token`
- **节点 ID**：XPanel 对应节点的 `id`
- **节点类型**：留空或按面板协议对应选择（Hysteria2 / VLESS）

## 目录
- [形态一：Docker 容器部署（推荐用于 Linux 服务器 / NAS / LXC）](#形态一docker-容器部署推荐用于-linux-服务器--nas--lxc)
- [形态二：Linux 二进制 + systemd 部署（无 Docker 服务器）](#形态二linux-二进制--systemd-部署无-docker-服务器)
- [形态三：OpenWrt 路由器部署（nodex-luci）](#形态三openwrt-路由器部署nodex-luci)

---

## 形态一：Docker 容器部署（推荐用于 Linux 服务器 / NAS / LXC）

适用于有 Docker 环境的 Linux 服务器，内置 Xray 与 Hysteria 2 内核。

1. 创建 `compose.yaml`：
```yaml
services:
  nodex:
    image: ghcr.io/wooxi/nodex-docker:latest
    container_name: nodex
    restart: unless-stopped
    network_mode: host
    volumes:
      - ./data:/etc/nodex
    environment:
      - TZ=Asia/Shanghai
```
> **关键要求**：必须使用 `network_mode: host`，因为节点监听端口由面板统一下发。

2. 启动容器：
```bash
docker compose up -d
```
3. 访问 `http://<host>:8888` 初始化管理密码，在 Web 界面填入面板地址、通信密钥与节点 ID 后启动节点。

---

## 形态二：Linux 二进制 + systemd 部署（无 Docker 服务器）

适用于无 Docker 的 Debian / Ubuntu / Alpine 服务器（支持 `x86_64` / `arm64`）。

1. 从 `https://github.com/wooxi/nodex/releases` 下载对应架构二进制，并安装 `xray` 与 `hysteria` 内核到 `/usr/bin/xray`、`/usr/bin/hysteria`（需 `chmod +x`）：
```bash
install -m 755 nodex-linux-amd64 /usr/local/bin/nodex
nodex -version
```
2. 注册 systemd 服务（`/etc/systemd/system/nodex.service`）：
```ini
[Unit]
Description=NodeX Daemon
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
ExecStart=/usr/local/bin/nodex start
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
```
3. 启动并设置开机自启：
```bash
systemctl daemon-reload
systemctl enable --now nodex
```
4. 访问 `http://<host>:8888` 完成面板对接。

---

## 形态三：OpenWrt 路由器部署（nodex-luci）

适用于 **OpenWrt 23.05+ (`x86_64`)** 路由器设备，常驻内存约 20 MB（不含内核）。

### 前置检查（路由器特有）
1. 确认架构与系统：`cat /etc/openwrt_release` 与 `uname -m`。
2. 检查剩余磁盘空间（`df -h /overlay`），确保足够存放 `xray` / `hysteria` 内核二进制。
3. 确认路由器是否有公网 IP 或端口转发，以及 OpenWrt 防火墙（`firewall4` / `nftables`）是否放行入站端口。

### 安装步骤
**方式 1：命令行安装**
```bash
# 下载内核
wget -O /usr/bin/xray      https://github.com/wooxi/nodex-luci/releases/latest/download/xray-linux-amd64
wget -O /usr/bin/hysteria  https://github.com/wooxi/nodex-luci/releases/latest/download/hysteria-linux-amd64
chmod +x /usr/bin/xray /usr/bin/hysteria

# 下载并安装 ipk（文件名以实际 Release 为准）
wget -O /tmp/nodex.ipk          https://github.com/wooxi/nodex-luci/releases/latest/download/nodex_amd64.ipk
wget -O /tmp/luci-app-nodex.ipk https://github.com/wooxi/nodex-luci/releases/latest/download/luci-app-nodex_all.ipk
opkg update && opkg install /tmp/nodex.ipk /tmp/luci-app-nodex.ipk

/etc/init.d/nodex enable
/etc/init.d/nodex start
```

**方式 2：LuCI 界面安装**
安装 `luci-app-nodex_*.ipk` 后，进入 **LuCI → 服务 → NodeX → 总览 → 后端状态 →「下载并安装后端」** 即可自动拉取守护进程与内核。

### 路由器对接与防火墙提示
1. 进入 **LuCI → 服务 → NodeX → 面板对接**，填入面板地址与通信密钥。
2. 进入 **节点管理 → 新增节点**，填写面板侧的节点 ID 与协议后启动。
3. 若节点对外提供服务，需在 OpenWrt **网络 → 防火墙 → 通信规则** 中放行对应监听端口（Hysteria2 放行 UDP，VLESS 放行 TCP）。
