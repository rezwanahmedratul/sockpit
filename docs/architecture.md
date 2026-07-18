# System Architecture — Deep Dive

## 1. High-Level Architecture

SockPit follows a **hub-and-spoke** architecture:
- **Hub**: The SockPit Dashboard (web app + API + WebSocket server + PostgreSQL)
- **Spokes**: Remote machines running the SockPit Agent (SOCKS5 server + WebSocket client)

### Communication Model

```
                        ┌──────────────────────┐
                        │   SockPit Dashboard   │
                        │                       │
                        │  ┌─────────────────┐  │
            HTTPS       │  │  REST API        │  │
  Browser ◄────────────►│  │  (port 3000)     │  │
                        │  └─────────────────┘  │
                        │                       │
                        │  ┌─────────────────┐  │
            WSS         │  │  WebSocket       │  │
  Agents ◄─────────────►│  │  Server          │  │
                        │  │  (port 3001)     │  │
                        │  └─────────────────┘  │
                        │                       │
                        │  ┌─────────────────┐  │
                        │  │  PostgreSQL      │  │
                        │  │  (port 5432)     │  │
                        │  └─────────────────┘  │
                        │                       │
                        │  ┌─────────────────┐  │
                        │  │  Redis           │  │
                        │  │  (port 6379)     │  │
                        │  └─────────────────┘  │
                        └──────────┬───────────┘
                                   │ WSS
                 ┌─────────────────┼──────────────────┐
                 ▼                 ▼                   ▼
       ┌──────────────┐  ┌──────────────┐   ┌──────────────┐
       │  Windows PC  │  │  Linux Server │   │  Docker      │
       │  (Agent +    │  │  (Agent +     │   │  Container   │
       │   SOCKS5)    │  │   SOCKS5)     │   │  (Agent +    │
       └──────────────┘  └──────────────┘   │   SOCKS5)    │
                                             └──────────────┘
```

## 2. Component Interaction Flow

### 2.1 Installation Flow

```
User (Robert)                Dashboard                     Target Machine
     │                           │                              │
     │  1. Login & get install   │                              │
     │     script from dashboard │                              │
     │◄─────────────────────────►│                              │
     │                           │                              │
     │  2. Copy script & run     │                              │
     │     on target machine ────┼─────────────────────────────►│
     │                           │                              │
     │                           │  3. Script downloads agent   │
     │                           │◄─────────────────────────────│
     │                           │                              │
     │                           │  4. Agent starts, connects   │
     │                           │     via WebSocket with       │
     │                           │     embedded token           │
     │                           │◄═════════════════════════════│
     │                           │                              │
     │                           │  5. Server validates token,  │
     │                           │     registers server under   │
     │                           │     Robert's account         │
     │                           │──────────────────────────────│
     │                           │                              │
     │  6. Robert sees new       │                              │
     │     server in dashboard   │                              │
     │◄──────────────────────────│                              │
```

### 2.2 SOCKS5 User Management Flow

```
Robert (Dashboard)          API Server            Agent (WebSocket)       SOCKS5 Server
     │                          │                        │                      │
     │  1. Add SOCKS5 user      │                        │                      │
     │     (user, pass, port,   │                        │                      │
     │      max_connections)    │                        │                      │
     │─────────────────────────►│                        │                      │
     │                          │                        │                      │
     │                          │  2. Save to DB         │                      │
     │                          │──────┐                 │                      │
     │                          │◄─────┘                 │                      │
     │                          │                        │  3. Send command     │
     │                          │                        │     via WebSocket    │
     │                          │═══════════════════════►│                      │
     │                          │                        │                      │
     │                          │                        │  4. Update SOCKS5    │
     │                          │                        │     config           │
     │                          │                        │─────────────────────►│
     │                          │                        │                      │
     │                          │                        │  5. ACK              │
     │                          │◄═══════════════════════│                      │
     │                          │                        │                      │
     │  6. Success response     │                        │                      │
     │◄─────────────────────────│                        │                      │
```

## 3. Multi-Tenancy Model

SockPit uses a **shared database, isolated rows** multi-tenancy model:

