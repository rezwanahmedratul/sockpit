# Docker Agent Design

## Overview

The Docker agent is a containerized version of the SockPit agent. It allows users to deploy a SOCKS5 proxy server on any machine with Docker installed — without needing to install binaries directly on the host OS. This is the most portable and easiest installation method.

The Docker image is built and published automatically via GitHub Actions to **GitHub Container Registry (ghcr.io)** and optionally **Docker Hub**.

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│              Host Machine (any OS with Docker)        │
│                                                       │
│  ┌─────────────────────────────────────────────────┐ │
│  │         Docker Container                         │ │
│  │         sockpit/agent:latest                     │ │
│  │                                                  │ │
│  │  ┌──────────────────────────────────────────┐   │ │
│  │  │         sockpit-agent (Rust binary)       │   │ │
│  │  │                                           │   │ │
│  │  │  ┌─────────────┐  ┌──────────────────┐   │   │ │
│  │  │  │ WebSocket   │  │  SOCKS5 Engine   │   │   │ │
│  │  │  │ Client      │  │  (multi-port)    │   │   │ │
│  │  │  └─────────────┘  └──────────────────┘   │   │ │
│  │  │                                           │   │ │
│  │  │  ┌─────────────┐  ┌──────────────────┐   │   │ │
│  │  │  │ Metrics     │  │  Config Manager  │   │   │ │
│  │  │  │ Collector   │  │  (/etc/sockpit/) │   │   │ │
│  │  │  └─────────────┘  └──────────────────┘   │   │ │
│  │  └──────────────────────────────────────────┘   │ │
│  │                                                  │ │
│  │  Exposed Ports: dynamic (SOCKS5 ports)           │ │
│  │  Volume: /etc/sockpit/ (config persistence)      │ │
│  └─────────────────────────────────────────────────┘ │
│                                                       │
│  Docker network: host (recommended) or bridge         │
└─────────────────────────────────────────────────────┘
```

---

## Docker Image

### Dockerfile

```dockerfile
# agent/Dockerfile
# Multi-stage build for minimal image size

# ---- Stage 1: Build ----
FROM rust:1.75-slim AS builder

WORKDIR /build
COPY Cargo.toml Cargo.lock ./
COPY src/ ./src/

# Build release binary
RUN cargo build --release --target x86_64-unknown-linux-gnu

# ---- Stage 2: Runtime ----
FROM debian:bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Create non-root user
RUN useradd --system --no-create-home --shell /usr/sbin/nologin sockpit

# Copy binary
COPY --from=builder /build/target/x86_64-unknown-linux-gnu/release/sockpit-agent /usr/local/bin/sockpit-agent

# Create config directory
RUN mkdir -p /etc/sockpit && chown sockpit:sockpit /etc/sockpit

USER sockpit

ENTRYPOINT ["sockpit-agent"]
CMD ["--config", "/etc/sockpit/config.json"]
```

### Image Tags

| Tag | Description |
|-----|-------------|
| `ghcr.io/your-org/sockpit-agent:latest` | Latest stable release |
| `ghcr.io/your-org/sockpit-agent:1.0.0` | Specific version |
| `ghcr.io/your-org/sockpit-agent:1.0` | Latest patch in 1.0.x |

---

## Installation Methods

### Method 1: One-Liner (Dashboard Generated)

The dashboard generates a Docker-specific install command with the install token baked in:

```bash
docker run -d \
  --name sockpit-agent \
  --restart always \
  --network host \
  -e SOCKPIT_SERVER_URL="wss://sockpit.example.com:3001" \
  -e SOCKPIT_INSTALL_TOKEN="abc123def456..." \
  ghcr.io/your-org/sockpit-agent:latest
```

### Method 2: Docker Compose

For users who prefer Docker Compose:

```yaml
# docker-compose.agent.yml
version: '3.9'

services:
  sockpit-agent:
    image: ghcr.io/your-org/sockpit-agent:latest
    container_name: sockpit-agent
    restart: always
    network_mode: host           # Required for SOCKS5 port access
    environment:
      SOCKPIT_SERVER_URL: "wss://sockpit.example.com:3001"
      SOCKPIT_INSTALL_TOKEN: "abc123def456..."
    volumes:
      - sockpit_config:/etc/sockpit   # Persist config after registration

volumes:
  sockpit_config:
```

### Method 3: Config File Mount

For advanced users with a pre-existing `config.json`:

```bash
docker run -d \
  --name sockpit-agent \
  --restart always \
  --network host \
  -v /path/to/config.json:/etc/sockpit/config.json:ro \
  ghcr.io/your-org/sockpit-agent:latest
