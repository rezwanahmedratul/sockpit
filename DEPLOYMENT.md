# SockPit — Linux VPS Deployment Guide

> Deploy the full SockPit stack (API Server, WebSocket Hub, Dashboard, PostgreSQL, Redis) on a Linux VPS with SSL, Nginx reverse proxy, and firewall — all automated with a single script.

---

## Table of Contents

1. [Prerequisites](#1-prerequisites)
2. [VPS Requirements](#2-vps-requirements)
3. [Quick Deploy (Automated Script)](#3-quick-deploy-automated-script)
4. [What the Script Does](#4-what-the-script-does)
5. [DNS Configuration](#5-dns-configuration)
6. [Post-Deployment](#6-post-deployment)
7. [Manual Deployment (Step-by-Step)](#7-manual-deployment-step-by-step)
8. [Firewall Configuration](#8-firewall-configuration)
9. [SSL Certificate Renewal](#9-ssl-certificate-renewal)
10. [Updating SockPit](#10-updating-sockpit)
11. [Backup & Restore](#11-backup--restore)
12. [Monitoring & Logs](#12-monitoring--logs)
13. [Troubleshooting](#13-troubleshooting)

---

## 1. Prerequisites

| Requirement | Minimum |
|---|---|
| **OS** | Ubuntu 22.04 / 24.04 LTS or Debian 12 |
| **RAM** | 2 GB (4 GB recommended) |
| **CPU** | 1 vCPU (2 recommended) |
| **Disk** | 20 GB SSD |
| **Network** | Public IPv4 address |
| **Domain** | A domain or subdomain you control |
| **GitHub Access** | SSH key or personal access token (repo is private) |

> [!IMPORTANT]
> You must have **root** or **sudo** access to the VPS.

---

## 2. VPS Requirements

The script supports and has been tested on:

- **Ubuntu 22.04 LTS** / **Ubuntu 24.04 LTS**
- **Debian 12 (Bookworm)**

The following software will be **automatically installed** by the script if not already present:

- Docker Engine & Docker Compose v2
- Nginx
- Certbot (Let's Encrypt)
- Git
- UFW (firewall)
- OpenSSL (for generating secrets)

---

## 3. Quick Deploy (Automated Script)

### Step 1: SSH into your VPS

```bash
ssh root@YOUR_SERVER_IP
```

### Step 2: Download and run the install script

```bash
# Clone the repository (private — you'll need credentials)
git clone https://github.com/rezwanahmedratul/sockpit.git /opt/sockpit

# Make the script executable and run it
chmod +x /opt/sockpit/install.sh
sudo /opt/sockpit/install.sh
```

The script will interactively ask you for:

1. **Your domain name** (e.g., `panel.yourdomain.com`)
2. **Your email** (for Let's Encrypt SSL certificate notifications)

### Step 3: Point your domain to the server

After entering your domain, the script will **pause** and display your server's public IP address. At this point:

1. Go to your **domain registrar / DNS hosting provider** (Cloudflare, Namecheap, GoDaddy, etc.)
2. Create an **A record** pointing your domain to your server IP:

   | Type | Name | Value | TTL |
   |------|------|-------|-----|
   | A | `panel` (or `@` for root domain) | `YOUR_SERVER_IP` | 300 (5 min) |

3. Wait for DNS propagation (usually 1–5 minutes)
4. Press **Enter** in the terminal to continue

> [!TIP]
> If using **Cloudflare**, temporarily set the proxy status to **DNS only** (grey cloud) during setup. You can enable the orange cloud proxy later after SSL is configured.

### Step 4: Done!

The script will:
- Obtain an SSL certificate via Let's Encrypt
- Configure Nginx as a reverse proxy
- Build and start all Docker containers
- Run database migrations
- Seed the default admin user
- Configure the firewall

Your SockPit instance will be live at: **`https://YOUR_DOMAIN`**

---

## 4. What the Script Does

Here's everything the installation script automates:

```
1. System Update & Dependency Installation
   ├── Updates apt packages
   ├── Installs Docker, Docker Compose, Nginx, Certbot, Git, UFW
   └── Enables Docker service

2. Security & Secrets Generation
   ├── Generates random JWT_SECRET (64 chars)
   ├── Generates random ENCRYPTION_KEY (64 hex chars)
   ├── Generates random PostgreSQL password
   └── Creates .env from template

3. DNS Verification Pause
   ├── Displays server public IP
   ├── Instructs user to create A record
   └── Waits for user confirmation

4. SSL Certificate (Let's Encrypt)
   ├── Runs certbot in standalone mode
   └── Obtains certificate for the domain

5. Nginx Reverse Proxy Setup
   ├── Dashboard → port 3002
   ├── API (/api/) → port 3000
   ├── WebSocket (/ws/) → port 3001
   ├── Downloads (/downloads/) → static files
   └── HTTP → HTTPS redirect

6. Docker Stack Deployment
   ├── Builds server and dashboard images
   ├── Starts PostgreSQL, Redis, Server, Dashboard
   └── Waits for health checks

7. Database Initialization
   ├── Runs all migrations
   └── Seeds default admin user

8. Firewall Configuration
   ├── Allows SSH (22)
   ├── Allows HTTP (80)
   ├── Allows HTTPS (443)
   └── Denies everything else by default

9. SSL Auto-Renewal
   └── Certbot auto-renewal is enabled by default
```

---

## 5. DNS Configuration

### Required DNS Records

| Type | Name | Value | Purpose |
|------|------|-------|---------|
| **A** | `your-domain.com` or subdomain | Server IP | Points domain to your VPS |

### Optional (if using subdomains for API/WS separately)

| Type | Name | Value | Purpose |
|------|------|-------|---------|
| A | `api.your-domain.com` | Server IP | Dedicated API subdomain |
| A | `ws.your-domain.com` | Server IP | Dedicated WebSocket subdomain |

> [!NOTE]
> The default Nginx configuration serves everything under a **single domain**. API routes are under `/api/`, WebSocket under `/ws/`, and the dashboard at `/`. Separate subdomains are optional and require manual Nginx edits.

---

## 6. Post-Deployment

### Default Admin Credentials

| Field | Value |
|-------|-------|
| **Email** | `admin@sockpit.local` |
| **Password** | `changeme123` |

> [!CAUTION]
> **Change the default admin password immediately** after your first login at `https://YOUR_DOMAIN`.

### Verify the deployment

```bash
# Check all containers are running
docker compose -f /opt/sockpit/docker-compose.prod.yml ps

# Test the API health endpoint
curl https://YOUR_DOMAIN/api/health

# Check Nginx status
sudo systemctl status nginx

# View server logs
docker compose -f /opt/sockpit/docker-compose.prod.yml logs -f server
```

---

## 7. Manual Deployment (Step-by-Step)

If you prefer to deploy manually instead of using the script:

### 7.1 Install Dependencies

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y ca-certificates curl gnupg git ufw

# Install Docker
curl -fsSL https://get.docker.com | sh
sudo systemctl enable --now docker

# Install Nginx & Certbot
sudo apt install -y nginx certbot python3-certbot-nginx
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
DATABASE_URL=postgresql://sockpit:YOUR_STRONG_DB_PASSWORD@postgres:5432/sockpit?sslmode=disable
POSTGRES_USER=sockpit
POSTGRES_PASSWORD=YOUR_STRONG_DB_PASSWORD
POSTGRES_DB=sockpit

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
NEXT_PUBLIC_API_URL=https://YOUR_DOMAIN/api
NEXT_PUBLIC_WS_URL=wss://YOUR_DOMAIN/ws
```

### 7.4 Get SSL Certificate

```bash
sudo certbot certonly --standalone -d YOUR_DOMAIN --agree-tos -m your@email.com
```

### 7.5 Configure Nginx

Create `/etc/nginx/sites-available/sockpit`:

```nginx
server {
    listen 80;
    server_name YOUR_DOMAIN;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name YOUR_DOMAIN;

    ssl_certificate /etc/letsencrypt/live/YOUR_DOMAIN/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/YOUR_DOMAIN/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;

    # Dashboard
    location / {
        proxy_pass http://127.0.0.1:3002;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # API
    location /api/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # WebSocket
    location /ws/ {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_read_timeout 86400s;
        proxy_send_timeout 86400s;
    }

    # Agent binary downloads
    location /downloads/ {
        alias /opt/sockpit/downloads/;
        autoindex off;
    }
}
```

Enable the site:

```bash
sudo ln -s /etc/nginx/sites-available/sockpit /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx
```

### 7.6 Build & Start Docker Containers

```bash
cd /opt/sockpit
docker compose -f docker-compose.prod.yml up -d --build
```

### 7.7 Run Migrations & Seed Admin

```bash
docker compose -f docker-compose.prod.yml exec server npx node-pg-migrate up --migrations-dir migrations
docker compose -f docker-compose.prod.yml exec server node src/seeds/001_admin_user.js
```

### 7.8 Configure Firewall

```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow 22/tcp    # SSH
sudo ufw allow 80/tcp    # HTTP
sudo ufw allow 443/tcp   # HTTPS
sudo ufw --force enable
```

---

## 8. Firewall Configuration

The install script configures UFW with sensible defaults. If agents connect via SOCKS5 through specific ports, you may need to open additional ports:

```bash
# Open a SOCKS5 port range (if agents expose ports directly)
sudo ufw allow 10000:20000/tcp

# Check firewall status
sudo ufw status verbose
```

---

## 9. SSL Certificate Renewal

Let's Encrypt certificates are valid for 90 days. Certbot sets up automatic renewal via a systemd timer. Verify it's working:

```bash
# Check timer
sudo systemctl list-timers | grep certbot

# Dry-run renewal test
sudo certbot renew --dry-run

# The renewal hook restarts Nginx automatically
```

---

## 10. Updating SockPit

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

## 11. Backup & Restore

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

## 12. Monitoring & Logs

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
curl -s https://YOUR_DOMAIN/api/health | jq .
```

---

## 13. Troubleshooting

### Containers won't start

```bash
# Check for build errors
docker compose -f /opt/sockpit/docker-compose.prod.yml logs server

# Common fix: rebuild from scratch
docker compose -f /opt/sockpit/docker-compose.prod.yml down
docker compose -f /opt/sockpit/docker-compose.prod.yml up -d --build --force-recreate
```

### SSL certificate issues

```bash
# Make sure port 80 is open and Nginx is stopped during cert provisioning
sudo systemctl stop nginx
sudo certbot certonly --standalone -d YOUR_DOMAIN
sudo systemctl start nginx
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
# Ensure Nginx is proxying WebSocket upgrade headers
sudo nginx -t

# Test WebSocket endpoint
curl -i -N \
  -H "Connection: Upgrade" \
  -H "Upgrade: websocket" \
  -H "Sec-WebSocket-Version: 13" \
  -H "Sec-WebSocket-Key: test" \
  https://YOUR_DOMAIN/ws/
```

### Port conflicts

```bash
# Check what's using the ports
sudo ss -tlnp | grep -E '3000|3001|3002|80|443'
```

### Reset everything

```bash
cd /opt/sockpit
docker compose -f docker-compose.prod.yml down -v   # WARNING: destroys database data
docker compose -f docker-compose.prod.yml up -d --build
docker compose -f docker-compose.prod.yml exec server npx node-pg-migrate up --migrations-dir migrations
docker compose -f docker-compose.prod.yml exec server node src/seeds/001_admin_user.js
```
