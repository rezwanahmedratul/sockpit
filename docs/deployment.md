# Deployment Guide

## Overview

SockPit is designed to be self-hosted. This document covers deployment options, from local development to production.

---

## Development Setup

### Prerequisites

- Node.js 20+
- Rust 1.75+ (for local agent development only; production builds via GitHub Actions)
- `cross` tool (optional, for local cross-compilation)
- PostgreSQL 16
- Redis 7
- Docker & Docker Compose (optional)

### Quick Start with Docker Compose

```yaml
# docker-compose.yml
version: '3.9'

services:
  # ---- PostgreSQL ----
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: sockpit
      POSTGRES_PASSWORD: sockpit_dev_password
      POSTGRES_DB: sockpit
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U sockpit"]
      interval: 5s
      timeout: 5s
      retries: 5

  # ---- Redis ----
  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 5s
      retries: 5

  # ---- Backend API Server ----
  server:
    build:
      context: ./server
      dockerfile: Dockerfile
    ports:
      - "3000:3000"
      - "3001:3001"
    environment:
      NODE_ENV: development
      PORT: 3000
      WS_PORT: 3001
      DATABASE_URL: postgresql://sockpit:sockpit_dev_password@postgres:5432/sockpit
      REDIS_URL: redis://redis:6379
      JWT_SECRET: dev-jwt-secret-change-in-production
      ENCRYPTION_KEY: 0123456789abcdef0123456789abcdef
      DASHBOARD_URL: http://localhost:3002
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    volumes:
      - ./server/src:/app/src
      - ./installers:/app/installers

  # ---- Dashboard Frontend ----
  dashboard:
    build:
      context: ./dashboard
      dockerfile: Dockerfile
    ports:
      - "3002:3000"
    environment:
      NEXT_PUBLIC_API_URL: http://localhost:3000/api
      NEXT_PUBLIC_WS_URL: ws://localhost:3001
    depends_on:
      - server
    volumes:
      - ./dashboard/src:/app/src

volumes:
  postgres_data:
  redis_data:
```

### Server Dockerfile

```dockerfile
# server/Dockerfile
FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

EXPOSE 3000 3001

CMD ["node", "src/index.js"]
```

### Dashboard Dockerfile

```dockerfile
# dashboard/Dockerfile
FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

EXPOSE 3000

CMD ["npm", "run", "dev"]
```

### Running Development

```bash
# Start all services
docker compose up -d

# Run migrations
docker compose exec server npm run migrate

# Seed admin user
docker compose exec server npm run seed

# View logs
docker compose logs -f server
docker compose logs -f dashboard
```

---

## Production Deployment

### Architecture

```
                    ┌──────────────┐
                    │   Nginx /    │
                    │  Cloudflare  │
                    │  (TLS term)  │
                    └──────┬───────┘
                           │
              ┌────────────┼────────────┐
              │            │            │
              ▼            ▼            ▼
     ┌──────────────┐ ┌──────────┐ ┌──────────┐
     │  Dashboard   │ │   API    │ │  WS      │
     │  (port 3002) │ │ (3000)   │ │ (3001)   │
     └──────────────┘ └────┬─────┘ └────┬─────┘
                           │            │
                    ┌──────┴────────────┘
                    │
           ┌───────┴────────┐
           │                │
     ┌─────┴─────┐   ┌─────┴─────┐
     │ PostgreSQL │   │   Redis   │
     └───────────┘   └───────────┘
```

### Nginx Configuration

```nginx
# /etc/nginx/sites-available/sockpit
server {
    listen 443 ssl http2;
    server_name sockpit.example.com;

    ssl_certificate /etc/letsencrypt/live/sockpit.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/sockpit.example.com/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;

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

    # WebSocket for agents
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
        alias /var/www/sockpit/downloads/;
        autoindex off;
    }
}
```

### Production Docker Compose

