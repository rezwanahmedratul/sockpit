# Backend API Design

## Overview

The backend API is a Node.js server built with Express.js. It provides:
- RESTful API for the dashboard frontend
- WebSocket server for agent communication
- Authentication and authorization middleware
- Installer script generation

## Directory Structure

```
server/
├── src/
│   ├── index.js                    # Entry point — starts HTTP + WS servers
│   ├── config/
│   │   ├── database.js             # PostgreSQL connection pool (pg)
│   │   ├── redis.js                # Redis client
│   │   └── env.js                  # Environment variable validation
│   ├── routes/
│   │   ├── auth.routes.js          # POST /api/auth/login, /register, /refresh
│   │   ├── users.routes.js         # CRUD /api/users (admin only)
│   │   ├── servers.routes.js       # CRUD /api/servers
│   │   ├── socks5-users.routes.js  # CRUD /api/servers/:serverId/socks5-users
│   │   ├── installers.routes.js    # GET /api/installers/script
│   │   ├── metrics.routes.js       # GET /api/servers/:serverId/metrics
│   │   └── audit.routes.js         # GET /api/audit-logs (admin only)
│   ├── middleware/
│   │   ├── auth.middleware.js      # JWT verification
│   │   ├── rbac.middleware.js      # Role-based access control
│   │   ├── ownership.middleware.js # Server ownership verification
│   │   ├── validate.middleware.js  # Request body validation (Joi/Zod)
│   │   ├── rate-limit.middleware.js# Rate limiting
│   │   └── error.middleware.js     # Global error handler
│   ├── services/
│   │   ├── auth.service.js         # Login, token generation, password hashing
│   │   ├── user.service.js         # Dashboard user CRUD
│   │   ├── server.service.js       # Server CRUD + status
│   │   ├── socks5-user.service.js  # SOCKS5 user management
│   │   ├── installer.service.js    # Script generation + token management
│   │   ├── metrics.service.js      # Metrics aggregation
│   │   └── audit.service.js        # Audit logging
│   ├── websocket/
│   │   ├── ws-server.js            # WebSocket server setup
│   │   ├── ws-handler.js           # Message routing
│   │   ├── ws-auth.js              # Agent authentication
│   │   └── ws-registry.js          # Connected agents registry
│   ├── models/
│   │   ├── user.model.js           # dashboard_users queries
│   │   ├── server.model.js         # servers queries
│   │   ├── socks5-user.model.js    # socks5_users queries
│   │   ├── install-token.model.js  # install_tokens queries
│   │   ├── connection-log.model.js # connection_logs queries
│   │   ├── metric.model.js         # server_metrics queries
│   │   └── audit-log.model.js      # audit_logs queries
│   └── utils/
│       ├── crypto.js               # Token generation, encryption
│       ├── logger.js               # Winston/Pino logger
│       └── response.js             # Standardized API responses
├── migrations/
│   ├── 001_create_dashboard_users.sql
│   ├── 002_create_install_tokens.sql
│   ├── 003_create_servers.sql
│   ├── 004_create_socks5_users.sql
│   ├── 005_create_connection_logs.sql
│   ├── 006_create_server_metrics.sql
│   └── 007_create_audit_logs.sql
├── seeds/
│   └── 001_admin_user.sql          # Default admin account
├── package.json
├── .env.example
└── Dockerfile
```

## Dependencies

```json
{
  "dependencies": {
    "express": "^4.18.0",
    "pg": "^8.12.0",
    "redis": "^4.6.0",
    "ws": "^8.16.0",
    "jsonwebtoken": "^9.0.0",
    "bcryptjs": "^2.4.3",
    "zod": "^3.22.0",
    "helmet": "^7.1.0",
    "cors": "^2.8.5",
    "express-rate-limit": "^7.1.0",
    "pino": "^8.17.0",
    "dotenv": "^16.3.0",
    "crypto-js": "^4.2.0"
  },
  "devDependencies": {
    "nodemon": "^3.0.0",
    "jest": "^29.7.0"
  }
}
```

## Environment Variables

```env
# Server
PORT=3000
WS_PORT=3001
NODE_ENV=development

# Database
DATABASE_URL=postgresql://sockpit:password@localhost:5432/sockpit

# Redis
REDIS_URL=redis://localhost:6379

# Auth
JWT_SECRET=your-super-secret-key-change-in-production
JWT_EXPIRES_IN=24h
JWT_REFRESH_EXPIRES_IN=7d

# Agent
AGENT_DOWNLOAD_BASE_URL=https://your-domain.com/downloads
DASHBOARD_URL=https://your-domain.com

# Encryption
ENCRYPTION_KEY=32-byte-hex-key-for-password-encryption
```

## Request/Response Format

### Standard Success Response

```json
{
  "success": true,
  "data": { ... },
  "meta": {
    "page": 1,
    "per_page": 20,
    "total": 100
  }
}
```

### Standard Error Response

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid email format",
    "details": [
      { "field": "email", "message": "Must be a valid email address" }
    ]
  }
}
```

## Middleware Pipeline

```
Request
  │
  ▼
┌──────────────┐
│    CORS       │
└──────┬───────┘
       ▼
┌──────────────┐
│   Helmet      │ (security headers)
└──────┬───────┘
       ▼
┌──────────────┐
│  Rate Limit   │
└──────┬───────┘
       ▼
┌──────────────┐
│  Body Parser  │
└──────┬───────┘
       ▼
┌──────────────┐
│  Auth Check   │ (JWT verification, attach user)
└──────┬───────┘
       ▼
┌──────────────┐
│  RBAC Check   │ (role-based access)
└──────┬───────┘
       ▼
┌──────────────┐
│  Ownership    │ (resource belongs to user?)
└──────┬───────┘
       ▼
┌──────────────┐
│  Validation   │ (request body schema)
└──────┬───────┘
       ▼
┌──────────────┐
│  Route Handler│
└──────┬───────┘
       ▼
┌──────────────┐
│ Error Handler │ (catch-all)
└──────────────┘
```

## Key Service Logic

### Server Registration (via Agent WebSocket)

```javascript
// server.service.js — registerServer()
async function registerServer(installToken, agentInfo) {
  // 1. Validate install token exists and is not used/expired
  // 2. Look up the user who owns this token
  // 3. Generate a unique agent token
  // 4. Create server record with owner_id = token's user_id
  // 5. Mark install token as used
  // 6. Return agent token to the agent
  // 7. Log audit event
}
```

### SOCKS5 User Management

```javascript
// socks5-user.service.js — createSocks5User()
async function createSocks5User(serverId, { username, password, port, maxConnections }) {
  // 1. Verify server exists and user owns it
  // 2. Check port is not already in use on this server
  // 3. Check username is not already taken on this server
  // 4. Hash password for DB storage
  // 5. Encrypt password for agent sync (agent needs plain text to configure SOCKS5)
  // 6. Insert into socks5_users
  // 7. Send WebSocket command to agent: ADD_SOCKS5_USER
  // 8. Wait for agent ACK
  // 9. Log audit event
  // 10. Return created user info
}
```

### Installer Script Generation

```javascript
// installer.service.js — generateInstallScript()
async function generateInstallScript(userId, platform) {
  // 1. Generate unique install token (crypto.randomBytes)
  // 2. Save token to install_tokens table
  // 3. Load template (windows-install.ps1.tpl or linux-install.sh.tpl)
  // 4. Inject token, server URL, and download URL into template
  // 5. Return rendered script
  // 6. Log audit event
}
```
