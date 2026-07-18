# WebSocket Protocol Specification

## Overview

The WebSocket layer provides real-time, bidirectional communication between the SockPit backend server and agents running on remote machines. It also pushes real-time updates to the dashboard frontend.

## Connection Architecture

```
┌──────────────┐     WSS (port 3001)     ┌──────────────────────┐
│   Agent 1    │◄═══════════════════════►│                      │
└──────────────┘                         │                      │
                                         │    WebSocket Server   │
┌──────────────┐     WSS (port 3001)     │                      │
│   Agent 2    │◄═══════════════════════►│  ┌────────────────┐  │
└──────────────┘                         │  │  Agent Registry │  │
                                         │  │  (in-memory +   │  │
┌──────────────┐     WSS (port 3001)     │  │   Redis)        │  │
│   Agent N    │◄═══════════════════════►│  └────────────────┘  │
└──────────────┘                         │                      │
                                         │  ┌────────────────┐  │
┌──────────────┐     WSS (port 3001)     │  │  Dashboard      │  │
│  Dashboard   │◄═══════════════════════►│  │  Client         │  │
│  Browser     │                         │  │  Registry       │  │
└──────────────┘                         │  └────────────────┘  │
                                         └──────────────────────┘
```

## Message Format

All messages are JSON encoded:

```json
{
  "type": "MESSAGE_TYPE",
  "id": "unique-message-uuid",
  "timestamp": "2024-01-15T10:30:00Z",
  "payload": { ... }
}
```

For request/response patterns, responses include a `replyTo` field:

```json
{
  "type": "RESPONSE_TYPE",
  "id": "new-uuid",
  "replyTo": "original-message-uuid",
  "timestamp": "2024-01-15T10:30:01Z",
  "payload": { ... }
}
```

---

## Agent ↔ Server Messages

### Connection & Authentication

#### `AGENT_AUTH` (Agent → Server)
Sent immediately after WebSocket connection is established.

```json
{
  "type": "AGENT_AUTH",
  "id": "msg-001",
  "payload": {
    "auth_type": "install_token | agent_token",
    "token": "the-token-value",
    "agent_info": {
      "hostname": "DESKTOP-ABC123",
      "ip_address": "192.168.1.100",
      "os_type": "windows",
      "os_version": "Windows 10 Pro 22H2",
      "agent_version": "1.0.0"
    }
  }
}
```

#### `AUTH_RESULT` (Server → Agent)
Response to authentication attempt.

```json
{
  "type": "AUTH_RESULT",
  "replyTo": "msg-001",
  "payload": {
    "success": true,
    "agent_token": "new-agent-token-if-registration",
    "server_id": "server-uuid",
    "config": {
      "heartbeat_interval_seconds": 30,
      "metrics_interval_seconds": 60
    }
  }
}
```

### Heartbeat

#### `HEARTBEAT` (Agent → Server)
Sent periodically to indicate agent is alive.

```json
{
  "type": "HEARTBEAT",
  "id": "msg-002",
  "payload": {
    "server_id": "server-uuid",
    "uptime_seconds": 86400,
    "active_socks5_connections": 5
  }
}
```

#### `HEARTBEAT_ACK` (Server → Agent)

```json
{
  "type": "HEARTBEAT_ACK",
  "replyTo": "msg-002",
  "payload": {
    "server_time": "2024-01-15T10:30:00Z"
  }
}
```

### SOCKS5 User Management

#### `ADD_SOCKS5_USER` (Server → Agent)

```json
{
  "type": "ADD_SOCKS5_USER",
  "id": "msg-003",
  "payload": {
    "socks5_user_id": "user-uuid",
    "username": "proxyuser1",
    "password": "encrypted-password",
    "port": 1080,
    "max_connections": 5
  }
}
```

#### `REMOVE_SOCKS5_USER` (Server → Agent)

```json
{
  "type": "REMOVE_SOCKS5_USER",
  "id": "msg-004",
  "payload": {
    "socks5_user_id": "user-uuid",
    "username": "proxyuser1",
    "port": 1080
  }
}
```

#### `UPDATE_SOCKS5_USER` (Server → Agent)

```json
{
  "type": "UPDATE_SOCKS5_USER",
  "id": "msg-005",
  "payload": {
    "socks5_user_id": "user-uuid",
    "username": "proxyuser1",
    "password": "new-encrypted-password",
    "port": 1080,
    "max_connections": 10,
    "is_active": true
  }
}
```

#### `COMMAND_RESULT` (Agent → Server)
Generic response to any command.

```json
{
  "type": "COMMAND_RESULT",
  "replyTo": "msg-003",
  "payload": {
    "success": true,
    "message": "SOCKS5 user added successfully",
    "error": null
  }
}
```

### Sync & Configuration

#### `SYNC_CONFIG` (Server → Agent)
Sent after agent reconnects to ensure its config matches the database.

