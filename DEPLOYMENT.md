# SockPit — Deployment Guide

> Deploy the SockPit stack (API Server, WebSocket Hub, Dashboard, PostgreSQL, Redis) on a Linux VPS or LXC container. Each service gets its own dedicated subdomain.

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [System Requirements](#2-system-requirements)
3. [Quick Deploy (Automated Script)](#3-quick-deploy-automated-script)
4. [Proxy Modes](#4-proxy-modes)
5. [Post-Deployment](#5-post-deployment)
6. [External Proxy Configuration](#6-external-proxy-configuration)
7. [Manual Deployment (Step-by-Step)](#7-manual-deployment-step-by-step)
8. [Firewall Configuration](#8-firewall-configuration)
9. [Updating SockPit](#9-updating-sockpit)
10. [Backup & Restore](#10-backup--restore)
11. [Monitoring & Logs](#11-monitoring--logs)
12. [Troubleshooting](#12-troubleshooting)

---

## 1. Architecture Overview

SockPit uses **three separate subdomains** — one for each service:

| Subdomain | Internal Port | Service | Example |
|-----------|---------------|---------|---------|
| Dashboard | `3002` | Next.js Web UI | `panel.yourdomain.com` |
| API | `3000` | REST API Server | `api.yourdomain.com` |
| WebSocket | `3001` | Agent Communication Hub | `ws.yourdomain.com` |

```
┌─────────────────────────────────────────────────────────────────┐
│                     Your Reverse Proxy                          │
│           (Pangolin / NPM / Nginx / Traefik / Caddy)           │
├──────────────────┬──────────────────┬───────────────────────────┤
│ panel.domain.com │ api.domain.com   │ ws.domain.com             │
│     :443 SSL     │     :443 SSL     │     :443 SSL + WS Upgrade │
├──────────────────┼──────────────────┼───────────────────────────┤
│    ↓ :3002       │    ↓ :3000       │    ↓ :3001                │
├──────────────────┴──────────────────┴───────────────────────────┤
│                   SockPit Server (Docker)                       │
│   ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐      │
│   │Dashboard │  │API Server│  │ WS Hub   │  │PostgreSQL│      │
│   │  :3002   │  │  :3000   │  │  :3001   │  │  :5432   │      │
│   └──────────┘  └──────────┘  └──────────┘  └──────────┘      │
│                                              ┌──────────┐      │
│                                              │  Redis   │      │
│                                              │  :6379   │      │
│                                              └──────────┘      │
└─────────────────────────────────────────────────────────────────┘
```

---

## 2. System Requirements

| Requirement | Minimum |
|---|---|
| **OS** | Ubuntu 22.04 / 24.04 LTS or Debian 12 |
| **RAM** | 2 GB (4 GB recommended) |
| **CPU** | 1 vCPU (2 recommended) |
| **Disk** | 20 GB SSD |
| **Network** | Reachable IP (public VPS or LAN for homelab LXC) |

Supported environments:
- **Cloud VPS**: DigitalOcean, Hetzner, Linode, Vultr, AWS EC2, etc.
- **Homelab LXC**: Proxmox VE containers (Debian/Ubuntu based, nesting enabled)

---

## 3. Quick Deploy (Automated Script)

### Step 1: SSH into your server

```bash
ssh root@YOUR_SERVER_IP
```

### Step 2: Clone and run the installer

```bash
git clone https://github.com/rezwanahmedratul/sockpit.git /opt/sockpit
chmod +x /opt/sockpit/install.sh
sudo /opt/sockpit/install.sh
```

### Step 3: Follow the interactive prompts

The installer will ask:

1. **Proxy mode** — Dedicated (installs Nginx + Certbot) or External (BYO proxy)
2. **Three subdomain names** — Dashboard, API, and WebSocket domains

---

## 4. Proxy Modes

### Mode 1: Dedicated Proxy (Nginx + Certbot)

Choose this if you want SockPit to manage its own reverse proxy and SSL certificates on the same server.

**What gets installed:**
- Nginx (with 3 virtual hosts — one per subdomain)
- Certbot (Let's Encrypt SSL with auto-renewal)

**What you need to do:**
- Create 3 A records pointing your subdomains to the server IP
- The installer handles everything else (SSL provisioning, Nginx config, renewal hooks)

### Mode 2: External Proxy (BYO)

Choose this if you already run a proxy manager like **Pangolin, Nginx Proxy Manager, Traefik, or Caddy** on another machine or your homelab gateway.

**What gets installed:**
- Only Docker and the SockPit stack (no Nginx, no Certbot)

**What you need to do:**
- Point 3 subdomains in your proxy manager to this server's IP and ports:

| Subdomain | Target | Notes |
|-----------|--------|-------|
| `panel.yourdomain.com` | `http://SERVER_IP:3002` | Standard HTTP proxy |
| `api.yourdomain.com` | `http://SERVER_IP:3000` | Standard HTTP proxy |
| `ws.yourdomain.com` | `http://SERVER_IP:3001` | **Must enable WebSocket support** |

---

## 5. Post-Deployment

### Default Admin Credentials

| Field | Value |
|-------|-------|
| **Email** | `admin@sockpit.local` |
| **Password** | `changeme123` |

> [!CAUTION]
> **Change the default admin password immediately** after your first login.

### Verify the deployment

```bash
# Check all containers are running
docker compose -f /opt/sockpit/docker-compose.prod.yml ps

# Test the API health endpoint
curl http://localhost:3000/api/health

# View server logs
docker compose -f /opt/sockpit/docker-compose.prod.yml logs -f server
```

---

## 6. External Proxy Configuration

If you chose **External Proxy mode**, configure routing in your proxy manager:

### WebSocket Requirements

The `ws.yourdomain.com` target is a **persistent, long-lived WebSocket connection** (heartbeat every 30s). Your proxy **must**:

1. Forward `Upgrade: websocket` and `Connection: upgrade` headers
2. Set read/write timeout to at least `86400` seconds (24 hours)
3. Disable response buffering

### Pangolin

Create three sites in Pangolin, each pointing to the server IP with the respective port. Enable WebSocket for the port `3001` target.

### Nginx Proxy Manager (NPM)

Create 3 Proxy Hosts:

| Domain | Forward IP | Forward Port | WebSocket |
|--------|-----------|--------------|-----------|
| `panel.yourdomain.com` | `SERVER_IP` | `3002` | Off |
| `api.yourdomain.com` | `SERVER_IP` | `3000` | Off |
| `ws.yourdomain.com` | `SERVER_IP` | `3001` | **On** |

Enable SSL (Let's Encrypt) on each host via NPM's built-in SSL tab.

### Caddy (Caddyfile)

```
panel.yourdomain.com {
    reverse_proxy SERVER_IP:3002
}

api.yourdomain.com {
    reverse_proxy SERVER_IP:3000
}

ws.yourdomain.com {
    reverse_proxy SERVER_IP:3001
}
```

### Traefik (Docker labels)

```yaml
labels:
  - "traefik.http.routers.sockpit-dash.rule=Host(`panel.yourdomain.com`)"
  - "traefik.http.services.sockpit-dash.loadbalancer.server.port=3002"
  - "traefik.http.routers.sockpit-api.rule=Host(`api.yourdomain.com`)"
  - "traefik.http.services.sockpit-api.loadbalancer.server.port=3000"
  - "traefik.http.routers.sockpit-ws.rule=Host(`ws.yourdomain.com`)"
  - "traefik.http.services.sockpit-ws.loadbalancer.server.port=3001"
```

---

## 7. Manual Deployment (Step-by-Step)

### 7.1 Install Dependencies

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y ca-certificates curl gnupg git openssl

# Install Docker
curl -fsSL https://get.docker.com | sh
sudo systemctl enable --now docker
```

### 7.2 Clone the Repository

```bash
git clone https://github.com/rezwanahmedratul/sockpit.git /opt/sockpit
cd /opt/sockpit
```

### 7.3 Create Environment File

```bash
cp .env.example .env
```

Edit `.env` with your three subdomains:

```env
# Server
PORT=3000
WS_PORT=3001
NODE_ENV=production

# Database
POSTGRES_DB=sockpit
POSTGRES_USER=sockpit
POSTGRES_PASSWORD=YOUR_STRONG_DB_PASSWORD
DATABASE_URL=postgresql://sockpit:YOUR_STRONG_DB_PASSWORD@postgres:5432/sockpit?sslmode=disable

# Redis
REDIS_URL=redis://redis:6379

# Auth — generate with: openssl rand -base64 48
JWT_SECRET=YOUR_64_CHAR_RANDOM_STRING
JWT_EXPIRES_IN=24h
JWT_REFRESH_EXPIRES_IN=7d

# Encryption — generate with: openssl rand -hex 32
ENCRYPTION_KEY=YOUR_64_HEX_CHAR_KEY

# URLs — each service gets its own subdomain
DASHBOARD_URL=https://panel.yourdomain.com
AGENT_DOWNLOAD_BASE_URL=https://api.yourdomain.com/downloads

# Dashboard connects to API and WS via their subdomains
NEXT_PUBLIC_API_URL=https://api.yourdomain.com
NEXT_PUBLIC_WS_URL=wss://ws.yourdomain.com
```

### 7.4 Build & Start Docker Containers

```bash
cd /opt/sockpit
docker compose -f docker-compose.prod.yml up -d --build
```

### 7.5 Run Migrations & Seed Admin

```bash
docker compose -f docker-compose.prod.yml exec server npx node-pg-migrate up --migrations-dir migrations
docker compose -f docker-compose.prod.yml exec server node src/seeds/001_admin_user.js
```

### 7.6 Configure Your Proxy

Point the 3 subdomains to the server as described in [Section 6](#6-external-proxy-configuration).

---

## 8. Firewall Configuration

```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow 22/tcp     # SSH
sudo ufw allow 3000/tcp   # API Server
sudo ufw allow 3001/tcp   # WebSocket Hub
sudo ufw allow 3002/tcp   # Dashboard
sudo ufw --force enable
```

> [!TIP]
> If your reverse proxy runs on the **same machine**, you can restrict ports 3000–3002 to localhost only. If it runs externally (Pangolin on another box), keep them open.

If agents expose SOCKS5 ports directly:

```bash
sudo ufw allow 10000:20000/tcp
```

> [!NOTE]
> **Homelab LXC**: If running inside a Proxmox LXC container, the host firewall controls inbound access. UFW inside the container may not work — configure access via Proxmox Firewall or host iptables instead.

---

## 9. Updating SockPit

```bash
cd /opt/sockpit
git pull origin main
docker compose -f docker-compose.prod.yml up -d --build
docker compose -f docker-compose.prod.yml exec server npx node-pg-migrate up --migrations-dir migrations
docker compose -f docker-compose.prod.yml ps
```

---

## 10. Backup & Restore

### Backup PostgreSQL

```bash
docker compose -f /opt/sockpit/docker-compose.prod.yml exec postgres \
  pg_dump -U sockpit sockpit | gzip > ~/sockpit-backup-$(date +%Y%m%d).sql.gz
```

### Automated Daily Backups

```cron
0 3 * * * docker compose -f /opt/sockpit/docker-compose.prod.yml exec -T postgres pg_dump -U sockpit sockpit | gzip > /opt/sockpit/backups/sockpit-$(date +\%Y\%m\%d).sql.gz 2>/dev/null
0 4 * * * find /opt/sockpit/backups -name "*.sql.gz" -mtime +30 -delete
```

### Restore from Backup

```bash
gunzip < ~/sockpit-backup-YYYYMMDD.sql.gz | docker compose -f /opt/sockpit/docker-compose.prod.yml exec -T postgres psql -U sockpit sockpit
```

---

## 11. Monitoring & Logs

```bash
# All services
docker compose -f /opt/sockpit/docker-compose.prod.yml logs -f

# Specific service
docker compose -f /opt/sockpit/docker-compose.prod.yml logs -f server
docker compose -f /opt/sockpit/docker-compose.prod.yml logs -f dashboard
```

```bash
# Container resource usage
docker stats --no-stream

# Health check
curl -s http://localhost:3000/api/health | jq .
```

---

## 12. Troubleshooting

### Containers won't start

```bash
docker compose -f /opt/sockpit/docker-compose.prod.yml logs server
docker compose -f /opt/sockpit/docker-compose.prod.yml down
docker compose -f /opt/sockpit/docker-compose.prod.yml up -d --build --force-recreate
```

### Database connection errors

```bash
docker compose -f /opt/sockpit/docker-compose.prod.yml exec postgres pg_isready -U sockpit
docker compose -f /opt/sockpit/docker-compose.prod.yml exec server env | grep DATABASE
```

### WebSocket connection failures

```bash
# Test WebSocket endpoint directly (bypassing proxy)
curl -i -N \
  -H "Connection: Upgrade" \
  -H "Upgrade: websocket" \
  -H "Sec-WebSocket-Version: 13" \
  -H "Sec-WebSocket-Key: test" \
  http://localhost:3001/

# If this works but wss://ws.yourdomain.com doesn't, the issue is your proxy.
```

### LXC container issues

```bash
# Ensure nesting is enabled in Proxmox: Options → Features → nesting=1, keyctl=1
docker run --rm hello-world
```

### Reset everything

```bash
cd /opt/sockpit
docker compose -f docker-compose.prod.yml down -v   # WARNING: destroys database
docker compose -f docker-compose.prod.yml up -d --build
docker compose -f docker-compose.prod.yml exec server npx node-pg-migrate up --migrations-dir migrations
docker compose -f docker-compose.prod.yml exec server node src/seeds/001_admin_user.js
```
