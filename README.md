# SockPit — SOCKS5 Proxy Management Platform

<div align="center">

```
    ╔═══════════════════════════════════════════════════════════╗
    ║                                                           ║
    ║     ███████╗ ██████╗  ██████╗██╗  ██╗██████╗ ██╗████████╗ ║
    ║     ██╔════╝██╔═══██╗██╔════╝██║ ██╔╝██╔══██╗██║╚══██╔══╝ ║
    ║     ███████╗██║   ██║██║     █████╔╝ ██████╔╝██║   ██║    ║
    ║     ╚════██║██║   ██║██║     ██╔═██╗ ██╔═══╝ ██║   ██║    ║
    ║     ███████║╚██████╔╝╚██████╗██║  ██╗██║     ██║   ██║    ║
    ║     ╚══════╝ ╚═════╝  ╚═════╝╚═╝  ╚═╝╚═╝     ╚═╝   ╚═╝    ║
    ║                                                           ║
    ║           SOCKS5 Proxy Management Platform                ║
    ║        Multi-Tenant • Real-Time • Cross-Platform          ║
    ║                                                           ║
    ╚═══════════════════════════════════════════════════════════╝
```

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Rust](https://img.shields.io/badge/Agent-Rust_1.75+-orange.svg?logo=rust)](agent/)
[![Node.js](https://img.shields.io/badge/Backend-Node.js_v20+-green.svg?logo=node.js)](server/)
[![Next.js](https://img.shields.io/badge/Dashboard-Next.js_14+-black.svg?logo=next.js)](dashboard/)
[![Docker](https://img.shields.io/badge/Container-Docker_Compose-2496ED.svg?logo=docker)](docker-compose.prod.yml)
[![CI/CD](https://img.shields.io/badge/CI%2FCD-GitHub_Actions-2088FF.svg?logo=githubactions)](.github/workflows/build-agent.yml)

</div>

---

## 📖 Quick Links & Documentation Index

Jump directly to detailed component design documents:

| Document | Category | Description |
|----------|----------|-------------|
| 🌐 [**Deployment Guide**](DEPLOYMENT.md) | Deployment | Dual-mode production setup (Dedicated Proxy vs External BYO) |
| 🛠️ [**Windows Build Guide**](guide.md) | Build & Setup | Detailed steps for building `sockpit-agent.exe` with UAC elevation |
| 🏛️ [**Architecture**](docs/architecture.md) | Architecture | Hub-and-Spoke model, sequence diagrams, component interaction |
| 📡 [**REST API Reference**](docs/api-reference.md) | API | Complete REST API endpoint documentation with JSON payloads |
| 🔄 [**WebSocket Spec**](docs/websocket-protocol.md) | Real-time | Bidirectional WebSocket frame specifications & heartbeat system |
| 🗄️ [**Database Schema**](docs/database-schema.md) | Database | PostgreSQL tables, ER diagrams, indexes, and migration strategy |
| 🔐 [**Authentication & Security**](docs/authentication.md) | Security | JWT rotation, bcrypt password hashing, AES-256 encryption |
| 🔒 [**Security Considerations**](docs/security.md) | Security | TLS pinning, firewall rules, brute force protection, audit logs |
| ⚡ [**SOCKS5 Engine**](docs/socks5-engine.md) | Engine | RFC 1928/1929 implementation, connection limiting, multi-port |
| 🖥️ [**Frontend Dashboard**](docs/frontend.md) | Dashboard | Next.js App Router design, UI components, state management |
| ⚙️ [**Backend API Server**](docs/backend-api.md) | Server | Node.js Express server design, middleware, and service modules |
| 📜 [**Installer Generator**](docs/installer-generator.md) | Installation | One-click script generator for Windows, Linux, and Docker |
| 🪟 [**Windows Agent**](docs/agent-windows.md) | Agent | Windows Service integration, UAC elevation, netsh firewall |
| 🐧 [**Linux Agent**](docs/agent-linux.md) | Agent | Systemd service integration, iptables/firewalld management |
| 🐳 [**Docker Agent**](docs/agent-docker.md) | Agent | Containerized agent deployment, host networking, ghcr.io images |
| 🚀 [**GitHub Actions CI/CD**](docs/github-actions.md) | CI/CD | Cross-compilation pipeline for Windows, Linux, ARM64 & Docker |
| 🔄 [**User Flows**](docs/user-flows.md) | Workflows | Step-by-step user journeys from initial login to proxy setup |
| 📋 [**Deployment Spec**](docs/deployment.md) | Deployment | Architecture specifications for production environments |

---

## 🌟 Project Overview

**SockPit** is an enterprise-ready, multi-tenant SaaS platform designed to deploy, manage, and monitor SOCKS5 proxy servers across heterogeneous machine fleets (Windows, Linux, and Docker).

SockPit operates on a **Hub-and-Spoke** model:
- **Hub Server Stack**: Next.js 14 Web Dashboard + Node.js REST API & WebSocket Hub + PostgreSQL 16 + Redis 7.
- **Spoke Agents**: Ultra-lightweight, high-performance Rust daemons running on remote target machines as Windows Services, Linux systemd daemons, or Docker containers.

### Key Features

- 🚀 **One-Click Agent Deployment**: Generate single-line PowerShell, Bash, or Docker commands embedded with single-use installation tokens.
- ⚡ **High-Performance Rust Agent**: Multi-threaded, low-memory SOCKS5 proxy engine supporting RFC 1928 (SOCKS5) and RFC 1929 (Username/Password authentication).
- 🔒 **AES-256 Password Encryption**: Proxy user credentials encrypted at rest and in transit using 32-byte AES-256 keys.
- 📡 **Real-Time WebSocket Synchronization**: Instant port creation/deletion, credentials sync, and real-time CPU/RAM/Bandwidth metric streaming.
- 🪟 **Native Windows Integration**: Pre-configured with a UAC elevation manifest (`requireAdministrator`) and native Windows Service Control Manager (`sc.exe`) integration.
- 🐧 **Linux & LXC Support**: Runs seamlessly as a systemd service or inside unprivileged Proxmox LXC containers.
- 🐳 **Docker Host Networking**: Run containerized agents with dynamic multi-port binding using `--network host`.
- 🌐 **Flexible Reverse Proxy Options**: Supports a fully automated **Dedicated Proxy Mode** (Nginx + Certbot Let's Encrypt SSL) or an **External Proxy Mode** for custom proxies (Pangolin, Nginx Proxy Manager, Traefik, Caddy).

---

## 📐 System Architecture

```
                                  ┌──────────────────────────────────────────┐
                                  │            Next.js Dashboard             │
                                  │       (panel.yourdomain.com:3002)        │
                                  └────────────────────┬─────────────────────┘
                                                       │ HTTPS (JWT Auth)
                                                       ▼
                                  ┌──────────────────────────────────────────┐
                                  │            Node.js REST API              │
                                  │        (api.yourdomain.com:3000)         │
                                  └──────────┬────────────────────┬──────────┘
                                             │                    │
                                             ▼                    ▼
                                    ┌────────────────┐    ┌───────────────┐
                                    │ PostgreSQL 16  │    │    Redis 7    │
                                    │  (Data Store)  │    │(Cache/PubSub) │
                                    └────────────────┘    └───────────────┘
                                                       ▲
                                                       │ WSS (WebSocket)
                                                       │
                                  ┌────────────────────┴─────────────────────┐
                                  │           Node.js WebSocket Hub          │
                                  │         (ws.yourdomain.com:3001)         │
                                  └────────────────────┬─────────────────────┘
                                                       │
                                 ┌─────────────────────┼─────────────────────┐
                                 │ Persistent WSS      │ Persistent WSS      │ Persistent WSS
                                 ▼                     ▼                     ▼
                      ┌────────────────────┐┌────────────────────┐┌────────────────────┐
                      │   Windows Agent    ││    Linux Agent     ││    Docker Agent    │
                      │ (SockPitAgent.exe) ││ (sockpit.service)  ││ (ghcr.io/agent)    │
                      │  Windows Service   ││  systemd Daemon    ││ Containerized Host │
                      │  SOCKS5 Engine     ││  SOCKS5 Engine     ││  SOCKS5 Engine     │
                      └────────────────────┘└────────────────────┘└────────────────────┘
```

---

## 🌐 Subdomain Architecture & Proxy Routing

SockPit assigns **three separate subdomains** for maximum security, performance, and clean reverse proxy routing:

| Service | Subdomain Example | Internal Port | Description |
|---------|-------------------|---------------|-------------|
| **Dashboard** | `panel.yourdomain.com` | `3002` | Next.js Web User Interface |
| **REST API** | `api.yourdomain.com` | `3000` | Administrative & Agent REST APIs |
| **WebSocket** | `ws.yourdomain.com` | `3001` | Persistent Agent & Real-Time Client Gateway |

---

## 🚀 Quick Deployment Guide

For detailed instructions, refer to the full [**Deployment Guide**](DEPLOYMENT.md).

### Prerequisites

- **OS**: Ubuntu 22.04 / 24.04 LTS, Debian 12, or Proxmox LXC Container
- **RAM**: 2 GB minimum (4 GB recommended)
- **CPU**: 1 vCPU (2 recommended)
- **Access**: Root / sudo access

### Step 1: Clone Repository & Execute Installer

```bash
# SSH into your server
ssh root@YOUR_SERVER_IP

# Clone the repository
git clone https://github.com/rezwanahmedratul/sockpit.git /opt/sockpit
cd /opt/sockpit

# Make the installer executable and run
chmod +x install.sh
sudo ./install.sh
```

### Step 2: Select Proxy Mode & Enter Subdomains

The interactive installer will ask you to choose your proxy mode:

```
How do you want to handle reverse proxy & SSL?

  1) Dedicated proxy — Install Nginx + Certbot on this server.
     SockPit will manage its own reverse proxy and SSL/TLS certificates.

  2) External proxy (BYO) — I'll use my own proxy manager
     (Pangolin, NPM, Traefik, Caddy, etc.)
     SockPit will only expose raw ports for you to route.
```

#### Mode 1: Dedicated Proxy (Nginx + Certbot)
- Automatically installs Nginx and Certbot.
- Asks for your 3 subdomains (`panel.yourdomain.com`, `api.yourdomain.com`, `ws.yourdomain.com`) and cert notification email.
- Verifies A record DNS resolution.
- Provisions multi-domain Let's Encrypt SSL certificates and configures virtual hosts.
- Sets up systemd SSL auto-renewal hooks.

#### Mode 2: External Proxy (Bring Your Own Proxy)
- Bypasses Nginx and Certbot installation.
- Prompts for your 3 subdomains to generate internal environment bindings.
- Exposes raw internal ports:
  - Dashboard: `http://SERVER_IP:3002`
  - REST API: `http://SERVER_IP:3000`
  - WebSocket: `http://SERVER_IP:3001`

---

## 🔀 Reverse Proxy Configuration Examples (External Mode)

If using Mode 2 (External Proxy), point your domain to the server IP and map the three ports:

### 1. Pangolin Proxy
Add 3 upstream target sites pointing to your server's IP:
- `panel.yourdomain.com` → `http://SERVER_IP:3002`
- `api.yourdomain.com` → `http://SERVER_IP:3000`
- `ws.yourdomain.com` → `http://SERVER_IP:3001` *(Enable WebSocket Support)*

### 2. Nginx Proxy Manager (NPM)
Create 3 Proxy Hosts:

| Domain | Forward IP | Forward Port | WebSockets Support |
|--------|------------|--------------|------------------- |
| `panel.yourdomain.com` | `SERVER_IP` | `3002` | Off |
| `api.yourdomain.com` | `SERVER_IP` | `3000` | Off |
| `ws.yourdomain.com` | `SERVER_IP` | `3001` | **ON** |

### 3. Caddy (`Caddyfile`)
```caddy
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

---

## 🔐 Default Admin Credentials

Upon successful setup, database migrations auto-seed the primary administrative account:

| Field | Value |
|-------|-------|
| **Email** | `admin@sockpit.local` |
| **Password** | `changeme123` |

> ⚠️ **CAUTION**: Log into `https://panel.yourdomain.com` and change this password immediately in **Settings → Account**.

---

## 💻 Building the Agent Binary (`sockpit-agent`)

The Rust agent binary can be compiled natively, via Docker, or automatically using GitHub Actions. See [**guide.md**](guide.md) for a complete walkthrough.

### Option A: GitHub Actions Automated Build (Recommended)

Pushing a version tag (e.g. `v1.0.0`) triggers `.github/workflows/build-agent.yml`:
1. Runs `cargo test` and `cargo clippy`.
2. Cross-compiles binaries for:
   - `sockpit-agent-windows-amd64.exe` (with embedded UAC Administrator manifest)
   - `sockpit-agent-linux-amd64`
   - `sockpit-agent-linux-arm64`
3. Builds and pushes the Docker image to `ghcr.io/rezwanahmedratul/sockpit-agent:latest`.
4. Creates a GitHub Release with all compiled binaries attached.

### Option B: Native Windows Build

```powershell
# Navigate to agent crate
cd .\agent

# Compile release binary
cargo build --release
```
The output executable will be placed at `.\agent\target\release\sockpit-agent.exe`.

### Option C: Linux Cross-Compilation

```bash
# Add mingw-w64 toolchain for Windows targets
sudo apt-get install -y mingw-w64
rustup target add x86_64-pc-windows-gnu

# Compile Windows binary from Linux
cd agent
cargo build --release --target x86_64-pc-windows-gnu
```

---

## 📦 Deploying Agents on Target Machines (Spokes)

### 1. Windows Agent Deployment
1. Log in to the Dashboard (`https://panel.yourdomain.com`).
2. Navigate to **Installers** → Select **Windows**.
3. Copy the generated PowerShell one-liner command.
4. Open PowerShell as **Administrator** on the Windows target machine and execute.

**What happens under the hood:**
- Creates `C:\ProgramData\SockPit\`.
- Downloads `sockpit-agent.exe` and writes `config.json`.
- Registers a Windows Service named `SockPitAgent` configured for automatic startup.
- Configures Windows Firewall rules via `netsh advfirewall`.
- Starts the service.

### 2. Linux Agent Deployment
1. Navigate to **Installers** → Select **Linux**.
2. Copy the generated Bash command.
3. Run as `root` on the target machine.

**What happens under the hood:**
- Creates `/opt/sockpit/` and `/etc/sockpit/`.
- Installs `/etc/systemd/system/sockpit.service`.
- Adds firewall exceptions via `iptables` or `firewalld`.
- Enables and starts `sockpit.service`.

### 3. Docker Agent Deployment
Run the containerized agent using host networking mode:

```bash
docker run -d \
  --name sockpit-agent \
  --restart always \
  --network host \
  -e SOCKPIT_SERVER_URL="wss://ws.yourdomain.com" \
  -e SOCKPIT_INSTALL_TOKEN="YOUR_ONE_TIME_INSTALL_TOKEN" \
  -v sockpit_config:/etc/sockpit \
  ghcr.io/rezwanahmedratul/sockpit-agent:latest
```

---

## 🛠️ Stack & Technologies

| Layer | Component | Technologies |
|-------|-----------|--------------|
| **Frontend** | Dashboard | Next.js 14, React 18, Tailwind-free Vanilla CSS Modules |
| **Backend API** | REST Server | Node.js v20+, Express.js, JWT, bcrypt, Zod |
| **Real-time** | WebSocket Hub | Node.js `ws`, Redis PubSub subscriber |
| **Agent Spoke** | Proxy Agent | Rust 1.75+, Tokio, `tokio-tungstenite`, `sysinfo`, `windows-service` |
| **Database** | Primary Storage | PostgreSQL 16 Alpine, `node-pg-migrate` |
| **Cache & Queue** | Session / State | Redis 7 Alpine |
| **CI/CD** | Automated Builds | GitHub Actions, `dtolnay/rust-toolchain`, Cross |
| **Containerization**| Deployment | Docker, Docker Compose v2 |

---

## 📁 Repository Directory Structure

```
sockpit/
├── README.md                          # Master project documentation
├── LICENSE                            # MIT License definition
├── DEPLOYMENT.md                      # Comprehensive production deployment guide
├── guide.md                           # Compilation & Windows binary build guide
├── history.md                         # Project development history & changelog
├── install.sh                         # Interactive dual-mode production installer
├── docker-compose.prod.yml            # Multi-container production compose stack
├── .env.example                       # Environment variables configuration template
├── agent/                             # Rust Agent Source Code (Spoke)
│   ├── Cargo.toml                     # Cargo workspace definition & dependencies
│   ├── build.rs                       # Build script (links UAC manifest on Windows)
│   ├── sockpit-agent.exe.manifest     # Windows UAC requestedExecutionLevel manifest
│   ├── sockpit-agent.rc               # Resource script referencing manifest
│   └── src/                           # Rust source modules (socks5, ws, metrics, service)
├── server/                            # Node.js API & WebSocket Server (Hub)
│   ├── package.json                   # Server dependencies & scripts
│   ├── migrations/                    # SQL database migrations
│   └── src/                           # Express REST routes, WS handlers, seeds
├── dashboard/                         # Next.js 14 Frontend Web UI
│   ├── package.json                   # Next.js dependencies
│   └── src/                           # App Router pages, components, hooks, styles
└── docs/                              # Comprehensive Technical Documentation
    ├── architecture.md                # System architecture & sequence diagrams
    ├── api-reference.md               # Complete REST API specification
    ├── websocket-protocol.md          # Bidirectional WebSocket protocol spec
    ├── database-schema.md             # PostgreSQL schema, ER diagrams, indexes
    ├── authentication.md              # Auth system, JWT rotation, security
    ├── security.md                    # Transport security, encryption, audit logs
    ├── socks5-engine.md               # SOCKS5 proxy engine specification
    ├── frontend.md                    # Dashboard architecture & components
    ├── backend-api.md                 # Node.js API backend architecture
    ├── installer-generator.md         # Script generator implementation
    ├── agent-windows.md               # Windows service & manifest design
    ├── agent-linux.md                 # Linux systemd daemon design
    ├── agent-docker.md                # Docker agent container specification
    └── github-actions.md              # CI/CD cross-compilation pipeline spec
```

---

## 📄 License

This project is open-source software licensed under the [**MIT License**](LICENSE).

```text
Copyright (c) 2026 rezwanahmedratul

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions...
```

See the full text in the [LICENSE](file:///root/sockpit/LICENSE) file.
