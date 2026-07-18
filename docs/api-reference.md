# REST API Reference

## Base URL

```
https://your-domain.com/api
```

## Authentication

All endpoints (except `/api/auth/login`) require a valid JWT token:

```
Authorization: Bearer <access_token>
```

---

## Auth Endpoints

### `POST /api/auth/login`

Login and receive JWT tokens.

**Request:**
```json
{
  "email": "robert@example.com",
  "password": "securepassword123"
}
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "access_token": "eyJhbGciOi...",
    "refresh_token": "eyJhbGciOi...",
    "user": {
      "id": "uuid",
      "email": "robert@example.com",
      "display_name": "Robert",
      "role": "user"
    }
  }
}
```

### `POST /api/auth/refresh`

Refresh an expired access token.

**Request:**
```json
{
  "refresh_token": "eyJhbGciOi..."
}
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "access_token": "new-access-token",
    "refresh_token": "new-refresh-token"
  }
}
```

### `POST /api/auth/logout`

Revoke the current refresh token.

**Request:**
```json
{
  "refresh_token": "eyJhbGciOi..."
}
```

**Response (200):**
```json
{
  "success": true,
  "data": { "message": "Logged out successfully" }
}
```

---

## User Management Endpoints (Admin Only)

### `GET /api/users`

List all dashboard users.

**Query Parameters:**
| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `page` | int | 1 | Page number |
| `per_page` | int | 20 | Items per page |
| `search` | string | - | Search by email or name |
| `role` | string | - | Filter by role (admin/user) |

**Response (200):**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "email": "robert@example.com",
      "display_name": "Robert",
      "role": "user",
      "is_active": true,
      "servers_count": 5,
      "created_at": "2024-01-15T10:00:00Z"
    }
  ],
  "meta": { "page": 1, "per_page": 20, "total": 50 }
}
```

### `POST /api/users`

Create a new dashboard user.

**Request:**
```json
{
  "email": "alice@example.com",
  "password": "securePass123!",
  "display_name": "Alice",
  "role": "user"
}
```

**Response (201):**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "email": "alice@example.com",
    "display_name": "Alice",
    "role": "user",
    "is_active": true,
    "created_at": "2024-01-15T10:00:00Z"
  }
}
```

### `PUT /api/users/:userId`

Update a dashboard user.

**Request:**
```json
{
  "display_name": "Alice Smith",
  "role": "admin",
  "is_active": false
}
```

### `DELETE /api/users/:userId`

Delete a dashboard user (cascades to servers and install tokens).

---

## Server Endpoints

### `GET /api/servers`

List servers. Regular users only see their own servers. Admins see all.

**Query Parameters:**
| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `page` | int | 1 | Page number |
| `per_page` | int | 20 | Items per page |
| `status` | string | - | Filter: online, offline, error |
| `search` | string | - | Search by hostname or IP |
| `owner_id` | UUID | - | Filter by owner (admin only) |

**Response (200):**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "owner_id": "uuid",
      "owner_email": "robert@example.com",
      "hostname": "DESKTOP-ABC123",
      "ip_address": "1.2.3.4",
      "os_type": "windows",
      "os_version": "Windows 10 Pro 22H2",
      "agent_version": "1.0.0",
      "status": "online",
      "last_heartbeat": "2024-01-15T10:29:30Z",
      "socks5_users_count": 3,
      "active_connections": 12,
      "created_at": "2024-01-10T08:00:00Z"
    }
  ],
  "meta": { "page": 1, "per_page": 20, "total": 5 }
}
```

### `GET /api/servers/:serverId`

Get server details (ownership check applied).

### `DELETE /api/servers/:serverId`

Remove a server. Disconnects the agent and deletes all associated data.

### `POST /api/servers/:serverId/restart`

Send restart command to the agent.

---

## SOCKS5 User Endpoints

### `GET /api/servers/:serverId/socks5-users`

List SOCKS5 users for a server.

**Response (200):**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "username": "proxyuser1",
      "port": 1080,
      "max_connections": 5,
      "current_connections": 2,
      "is_active": true,
      "created_at": "2024-01-12T14:00:00Z"
    }
  ]
}
```

