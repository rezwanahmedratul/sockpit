# SOCKS5 Proxy Engine

## Overview

The SOCKS5 engine is part of the Rust agent binary. It implements RFC 1928 (SOCKS5 Protocol) with username/password authentication (RFC 1929) and adds connection limiting per user.

The agent is written in Rust for maximum performance, memory safety, and small binary size. Agent binaries are cross-compiled for all target platforms via GitHub Actions CI/CD.

## Architecture

```
┌─────────────────────────────────────────────────┐
│                  SOCKS5 Engine                   │
│                                                  │
│  ┌──────────────────────────────────────────┐   │
│  │            Port Manager                   │   │
│  │  Manages multiple TCP listeners           │   │
│  │                                           │   │
│  │  port 1080 ─► Listener → Handler          │   │
│  │  port 1081 ─► Listener → Handler          │   │
│  │  port 1082 ─► Listener → Handler          │   │
│  └──────────────────────────────────────────┘   │
│                       │                          │
│                       ▼                          │
│  ┌──────────────────────────────────────────┐   │
│  │         Auth Manager                      │   │
│  │  Username/password validation             │   │
│  │  Per-port user mapping                    │   │
│  │  Connection counting                      │   │
│  └──────────────────────────────────────────┘   │
│                       │                          │
│                       ▼                          │
│  ┌──────────────────────────────────────────┐   │
│  │        Connection Limiter                 │   │
│  │  Tracks active connections per user       │   │
│  │  Rejects when max_connections reached     │   │
│  └──────────────────────────────────────────┘   │
│                       │                          │
│                       ▼                          │
│  ┌──────────────────────────────────────────┐   │
│  │        Traffic Relay                      │   │
│  │  Bidirectional TCP proxy                  │   │
│  │  Bandwidth tracking                       │   │
│  └──────────────────────────────────────────┘   │
└─────────────────────────────────────────────────┘
```

## SOCKS5 Protocol Implementation

### Supported Features

| Feature | Status |
|---------|--------|
| CONNECT command | ✅ Supported |
| BIND command | ❌ Not planned |
| UDP ASSOCIATE | ❌ Not planned |
| No auth | ❌ Disabled (always require auth) |
| Username/Password auth (RFC 1929) | ✅ Supported |
| GSSAPI auth | ❌ Not planned |
| IPv4 | ✅ Supported |
| IPv6 | ✅ Supported |
| Domain name resolution | ✅ Supported |

### Connection Flow

```
Client                          SOCKS5 Server
  │                                  │
  │  1. Method Selection Request     │
  │  +----+----------+----------+    │
  │  |VER | NMETHODS | METHODS  |    │
  │  |0x05|   0x01   |   0x02   |    │  (0x02 = username/password)
  │  +----+----------+----------+    │
  │─────────────────────────────────►│
  │                                  │
  │  2. Method Selection Response    │
  │  +----+--------+                 │
  │  |VER | METHOD |                 │
  │  |0x05|  0x02  |                 │  (server accepts username/password)
  │  +----+--------+                 │
  │◄─────────────────────────────────│
  │                                  │
  │  3. Username/Password Auth       │
  │  +----+------+------+------+--+ │
  │  |VER |ULEN  | USER |PLEN |PW| │
  │  |0x01| len  | ...  | len |..| │
  │  +----+------+------+------+--+ │
  │─────────────────────────────────►│
  │                                  │  Validate credentials
  │                                  │  Check connection limit
  │                                  │
  │  4. Auth Response                │
  │  +----+--------+                 │
  │  |VER | STATUS |                 │
  │  |0x01|  0x00  |                 │  (0x00 = success)
  │  +----+--------+                 │
  │◄─────────────────────────────────│
  │                                  │
  │  5. CONNECT Request              │
  │  +----+-----+-------+------+----+----+
  │  |VER | CMD |  RSV  | ATYP | DST | PORT|
  │  |0x05|0x01 | 0x00  | ...  | ... | ... |
  │  +----+-----+-------+------+----+----+
  │─────────────────────────────────►│
  │                                  │  Connect to target
  │                                  │
  │  6. CONNECT Response             │
  │  +----+-----+-------+------+----+----+
  │  |VER | REP |  RSV  | ATYP | BND | PORT|
  │  |0x05|0x00 | 0x00  | ...  | ... | ... |
  │  +----+-----+-------+------+----+----+
  │◄─────────────────────────────────│
  │                                  │
  │  7. Bidirectional data relay     │
  │◄════════════════════════════════►│
```

## Rust Implementation Structure