```yaml
# docker-compose.prod.yml
version: '3.9'

services:
  postgres:
    image: postgres:16-alpine
    restart: always
    environment:
      POSTGRES_USER: ${DB_USER}
      POSTGRES_PASSWORD: ${DB_PASSWORD}
      POSTGRES_DB: sockpit
    volumes:
      - postgres_data:/var/lib/postgresql/data
    networks:
      - internal

  redis:
    image: redis:7-alpine
    restart: always
    command: redis-server --requirepass ${REDIS_PASSWORD}
    volumes:
      - redis_data:/data
    networks:
      - internal

  server:
    build:
      context: ./server
      dockerfile: Dockerfile.prod
    restart: always
    environment:
      NODE_ENV: production
      PORT: 3000
      WS_PORT: 3001
      DATABASE_URL: postgresql://${DB_USER}:${DB_PASSWORD}@postgres:5432/sockpit
      REDIS_URL: redis://:${REDIS_PASSWORD}@redis:6379
      JWT_SECRET: ${JWT_SECRET}
      ENCRYPTION_KEY: ${ENCRYPTION_KEY}
      DASHBOARD_URL: https://${DOMAIN}
    ports:
      - "127.0.0.1:3000:3000"
      - "127.0.0.1:3001:3001"
    networks:
      - internal
    depends_on:
      - postgres
      - redis

  dashboard:
    build:
      context: ./dashboard
      dockerfile: Dockerfile.prod
    restart: always
    environment:
      NEXT_PUBLIC_API_URL: https://${DOMAIN}/api
      NEXT_PUBLIC_WS_URL: wss://${DOMAIN}/ws
    ports:
      - "127.0.0.1:3002:3000"
    networks:
      - internal
    depends_on:
      - server

volumes:
  postgres_data:
  redis_data:

networks:
  internal:
    driver: bridge
```

### Production .env

```env
# .env.production
DOMAIN=sockpit.example.com
DB_USER=sockpit_prod
DB_PASSWORD=CHANGE_ME_STRONG_PASSWORD
REDIS_PASSWORD=CHANGE_ME_REDIS_PASSWORD
JWT_SECRET=CHANGE_ME_64_CHAR_RANDOM_STRING
ENCRYPTION_KEY=CHANGE_ME_32_BYTE_HEX_KEY
```

---

## Agent Binary Distribution

### Built via GitHub Actions

Agent binaries are **not compiled locally** for production. They are cross-compiled automatically via GitHub Actions CI/CD on every tagged release.

See [github-actions.md](github-actions.md) for the full workflow.

### Local Development Builds (Optional)

```bash
# Install Rust cross-compilation tool
cargo install cross

# Windows AMD64
cross build --release --target x86_64-pc-windows-msvc

# Linux AMD64
cargo build --release --target x86_64-unknown-linux-gnu

# Linux ARM64
cross build --release --target aarch64-unknown-linux-gnu
```

Production binaries are automatically uploaded to GitHub Releases and served from `/var/www/sockpit/downloads/` via Nginx.

### Generate Checksums

```bash
cd target/release
sha256sum sockpit-agent* > checksums.txt
```

---

## Backup Strategy

### PostgreSQL

```bash
# Daily backup cron job
0 2 * * * pg_dump -U sockpit sockpit | gzip > /backups/sockpit-$(date +\%Y\%m\%d).sql.gz

# Keep 30 days of backups
find /backups -name "sockpit-*.sql.gz" -mtime +30 -delete
```

### Redis

Redis is used for caching and session management only — can be rebuilt from PostgreSQL if lost.

---

## Monitoring

### Health Check Endpoint

```
GET /api/health

Response:
{
  "status": "ok",
  "database": "connected",
  "redis": "connected",
  "agents_online": 18,
  "uptime_seconds": 86400
}
```

### Recommended Monitoring Stack

- **Prometheus** + **Grafana** for metrics
- **Loki** for log aggregation
- **Uptime Kuma** or **Healthchecks.io** for uptime monitoring
- **PgHero** for PostgreSQL monitoring
