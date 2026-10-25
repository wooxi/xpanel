# XPanel

A control panel. Manages nodes, users and subscription links, and drives node-side daemons over the UniProxy interface for provisioning and accounting.

[中文](README.md) · [NodeX daemon](https://github.com/wooxi/nodex) · [Router build](https://github.com/wooxi/nodex-luci) · [Container build](https://github.com/wooxi/nodex-docker)

---

## What it is

XPanel is the control plane: the single source of truth, the single entry point for users. Node daemons poll it for configuration and push traffic back; XPanel persists the numbers, evaluates quotas and renders subscriptions.

It is built for self-hosting and small teams, not for resale. No payment gateway, no ticketing, no public registration, no invite codes — just an admin console. That trade-off sets its footprint: a dozen megabytes resident, all state in one SQLite file.

## Features

**Nodes**

- Built for Hysteria 2: host, port, SNI, certificate verification, Salamander obfuscation, up/down bandwidth
- Per-node communication token, one-click copy of the connection details
- Per-node enable and disable; disabling withdraws users immediately
- Last-seen time and heartbeat state

**Users**

- Expiry date and traffic quota, or unlimited
- Up/down rate limits, device limit
- Reset the UUID (the connection secret) or the subscription token
- Reset or manually adjust consumed traffic
- Expired and over-quota users are pulled from nodes; their subscription still returns a notice entry instead of an empty profile, so clients do not drop imported configs

**Subscriptions**

| Client | Output |
|---|---|
| Clash / Mihomo | full proxy groups and rule set, YAML |
| Shadowrocket | Base64 list, quota and expiry on the first line |
| Generic | format chosen from the User-Agent |
| Single node | standard `hysteria2://` URI, useful for a quick check |

**Templates**

The Clash template is editable in the browser — proxy groups, health-check parameters, rule set — with syntax highlighting and formatting. Placeholders are filled at render time from the live node and group data. The built-in template can be restored at any point.

The bundled rule set and health-check parameters match XBoard's defaults, so templates are interchangeable between the two panels.

**Activity log**

Sign-in, subscription fetches and node syncs are recorded and filterable by source. Node syncs are deduplicated per user and time window, so a 60-second poll does not drown the log. Entries are pruned after 30 days.

## Deploy

```bash
git clone https://github.com/wooxi/xpanel
cd xpanel

cat > .env <<'EOF'
ADMIN_USER=admin
ADMIN_PASS=change-me-to-something-long
EOF

docker compose up -d
```

Listens on `7002`; open `http://<host>:7002`. `.env` only seeds the admin account on first start — afterwards the password can be changed from Settings, which also invalidates other sessions.

### Environment

| Variable | Default | Purpose |
|---|---|---|
| `ADMIN_USER` | `admin` | initial admin account |
| `ADMIN_PASS` | — | initial password, written to the database on first start |
| `PORT` | `7002` | listening port |
| `DATA_DIR` | `/data` | data directory holding the SQLite database and WAL |

## Connecting nodes

The node side can be [NodeX](https://github.com/wooxi/nodex), the [router build](https://github.com/wooxi/nodex-luci), the [container build](https://github.com/wooxi/nodex-docker), or any program implementing UniProxy.

1. XPanel → Nodes → add, save, then copy the connection details
2. On the node: panel URL, node token, node ID
3. Leave node type empty — the panel decides
4. Pull and push interval: 60 seconds

The node then starts pulling parameters and user lists, and reporting traffic and heartbeat.

> The panel URL is a **global** setting on the node side, not per node. One daemon instance talks to one panel at a time.

## Data

All state lives in `DATA_DIR/xpanel.db` (SQLite with WAL).

```bash
docker compose exec xpanel sh -c 'sqlite3 /data/xpanel.db ".backup /data/backup.db"'
```

Copy `-wal` and `-shm` along with the database, or stop the container first. When fronting with a reverse proxy, do not rewrite `/sub/*` or `/api/*`.

## Requirements

| Item | Requirement |
|---|---|
| Runtime | Node.js 22 |
| Platform | `linux/amd64`, image based on `node:22-alpine` |
| Database | SQLite 3, bundled |
| Reverse proxy | must forward `X-Forwarded-For`; the subscription endpoint dispatches on User-Agent |

## License

To be added.
