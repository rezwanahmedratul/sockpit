# SockPit — Deployment Guide

> Deploy the SockPit stack (API Server, WebSocket Hub, Dashboard, PostgreSQL, Redis) on a Linux VPS or LXC container. This guide assumes you manage your own reverse proxy (e.g., Pangolin, Nginx Proxy Manager, Traefik, Caddy) and will point a domain to SockPit's IP address yourself.

---

## Table of Contents

1. [Prerequisites](#1-prerequisites)
2. [System Requirements](#2-system-requirements)
3. [Quick Deploy (Automated Script)](#3-quick-deploy-automated-script)
4. [What the Script Does](#4-what-the-script-does)
5. [Post-Deployment](#5-post-deployment)
6. [Reverse Proxy Configuration](#6-reverse-proxy-configuration)
7. [Manual Deployment (Step-by-Step)](#7-manual-deployment-step-by-step)
8. [Firewall Configuration](#8-firewall-configuration)
9. [Updating SockPit](#9-updating-sockpit)
10. [Backup & Restore](#10-backup--restore)
11. [Monitoring & Logs](#11-monitoring--logs)
12. [Troubleshooting](#12-troubleshooting)

---

## 1. Prerequisites

| Requirement | Minimum |
|---|---|
| **OS** | Ubuntu 22.04 / 24.04 LTS or Debian 12 |
| **RAM** | 2 GB (4 GB recommended) |
| **CPU** | 1 vCPU (2 recommended) |
| **Disk** | 20 GB SSD |
| **Network** | Reachable IP address (public VPS or LAN for homelab LXC) |
| **GitHub Access** | SSH key or personal access token (if repo is private) |

> [!IMPORTANT]
> You must have **root** or **sudo** access to the VPS or LXC container.

---

## 2. System Requirements

The script supports and has been tested on:

- **Ubuntu 22.04 LTS** / **Ubuntu 24.04 LTS**
- **Debian 12 (Bookworm)**
- **Proxmox LXC containers** (Debian/Ubuntu based)

The following software will be **automatically installed** by the script if not already present:

- Docker Engine & Docker Compose v2
- Git
- OpenSSL (for generating secrets)

> [!NOTE]
> **No reverse proxy, Nginx, Certbot, or SSL tooling is installed.** You are expected to handle domain routing and SSL termination via your own proxy manager (e.g., Pangolin, Nginx Proxy Manager, Traefik, Caddy).

---

## 3. Quick Deploy (Automated Script)

### Step 1: SSH into your VPS or LXC container

```bash
ssh root@YOUR_SERVER_IP
```

### Step 2: Clone and run the installer

```bash
# Clone the repository (private — you'll need credentials)
git clone https://github.com/rezwanahmedratul/sockpit.git /opt/sockpit

# Make the script executable and run it
chmod +x /opt/sockpit/install.sh
sudo /opt/sockpit/install.sh
```

The script will interactively ask you for:

1. **Your domain name** (e.g., `panel.yourdomain.com`) — used to set API/WebSocket/Dashboard URLs in the `.env` file.

### Step 3: Point your domain

After the script finishes, configure your external reverse proxy (Pangolin, NPM, etc.) to route traffic:

| Service | Internal Target | Purpose |
|---------|----------------|---------|
| `/` (default) | `http://SERVER_IP:3002` | Next.js Dashboard |
| `/api/` | `http://SERVER_IP:3000` | REST API |
| `/ws/` or WebSocket | `http://SERVER_IP:3001` | Agent WebSocket (must support Upgrade headers) |

> [!IMPORTANT]
> The WebSocket endpoint **must** have `Connection: Upgrade` and `Upgrade: websocket` headers forwarded. Without this, agents cannot connect.

### Step 4: Done!

Your SockPit instance will be accessible at your configured domain.

---

## 4. What the Script Does

Here's everything the installation script automates:

```
1. System Update & Dependency Installation
   ├── Updates apt packages
   ├── Installs Docker, Docker Compose, Git, OpenSSL
   └── Enables Docker service

2. Security & Secrets Generation
   ├── Generates random JWT_SECRET (64 chars)
   ├── Generates random ENCRYPTION_KEY (64 hex chars)
   ├── Generates random PostgreSQL password
   └── Creates .env from inputs

3. Docker Stack Deployment
   ├── Builds server and dashboard images
   ├── Starts PostgreSQL, Redis, Server, Dashboard
   └── Waits for health checks

4. Database Initialization
   ├── Runs all migrations
   └── Seeds default admin user
```

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

# Test the API health endpoint (from the server itself)
curl http://localhost:3000/api/health

# View server logs
docker compose -f /opt/sockpit/docker-compose.prod.yml logs -f server
```

---

## 6. Reverse Proxy Configuration

SockPit does **not** manage its own reverse proxy. You must configure routing in your own proxy manager.

### Exposed Ports

| Port | Service | Protocol |
|------|---------|----------|
| `3000` | REST API Server | HTTP |
| `3001` | WebSocket Hub | HTTP + WebSocket Upgrade |
| `3002` | Next.js Dashboard | HTTP |

### Routing Rules (for Pangolin / NPM / Traefik / Caddy)

Point your domain (e.g. `panel.yourdomain.com`) to your server's IP and configure these routes:

| Path / Location | Upstream Target | Notes |
|-----------------|-----------------|-------|
| `/` (default) | `http://SERVER_IP:3002` | Dashboard (Next.js) |
| `/api/*` | `http://SERVER_IP:3000` | REST API |
| WebSocket / `/ws/*` | `http://SERVER_IP:3001` | **Must** forward `Upgrade` and `Connection` headers, set read timeout to `86400s` |

### WebSocket Proxy Requirements

The agent WebSocket connection is **persistent and long-lived** (heartbeat every 30s). Your proxy **must**:

1. Forward `Upgrade: websocket` and `Connection: upgrade` headers.
2. Set a long read/write timeout (at minimum `86400` seconds / 24 hours).
3. Not buffer responses.

### Example: Pangolin

In Pangolin, create a new site pointing to your SockPit server's IP. Add three upstream targets for ports `3000`, `3001`, and `3002`. Enable WebSocket support for the port `3001` target.

### Example: Nginx Proxy Manager (NPM)

Create a Proxy Host for your domain:
- **Domain**: `panel.yourdomain.com`
- **Forward Hostname / IP**: `YOUR_SERVER_IP`
- **Forward Port**: `3002`
- Enable **WebSockets Support**
- Under **Advanced**, add custom Nginx configuration for API and WS routing.

### Example: Caddy (Caddyfile)

```
panel.yourdomain.com {
    handle /api/* {
        reverse_proxy SERVER_IP:3000
    }

    handle /ws/* {
        reverse_proxy SERVER_IP:3001
    }

    handle {
        reverse_proxy SERVER_IP:3002
    }
}
```

---

## 7. Manual Deployment (Step-by-Step)

If you prefer to deploy manually instead of using the script:

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

Edit `.env` with production values:

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

# URLs — replace with your actual domain
DASHBOARD_URL=https://YOUR_DOMAIN
AGENT_DOWNLOAD_BASE_URL=https://YOUR_DOMAIN/downloads

# Dashboard Build-time Environment
NEXT_PUBLIC_API_URL=https://YOUR_DOMAIN/api
NEXT_PUBLIC_WS_URL=wss://YOUR_DOMAIN/ws
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

### 7.6 Configure Your Reverse Proxy

Point your domain to the server IP in your external proxy manager and configure routes as described in [Section 6](#6-reverse-proxy-configuration).

---

## 8. Firewall Configuration

If your VPS has a firewall (UFW), allow the required ports:

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
> If your reverse proxy runs on the **same machine**, you can keep ports 3000–3002 closed to the public and only allow `localhost` access. If it runs externally (e.g., Pangolin on another server), these ports must be reachable from the proxy.

If agents expose SOCKS5 ports directly on this machine, open them too:

```bash
# Example: open a SOCKS5 port range
sudo ufw allow 10000:20000/tcp
```

> [!NOTE]
> **Homelab LXC Note**: If running inside a Proxmox LXC container, the host firewall (Proxmox Firewall or iptables on the host) controls inbound access. UFW inside the container may not be necessary — check your Proxmox network configuration.

---

## 9. Updating SockPit

To update to the latest version:

```bash
cd /opt/sockpit

# Pull latest code
git pull origin main

# Rebuild and restart containers
docker compose -f docker-compose.prod.yml up -d --build

# Run any new migrations
docker compose -f docker-compose.prod.yml exec server npx node-pg-migrate up --migrations-dir migrations

# Verify
docker compose -f docker-compose.prod.yml ps
```

---

## 10. Backup & Restore

### Backup PostgreSQL

```bash
# One-time backup
docker compose -f /opt/sockpit/docker-compose.prod.yml exec postgres \
  pg_dump -U sockpit sockpit | gzip > ~/sockpit-backup-$(date +%Y%m%d).sql.gz
```

### Automated Daily Backups

Add to crontab (`crontab -e`):

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

### View Container Logs

```bash
# All services
docker compose -f /opt/sockpit/docker-compose.prod.yml logs -f

# Specific service
docker compose -f /opt/sockpit/docker-compose.prod.yml logs -f server
docker compose -f /opt/sockpit/docker-compose.prod.yml logs -f dashboard
docker compose -f /opt/sockpit/docker-compose.prod.yml logs -f postgres
docker compose -f /opt/sockpit/docker-compose.prod.yml logs -f redis
```

### Check Container Resource Usage

```bash
docker stats --no-stream
```

### Health Check

```bash
curl -s http://localhost:3000/api/health | jq .
```

---

## 12. Troubleshooting

### Containers won't start

```bash
# Check for build errors
docker compose -f /opt/sockpit/docker-compose.prod.yml logs server

# Common fix: rebuild from scratch
docker compose -f /opt/sockpit/docker-compose.prod.yml down
docker compose -f /opt/sockpit/docker-compose.prod.yml up -d --build --force-recreate
```

### Database connection errors

```bash
# Check if PostgreSQL is healthy
docker compose -f /opt/sockpit/docker-compose.prod.yml exec postgres pg_isready -U sockpit

# Check environment variables
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

# If this works but your domain doesn't, the issue is in your reverse proxy config.
# Ensure WebSocket upgrade headers are being forwarded.
```

### Port conflicts

```bash
# Check what's using the ports
sudo ss -tlnp | grep -E '3000|3001|3002'
```

### LXC container-specific issues

```bash
# If Docker fails to start inside an LXC container, ensure the container is
# configured as "privileged" or has the required AppArmor/nesting features enabled.
# In Proxmox, check: Options → Features → nesting=1, keyctl=1

# Verify Docker works
docker run --rm hello-world
```

### Reset everything

```bash
cd /opt/sockpit
docker compose -f docker-compose.prod.yml down -v   # WARNING: destroys database data
docker compose -f docker-compose.prod.yml up -d --build
docker compose -f docker-compose.prod.yml exec server npx node-pg-migrate up --migrations-dir migrations
docker compose -f docker-compose.prod.yml exec server node src/seeds/001_admin_user.js
```