```

---

## Environment Variables

The Docker agent accepts configuration via environment variables (which override `config.json`):

| Variable | Required | Description | Default |
|----------|----------|-------------|---------|
| `SOCKPIT_SERVER_URL` | Yes (first run) | WebSocket server URL | — |
| `SOCKPIT_INSTALL_TOKEN` | Yes (first run) | One-time install token | — |
| `SOCKPIT_AGENT_TOKEN` | No | Persistent agent token (set after registration) | — |
| `SOCKPIT_HEARTBEAT_INTERVAL` | No | Heartbeat interval in seconds | `30` |
| `SOCKPIT_METRICS_INTERVAL` | No | Metrics report interval in seconds | `60` |
| `SOCKPIT_LOG_LEVEL` | No | Log verbosity: debug, info, warn, error | `info` |

### First Run vs. Subsequent Runs

```
First Run:
  SOCKPIT_INSTALL_TOKEN provided
  → Agent registers with server
  → Receives agent_token
  → Saves to /etc/sockpit/config.json (volume)

Subsequent Runs:
  config.json already has agent_token
  → SOCKPIT_INSTALL_TOKEN ignored
  → Agent reconnects using saved agent_token
```

---

## Networking

### Recommended: Host Network Mode

```bash
docker run --network host ...
```

- SOCKS5 ports are directly accessible on the host
- No port mapping needed
- Agent reports the host's actual IP to the dashboard
- **Required for dynamic port allocation** (ports are added/removed via dashboard)

### Alternative: Bridge Mode with Port Mapping

If host networking isn't available (e.g., Docker Desktop on Mac/Windows):

```bash
docker run \
  -p 1080:1080 \
  -p 1081:1081 \
  -p 1082:1082 \
  ...
```

> ⚠️ **Limitation**: In bridge mode, ports must be mapped at container start. Dynamic port addition from the dashboard requires container restart with new `-p` flags. **Host mode is strongly recommended.**

---

## Data Persistence

| Path | Purpose | Volume Recommended |
|------|---------|-------------------|
| `/etc/sockpit/config.json` | Agent config + token | ✅ Yes (required for reconnect after restart) |

```bash
# Named volume (recommended)
docker volume create sockpit_config
docker run -v sockpit_config:/etc/sockpit ...

# Bind mount (alternative)
docker run -v /host/path/sockpit:/etc/sockpit ...
```

---

## Container Metrics

When running in Docker, the agent collects container-level metrics:

```rust
// src/metrics/docker.rs
// Detect Docker environment via /.dockerenv or cgroup

pub fn is_docker() -> bool {
    std::path::Path::new("/.dockerenv").exists()
}

pub fn collect_docker_metrics() -> SystemMetrics {
    // In Docker, sysinfo still works for CPU and memory
    // but reports container limits, not host resources
    // (when cgroup limits are set)
    let mut sys = System::new_all();
    sys.refresh_all();

    SystemMetrics {
        cpu_usage: sys.global_cpu_info().cpu_usage() as f64,
        memory_usage: (sys.used_memory() as f64 / sys.total_memory() as f64) * 100.0,
        ..Default::default()
    }
}
```

The dashboard displays Docker-deployed servers with a 🐳 Docker badge alongside the OS icon.

---

## Health Check

The Docker image includes a built-in health check:

```dockerfile
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD ["sockpit-agent", "--health-check"]
```

The `--health-check` flag makes the agent:
1. Verify WebSocket connection is active
2. Verify SOCKS5 listeners are running
3. Exit 0 (healthy) or exit 1 (unhealthy)

---

## Uninstallation

```bash
# Stop and remove container
docker stop sockpit-agent
docker rm sockpit-agent

# Remove persisted config
docker volume rm sockpit_config

# Remove image
docker rmi ghcr.io/your-org/sockpit-agent:latest
```

---

## Comparison: Installation Methods

| Feature | Windows (.exe) | Linux (bash) | Docker |
|---------|---------------|-------------|--------|
| OS Support | Windows 10/11 | Linux (systemd) | Any OS with Docker |
| Auto-start | Windows Service | systemd unit | `--restart always` |
| Firewall mgmt | Automatic (netsh) | Automatic (iptables/firewalld) | Not needed (host mode) |
| Dynamic ports | ✅ Yes | ✅ Yes | ✅ Yes (host mode only) |
| Binary updates | Manual / agent update | Manual / agent update | `docker pull` + restart |
| Isolation | Runs on host | Runs on host | Container isolated |
| Resource limits | N/A | N/A | Docker resource constraints |
| Portability | Windows only | Linux only | Any platform |
