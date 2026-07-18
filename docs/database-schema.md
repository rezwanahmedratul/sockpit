# Database Schema — PostgreSQL

## Overview

All data is stored in PostgreSQL. The schema uses UUIDs as primary keys, enforces foreign key relationships, and includes proper indexes for query performance.

## Entity Relationship Diagram

```
┌────────────────────┐       ┌────────────────────┐
│  dashboard_users   │       │  install_tokens     │
│────────────────────│       │────────────────────│
│  id (PK, UUID)     │──┐    │  id (PK, UUID)     │
│  email             │  │    │  token (UNIQUE)     │
│  password_hash     │  │    │  user_id (FK) ──────┼──┐
│  display_name      │  │    │  label              │  │
│  role (enum)       │  │    │  is_used            │  │
│  is_active         │  │    │  used_at            │  │
│  created_at        │  │    │  created_at         │  │
│  updated_at        │  │    │  expires_at         │  │
└────────────────────┘  │    └────────────────────┘  │
         │              │                             │
         │              └─────────────────────────────┘
         │
         │  1:N
         ▼
┌────────────────────┐       ┌────────────────────┐
│     servers        │       │   socks5_users     │
│────────────────────│       │────────────────────│
│  id (PK, UUID)     │──┐    │  id (PK, UUID)     │
│  owner_id (FK)     │  │    │  server_id (FK) ───┼──┐
│  hostname          │  │    │  username           │  │
│  ip_address        │  │    │  password_hash      │  │
│  os_type (enum)    │  │    │  port               │  │
│  os_version        │  │    │  max_connections    │  │
│  agent_version     │  │    │  is_active          │  │
│  agent_token       │  │    │  created_at         │  │
│  status (enum)     │  │    │  updated_at         │  │
│  last_heartbeat    │  │    └────────────────────┘  │
│  install_token_id  │  │                             │
│  created_at        │  └─────────────────────────────┘
│  updated_at        │
└────────────────────┘
         │
         │  1:N
         ▼
┌────────────────────┐       ┌────────────────────┐
│  connection_logs   │       │   server_metrics   │
│────────────────────│       │────────────────────│
│  id (PK, BIGSERIAL)│       │  id (PK, BIGSERIAL)│
│  server_id (FK)    │       │  server_id (FK)    │
│  socks5_user_id(FK)│       │  cpu_usage         │
│  client_ip         │       │  memory_usage      │
│  target_host       │       │  bandwidth_in      │
│  target_port       │       │  bandwidth_out     │
│  bytes_sent        │       │  active_connections│
│  bytes_received    │       │  recorded_at       │
│  connected_at      │       └────────────────────┘
│  disconnected_at   │
│  status            │
└────────────────────┘

┌────────────────────┐
│   audit_logs       │
│────────────────────│
│  id (PK, BIGSERIAL)│
│  user_id (FK)      │
│  action (enum)     │
│  resource_type     │
│  resource_id       │
│  details (JSONB)   │
│  ip_address        │
│  created_at        │
└────────────────────┘
```

## Table Definitions

### 1. `dashboard_users`

Stores all users who can log into the SockPit dashboard.

```sql
CREATE TYPE user_role AS ENUM ('admin', 'user');

CREATE TABLE dashboard_users (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email           VARCHAR(255) NOT NULL UNIQUE,
    password_hash   VARCHAR(255) NOT NULL,
    display_name    VARCHAR(100) NOT NULL,
    role            user_role NOT NULL DEFAULT 'user',
    is_active       BOOLEAN NOT NULL DEFAULT true,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_dashboard_users_email ON dashboard_users(email);
CREATE INDEX idx_dashboard_users_role ON dashboard_users(role);
```

### 2. `install_tokens`

Unique tokens embedded in installation scripts. Links an installed server to a dashboard user.

```sql
CREATE TABLE install_tokens (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    token           VARCHAR(64) NOT NULL UNIQUE,
    user_id         UUID NOT NULL REFERENCES dashboard_users(id) ON DELETE CASCADE,
    label           VARCHAR(255),              -- optional label like "Office PC batch"
    is_used         BOOLEAN NOT NULL DEFAULT false,
    used_at         TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at      TIMESTAMPTZ                -- NULL = no expiry
);

CREATE INDEX idx_install_tokens_token ON install_tokens(token);
CREATE INDEX idx_install_tokens_user_id ON install_tokens(user_id);
```

### 3. `servers`

Represents each machine running the SockPit agent.

```sql
CREATE TYPE server_status AS ENUM ('online', 'offline', 'error', 'installing');
CREATE TYPE os_type AS ENUM ('windows', 'linux', 'docker');

CREATE TABLE servers (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id          UUID NOT NULL REFERENCES dashboard_users(id) ON DELETE CASCADE,
    hostname          VARCHAR(255),
    ip_address        INET NOT NULL,
    os_type           os_type NOT NULL,
    os_version        VARCHAR(100),
    agent_version     VARCHAR(20),
    agent_token       VARCHAR(128) NOT NULL UNIQUE,  -- persistent auth token for agent
    status            server_status NOT NULL DEFAULT 'installing',
    last_heartbeat    TIMESTAMPTZ,
    install_token_id  UUID REFERENCES install_tokens(id) ON DELETE SET NULL,
    metadata          JSONB DEFAULT '{}',             -- extra system info
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_servers_owner_id ON servers(owner_id);
CREATE INDEX idx_servers_status ON servers(status);
CREATE INDEX idx_servers_agent_token ON servers(agent_token);
```