### `POST /api/servers/:serverId/socks5-users`

Create a new SOCKS5 user on a server.

**Request:**
```json
{
  "username": "proxyuser2",
  "password": "proxyPass123",
  "port": 1081,
  "max_connections": 3
}
```

**Validation Rules:**
- `username`: 3-50 chars, alphanumeric + underscore
- `password`: 6-100 chars
- `port`: 1024-65535, must be unique on this server
- `max_connections`: 1-1000

**Response (201):**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "username": "proxyuser2",
    "port": 1081,
    "max_connections": 3,
    "current_connections": 0,
    "is_active": true,
    "created_at": "2024-01-15T11:00:00Z"
  }
}
```

### `PUT /api/servers/:serverId/socks5-users/:socks5UserId`

Update a SOCKS5 user (password, port, max_connections, is_active).

**Request:**
```json
{
  "password": "newPassword456",
  "max_connections": 10,
  "is_active": true
}
```

### `DELETE /api/servers/:serverId/socks5-users/:socks5UserId`

Delete a SOCKS5 user. Active connections are terminated.

---

## Installer Endpoints

### `POST /api/installers/script`

Generate an installation script.

**Request:**
```json
{
  "platform": "windows",
  "label": "Office batch 1"
}
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "script": "# Full PowerShell script content...",
    "token": "abc123...",
    "one_liner": "irm https://sockpit.example.com/api/installers/run/abc123 | iex"
  }
}
```

### `GET /api/installers/tokens`

List installation tokens for the current user.

**Response (200):**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "label": "Office batch 1",
      "platform": "windows",
      "is_used": true,
      "used_at": "2024-01-15T12:00:00Z",
      "server_id": "uuid",
      "created_at": "2024-01-15T10:00:00Z",
      "expires_at": null
    }
  ]
}
```

### `DELETE /api/installers/tokens/:tokenId`

Revoke an unused install token.

### `GET /api/installers/run/:token`

Returns the rendered install script directly (for pipe-to-shell usage). No auth required — the token itself is the auth.

---

## Metrics Endpoints

### `GET /api/servers/:serverId/metrics`

Get historical metrics for a server.

**Query Parameters:**
| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `range` | string | 1h | Time range: 1h, 6h, 24h, 7d |
| `interval` | string | 1m | Aggregation interval: 1m, 5m, 1h |

**Response (200):**
```json
{
  "success": true,
  "data": {
    "timestamps": ["2024-01-15T10:00:00Z", "2024-01-15T10:01:00Z"],
    "cpu_usage": [15.5, 18.2],
    "memory_usage": [42.3, 43.1],
    "bandwidth_in": [1048576, 2097152],
    "bandwidth_out": [524288, 1048576],
    "active_connections": [12, 15]
  }
}
```

---

## Audit Log Endpoints (Admin Only)

### `GET /api/audit-logs`

Get audit log entries.

**Query Parameters:**
| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `page` | int | 1 | Page number |
| `per_page` | int | 50 | Items per page |
| `user_id` | UUID | - | Filter by user |
| `action` | string | - | Filter by action type |
| `from` | datetime | - | Start date |
| `to` | datetime | - | End date |

---

## Error Codes

| HTTP Status | Code | Description |
|------------|------|-------------|
| 400 | `VALIDATION_ERROR` | Invalid request body |
| 401 | `UNAUTHORIZED` | Missing or invalid auth token |
| 403 | `FORBIDDEN` | Insufficient permissions |
| 404 | `NOT_FOUND` | Resource not found |
| 409 | `CONFLICT` | Resource already exists (duplicate port, username) |
| 422 | `AGENT_OFFLINE` | Server agent is not connected |
| 429 | `RATE_LIMITED` | Too many requests |
| 500 | `INTERNAL_ERROR` | Server error |