```json
{
  "type": "SYNC_CONFIG",
  "id": "msg-006",
  "payload": {
    "socks5_users": [
      {
        "socks5_user_id": "uuid-1",
        "username": "user1",
        "password": "encrypted",
        "port": 1080,
        "max_connections": 5,
        "is_active": true
      },
      {
        "socks5_user_id": "uuid-2",
        "username": "user2",
        "password": "encrypted",
        "port": 1081,
        "max_connections": 3,
        "is_active": true
      }
    ]
  }
}
```

#### `SYNC_RESULT` (Agent → Server)

```json
{
  "type": "SYNC_RESULT",
  "replyTo": "msg-006",
  "payload": {
    "success": true,
    "applied_changes": {
      "added": 1,
      "updated": 1,
      "removed": 0
    }
  }
}
```

### Metrics Reporting

#### `METRICS_REPORT` (Agent → Server)
Sent periodically with system metrics.

```json
{
  "type": "METRICS_REPORT",
  "id": "msg-007",
  "payload": {
    "server_id": "server-uuid",
    "cpu_usage": 15.5,
    "memory_usage": 42.3,
    "bandwidth_in": 1048576,
    "bandwidth_out": 2097152,
    "active_connections": 12,
    "per_user_connections": {
      "user-uuid-1": 5,
      "user-uuid-2": 7
    }
  }
}
```

### Agent Control

#### `RESTART_AGENT` (Server → Agent)

```json
{
  "type": "RESTART_AGENT",
  "id": "msg-008",
  "payload": {}
}
```

#### `UPDATE_AGENT` (Server → Agent)

```json
{
  "type": "UPDATE_AGENT",
  "id": "msg-009",
  "payload": {
    "download_url": "https://example.com/agent/v1.1.0/agent.exe",
    "version": "1.1.0",
    "checksum_sha256": "abc123..."
  }
}
```

---

## Dashboard ↔ Server Messages

### Real-Time Events (Server → Dashboard)

#### `SERVER_STATUS_CHANGED`

```json
{
  "type": "SERVER_STATUS_CHANGED",
  "payload": {
    "server_id": "server-uuid",
    "status": "online",
    "last_heartbeat": "2024-01-15T10:30:00Z"
  }
}
```

#### `SERVER_REGISTERED`

```json
{
  "type": "SERVER_REGISTERED",
  "payload": {
    "server": {
      "id": "server-uuid",
      "hostname": "DESKTOP-XYZ",
      "ip_address": "1.2.3.4",
      "os_type": "windows",
      "status": "online"
    }
  }
}
```

#### `METRICS_UPDATE`

```json
{
  "type": "METRICS_UPDATE",
  "payload": {
    "server_id": "server-uuid",
    "cpu_usage": 15.5,
    "memory_usage": 42.3,
    "active_connections": 12
  }
}
```

---

## Connection Lifecycle

```
Agent                              Server
  │                                  │
  │  1. TCP + TLS Handshake          │
  │─────────────────────────────────►│
  │                                  │
  │  2. WebSocket Upgrade            │
  │◄════════════════════════════════►│
  │                                  │
  │  3. AGENT_AUTH                   │
  │════════════════════════════════►│
  │                                  │  Validate token
  │  4. AUTH_RESULT                  │  Register in registry
  │◄════════════════════════════════│
  │                                  │
  │  5. SYNC_CONFIG                  │
  │◄════════════════════════════════│
  │  6. SYNC_RESULT                  │
  │════════════════════════════════►│
  │                                  │
  │  7. HEARTBEAT (every 30s)        │
  │════════════════════════════════►│
  │  8. HEARTBEAT_ACK               │
  │◄════════════════════════════════│
  │                                  │
  │  9. METRICS_REPORT (every 60s)   │
  │════════════════════════════════►│
  │                                  │
  │  ... ongoing bidirectional ...   │
  │                                  │
  │  N. Connection drops             │
  │  ×                               │
  │                                  │  Mark server offline
  │  N+1. Auto-reconnect            │  after timeout
  │     (exponential backoff)        │
  │─────────────────────────────────►│
```

## Reconnection Strategy

```
Attempt 1: wait 1 second
Attempt 2: wait 2 seconds
Attempt 3: wait 4 seconds
Attempt 4: wait 8 seconds
Attempt 5: wait 16 seconds
...
Maximum: wait 5 minutes
Reset backoff on successful connection
```

## Agent Registry (In-Memory)

```javascript
// ws-registry.js
class AgentRegistry {
  // Map<serverId, WebSocket>
  agents = new Map();
  
  register(serverId, ws) { ... }
  unregister(serverId) { ... }
  getAgent(serverId) { ... }
  isOnline(serverId) { ... }
  broadcast(message) { ... }
  sendToAgent(serverId, message) { ... }
}
```

For multi-instance deployments, use Redis pub/sub to route messages to the correct instance.