```rust
// src/socks5/server.rs
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;
use tokio::net::TcpListener;

pub struct Socks5Server {
    listeners: Arc<RwLock<HashMap<u16, PortListener>>>,
    auth_manager: Arc<AuthManager>,
    conn_limiter: Arc<ConnectionLimiter>,
}

impl Socks5Server {
    /// Start a new SOCKS5 listener on the given port
    pub async fn add_port(&self, port: u16, users: Vec<UserCredential>) -> Result<(), Error>;

    /// Stop a SOCKS5 listener on the given port
    pub async fn remove_port(&self, port: u16) -> Result<(), Error>;

    /// Add a user to a specific port
    pub async fn add_user(&self, port: u16, user: UserCredential) -> Result<(), Error>;

    /// Remove a user from a specific port
    pub async fn remove_user(&self, port: u16, username: &str) -> Result<(), Error>;

    /// Update user credentials or limits
    pub async fn update_user(&self, port: u16, user: UserCredential) -> Result<(), Error>;

    /// Get current connection counts per user
    pub fn get_connection_counts(&self) -> HashMap<String, u32>;
}
```

```rust
// src/socks5/auth.rs
use std::collections::HashMap;
use std::sync::RwLock;

#[derive(Clone, Debug)]
pub struct UserCredential {
    pub id: String,
    pub username: String,
    pub password: String,
    pub max_connections: u32,
    pub is_active: bool,
}

pub struct AuthManager {
    /// port → username → credential
    users: RwLock<HashMap<u16, HashMap<String, UserCredential>>>,
}

impl AuthManager {
    pub fn authenticate(&self, port: u16, username: &str, password: &str) -> Result<UserCredential, AuthError>;
    pub fn add_user(&self, port: u16, cred: UserCredential) -> Result<(), Error>;
    pub fn remove_user(&self, port: u16, username: &str) -> Result<(), Error>;
}
```

```rust
// src/socks5/limiter.rs
use std::collections::HashMap;
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::RwLock;

pub struct ConnectionLimiter {
    /// user_id → current active count
    connections: RwLock<HashMap<String, AtomicU32>>,
    /// user_id → max allowed
    limits: RwLock<HashMap<String, u32>>,
}

impl ConnectionLimiter {
    pub fn try_acquire(&self, user_id: &str) -> bool;
    pub fn release(&self, user_id: &str);
    pub fn set_limit(&self, user_id: &str, max: u32);
    pub fn get_count(&self, user_id: &str) -> u32;
}
```

## Dynamic Reconfiguration

The SOCKS5 engine supports hot reconfiguration without restarting:

```
WebSocket Command ─► Agent Handler ─► SOCKS5 Engine
                                           │
                    ┌──────────────────────┤
                    ▼                      ▼
             Add/Remove Port        Add/Remove User
                    │                      │
                    ▼                      ▼
            Start/Stop TCP          Update Auth Table
            Listener                Update Conn Limits
```

### Operations that don't interrupt existing connections:
- Adding a new SOCKS5 user
- Updating max_connections for a user
- Adding a new port listener

### Operations that close existing connections:
- Removing a SOCKS5 user (their active connections are terminated)
- Removing a port (all connections on that port are terminated)
- Deactivating a user (their active connections are terminated)

## Bandwidth Tracking

```rust
// src/socks5/relay.rs
use std::sync::atomic::{AtomicI64, Ordering};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpStream;

pub struct TrafficRelay {
    bytes_in: AtomicI64,
    bytes_out: AtomicI64,
}

impl TrafficRelay {
    /// Relay copies data bidirectionally between client and target,
    /// counting bytes in each direction.
    pub async fn relay(
        &self,
        client: TcpStream,
        target: TcpStream,
    ) -> Result<(i64, i64), std::io::Error>;
}
```

The agent periodically reports accumulated bandwidth to the server via the `METRICS_REPORT` WebSocket message.

## Rust Dependencies (Cargo.toml)

```toml
[package]
name = "sockpit-agent"
version = "1.0.0"
edition = "2021"

[dependencies]
tokio = { version = "1", features = ["full"] }              # Async runtime
fast-socks5 = "0.9"                                         # SOCKS5 protocol (or custom impl)
tokio-tungstenite = { version = "0.21", features = ["native-tls"] }  # WebSocket client
serde = { version = "1", features = ["derive"] }            # Serialization
serde_json = "1"                                            # JSON
sysinfo = "0.30"                                            # System metrics (CPU, RAM)
tracing = "0.1"                                             # Structured logging
tracing-subscriber = "0.3"                                  # Log output
clap = { version = "4", features = ["derive"] }             # CLI argument parsing
anyhow = "1"                                                # Error handling

[target.'cfg(windows)'.dependencies]
windows-service = "0.6"                                     # Windows Service API

[profile.release]
opt-level = "z"      # Optimize for binary size
lto = true           # Link-time optimization
strip = true         # Strip debug symbols
codegen-units = 1    # Single codegen unit for better optimization
```

## Build & Release

Agent binaries are **not built locally** — they are compiled via **GitHub Actions** on every tagged release. See [github-actions.md](github-actions.md) for the full CI/CD pipeline.

Supported targets:
| Target | Binary Name |
|--------|-------------|
| `x86_64-pc-windows-msvc` | `sockpit-agent-windows-amd64.exe` |
| `x86_64-unknown-linux-gnu` | `sockpit-agent-linux-amd64` |
| `aarch64-unknown-linux-gnu` | `sockpit-agent-linux-arm64` |