### 4. `socks5_users`

SOCKS5 proxy credentials configured per server.

```sql
CREATE TABLE socks5_users (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    server_id         UUID NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
    username          VARCHAR(100) NOT NULL,
    password_hash     VARCHAR(255) NOT NULL,
    password_plain    VARCHAR(255),             -- stored encrypted, needed for agent sync
    port              INTEGER NOT NULL CHECK (port >= 1024 AND port <= 65535),
    max_connections   INTEGER NOT NULL DEFAULT 1 CHECK (max_connections >= 1),
    current_connections INTEGER NOT NULL DEFAULT 0,
    is_active         BOOLEAN NOT NULL DEFAULT true,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE(server_id, username),
    UNIQUE(server_id, port)
);

CREATE INDEX idx_socks5_users_server_id ON socks5_users(server_id);
```

### 5. `connection_logs`

Logs of SOCKS5 proxy connections (optional, for analytics).

```sql
CREATE TABLE connection_logs (
    id                BIGSERIAL PRIMARY KEY,
    server_id         UUID NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
    socks5_user_id    UUID REFERENCES socks5_users(id) ON DELETE SET NULL,
    client_ip         INET,
    target_host       VARCHAR(255),
    target_port       INTEGER,
    bytes_sent        BIGINT DEFAULT 0,
    bytes_received    BIGINT DEFAULT 0,
    connected_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    disconnected_at   TIMESTAMPTZ,
    status            VARCHAR(20) DEFAULT 'active'
);

CREATE INDEX idx_connection_logs_server_id ON connection_logs(server_id);
CREATE INDEX idx_connection_logs_socks5_user_id ON connection_logs(socks5_user_id);
CREATE INDEX idx_connection_logs_connected_at ON connection_logs(connected_at);
```

### 6. `server_metrics`

Periodic system metrics reported by agents.

```sql
CREATE TABLE server_metrics (
    id                  BIGSERIAL PRIMARY KEY,
    server_id           UUID NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
    cpu_usage           REAL,          -- percentage 0-100
    memory_usage        REAL,          -- percentage 0-100
    bandwidth_in        BIGINT,        -- bytes per interval
    bandwidth_out       BIGINT,        -- bytes per interval
    active_connections  INTEGER,
    recorded_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_server_metrics_server_id ON server_metrics(server_id);
CREATE INDEX idx_server_metrics_recorded_at ON server_metrics(recorded_at);

-- Partition by time for large-scale deployments (optional)
-- CREATE TABLE server_metrics (...) PARTITION BY RANGE (recorded_at);
```

### 7. `audit_logs`

Tracks all admin/user actions for security auditing.

```sql
CREATE TYPE audit_action AS ENUM (
    'user_login',
    'user_logout',
    'user_created',
    'user_updated',
    'user_deleted',
    'server_registered',
    'server_deleted',
    'socks5_user_created',
    'socks5_user_updated',
    'socks5_user_deleted',
    'install_token_generated',
    'install_script_downloaded'
);

CREATE TABLE audit_logs (
    id              BIGSERIAL PRIMARY KEY,
    user_id         UUID REFERENCES dashboard_users(id) ON DELETE SET NULL,
    action          audit_action NOT NULL,
    resource_type   VARCHAR(50),
    resource_id     UUID,
    details         JSONB DEFAULT '{}',
    ip_address      INET,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_action ON audit_logs(action);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at);
```

## Migrations Strategy

Use a migration tool like `node-pg-migrate` or `knex` migrations:

```
migrations/
├── 001_create_dashboard_users.sql
├── 002_create_install_tokens.sql
├── 003_create_servers.sql
├── 004_create_socks5_users.sql
├── 005_create_connection_logs.sql
├── 006_create_server_metrics.sql
└── 007_create_audit_logs.sql
```

## Key Relationships

| Relationship | Type | Description |
|-------------|------|-------------|
| `dashboard_users` → `servers` | 1:N | A user owns many servers |
| `dashboard_users` → `install_tokens` | 1:N | A user has many install tokens |
| `servers` → `socks5_users` | 1:N | A server has many SOCKS5 users |
| `servers` → `connection_logs` | 1:N | A server logs many connections |
| `servers` → `server_metrics` | 1:N | A server reports many metric snapshots |
| `install_tokens` → `servers` | 1:1 | A token can register one server |

## Data Retention Policy

- `connection_logs`: Retain for 30 days, then archive/delete
- `server_metrics`: Retain for 7 days at full resolution, aggregate to hourly for 90 days
- `audit_logs`: Retain for 1 year