```
┌───────────────────────────────────────────────────┐
│                   PostgreSQL                       │
│                                                    │
│  ┌─────────────────────────────────────────────┐  │
│  │              dashboard_users                 │  │
│  │  ┌────────┬────────┬────────┐               │  │
│  │  │ admin  │ robert │ alice  │               │  │
│  │  │ (role: │ (role: │ (role: │               │  │
│  │  │ admin) │ user)  │ user)  │               │  │
│  │  └────────┴────────┴────────┘               │  │
│  └─────────────────────────────────────────────┘  │
│                                                    │
│  ┌─────────────────────────────────────────────┐  │
│  │                  servers                     │  │
│  │  ┌──────────────────────────────────────┐   │  │
│  │  │ server_1  → owner: robert            │   │  │
│  │  │ server_2  → owner: robert            │   │  │
│  │  │ server_3  → owner: alice             │   │  │
│  │  │ server_4  → owner: alice             │   │  │
│  │  └──────────────────────────────────────┘   │  │
│  └─────────────────────────────────────────────┘  │
│                                                    │
│  Robert can see: server_1, server_2               │
│  Alice can see: server_3, server_4                │
│  Admin can see: ALL                               │
└───────────────────────────────────────────────────┘
```

### Access Control Rules

| Action | Admin | User (Owner) | User (Non-Owner) |
|--------|-------|-------------|-------------------|
| View all servers | ✅ | ❌ | ❌ |
| View own servers | ✅ | ✅ | ❌ |
| Add SOCKS5 user on own server | ✅ | ✅ | ❌ |
| Delete SOCKS5 user on own server | ✅ | ✅ | ❌ |
| Delete any server | ✅ | ❌ | ❌ |
| Manage dashboard users | ✅ | ❌ | ❌ |
| Generate install script | ✅ | ✅ | ❌ |
| View install script | ✅ | ✅ (own) | ❌ |

## 4. Agent Architecture

The agent is a single Rust binary (compiled via GitHub Actions CI/CD) that bundles:

```
┌────────────────────────────────────────┐
│            SockPit Agent               │
│                                        │
│  ┌──────────────────────────────────┐  │
│  │         WebSocket Client         │  │
│  │  - Persistent connection to hub  │  │
│  │  - Auto-reconnect with backoff   │  │
│  │  - Heartbeat / keepalive         │  │
│  │  - Command execution             │  │
│  └──────────────────────────────────┘  │
│                                        │
│  ┌──────────────────────────────────┐  │
│  │         SOCKS5 Server            │  │
│  │  - Multi-port listener           │  │
│  │  - Username/password auth        │  │
│  │  - Connection limiting           │  │
│  │  - Dynamic reconfiguration       │  │
│  └──────────────────────────────────┘  │
│                                        │
│  ┌──────────────────────────────────┐  │
│  │        System Service            │  │
│  │  - Windows: runs as Service      │  │
│  │  - Linux: runs as systemd unit   │  │
│  │  - Docker: runs as container     │  │
│  │  - Auto-start on boot/restart    │  │
│  └──────────────────────────────────┘  │
│                                        │
│  ┌──────────────────────────────────┐  │
│  │        Config Manager            │  │
│  │  - Local config file             │  │
│  │  - Token storage                 │  │
│  │  - Server URL                    │  │
│  └──────────────────────────────────┘  │
└────────────────────────────────────────┘
```

## 5. Security Layers

```
Layer 1: Installation Token (one-time, per-user)
  └─ Embedded in installer script
  └─ Used for initial agent registration only
  └─ Tied to a specific dashboard user

Layer 2: Agent Token (persistent, per-server)
  └─ Issued after successful registration
  └─ Used for all subsequent WebSocket connections
  └─ Can be revoked from dashboard

Layer 3: SOCKS5 Auth (per proxy user)
  └─ Username/password per SOCKS5 user
  └─ Connection limits enforced per user
  └─ Port-level isolation

Layer 4: Transport Security
  └─ WSS (WebSocket Secure) for agent ↔ server
  └─ HTTPS for dashboard
  └─ TLS for PostgreSQL connections
```

## 6. Scalability Considerations

- **Horizontal API scaling**: Multiple API server instances behind a load balancer
- **WebSocket scaling**: Redis pub/sub for cross-instance WebSocket message routing
- **Database**: Connection pooling, read replicas for analytics queries
- **Agent connections**: Each WebSocket server can handle ~10,000 concurrent agent connections
