# Authentication System

## Overview

SockPit uses a dual authentication system:
1. **Dashboard Auth**: JWT-based authentication for web users (admins and regular users)
2. **Agent Auth**: Token-based authentication for agents connecting via WebSocket

---

## 1. Dashboard Authentication (JWT)

### Login Flow

```
User                    Frontend                  API Server              Database
 │                         │                          │                      │
 │  1. Enter email/pass    │                          │                      │
 │────────────────────────►│                          │                      │
 │                         │                          │                      │
 │                         │  2. POST /api/auth/login │                      │
 │                         │  { email, password }     │                      │
 │                         │─────────────────────────►│                      │
 │                         │                          │                      │
 │                         │                          │  3. Find user        │
 │                         │                          │─────────────────────►│
 │                         │                          │◄─────────────────────│
 │                         │                          │                      │
 │                         │                          │  4. Verify bcrypt    │
 │                         │                          │     hash             │
 │                         │                          │                      │
 │                         │  5. Return tokens        │                      │
 │                         │  { access_token,         │                      │
 │                         │    refresh_token }       │                      │
 │                         │◄─────────────────────────│                      │
 │                         │                          │                      │
 │                         │  6. Store tokens         │                      │
 │                         │     (httpOnly cookie)    │                      │
 │                         │                          │                      │
 │  7. Redirect to         │                          │                      │
 │     dashboard           │                          │                      │
 │◄────────────────────────│                          │                      │
```

### JWT Token Structure

**Access Token** (short-lived, 15 minutes):
```json
{
  "header": {
    "alg": "HS256",
    "typ": "JWT"
  },
  "payload": {
    "sub": "user-uuid",
    "email": "robert@example.com",
    "role": "user",
    "iat": 1700000000,
    "exp": 1700000900
  }
}
```

**Refresh Token** (long-lived, 7 days):
```json
{
  "payload": {
    "sub": "user-uuid",
    "type": "refresh",
    "jti": "unique-token-id",
    "iat": 1700000000,
    "exp": 1700604800
  }
}
```

### Token Refresh Flow

```
Frontend                    API Server
    │                           │
    │  Access token expired     │
    │  POST /api/auth/refresh   │
    │  { refresh_token }        │
    │──────────────────────────►│
    │                           │  Verify refresh token
    │                           │  Check not revoked
    │                           │  Issue new access + refresh
    │  { access_token,          │
    │    refresh_token }        │
    │◄──────────────────────────│
```

### Password Hashing

```javascript
// Using bcryptjs
const SALT_ROUNDS = 12;

async function hashPassword(password) {
  return bcrypt.hash(password, SALT_ROUNDS);
}

async function verifyPassword(password, hash) {
  return bcrypt.compare(password, hash);
}
```

### Auth Middleware

```javascript
// auth.middleware.js
async function authenticateJWT(req, res, next) {
  const token = extractToken(req);  // from Authorization header or cookie
  
  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const user = await UserModel.findById(payload.sub);
    
    if (!user || !user.is_active) {
      return res.status(401).json({ error: 'User not found or deactivated' });
    }
    
    req.user = user;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}
```

---

## 2. Role-Based Access Control (RBAC)

### Roles

| Role | Description |
|------|-------------|
| `admin` | Full access to everything — all servers, all users, all settings |
| `user` | Access only to own servers and SOCKS5 users |

### RBAC Middleware

```javascript
// rbac.middleware.js
function requireRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    next();
  };
}

// Usage in routes:
router.get('/users', requireRole('admin'), userController.list);
router.get('/servers', requireRole('admin', 'user'), serverController.list);
```

### Ownership Middleware

```javascript
// ownership.middleware.js
async function requireServerOwnership(req, res, next) {
  const { serverId } = req.params;
  const server = await ServerModel.findById(serverId);
  
  if (!server) {
    return res.status(404).json({ error: 'Server not found' });
  }
  
  // Admin can access any server
  if (req.user.role === 'admin') {
    req.server = server;
    return next();
  }
  
  // Regular user must own the server
  if (server.owner_id !== req.user.id) {
    return res.status(403).json({ error: 'Access denied' });
  }
  
  req.server = server;
  next();
}
```

### Route-Level Access Control Table

| Route | Method | Required Role | Ownership Check |
|-------|--------|---------------|----------------|
| `/api/auth/login` | POST | None | No |
| `/api/auth/refresh` | POST | None | No |
| `/api/users` | GET | Admin | No |
| `/api/users` | POST | Admin | No |
| `/api/users/:id` | PUT | Admin | No |
| `/api/users/:id` | DELETE | Admin | No |
| `/api/servers` | GET | User+ | Scoped query |
| `/api/servers/:id` | GET | User+ | Yes |
| `/api/servers/:id` | DELETE | User+ | Yes |
| `/api/servers/:id/socks5-users` | GET | User+ | Yes |
| `/api/servers/:id/socks5-users` | POST | User+ | Yes |
| `/api/servers/:id/socks5-users/:uid` | PUT | User+ | Yes |
| `/api/servers/:id/socks5-users/:uid` | DELETE | User+ | Yes |
| `/api/installers/script` | POST | User+ | No |
| `/api/installers/tokens` | GET | User+ | Scoped |
| `/api/audit-logs` | GET | Admin | No |
| `/api/servers/:id/metrics` | GET | User+ | Yes |

---

## 3. Agent Authentication

### Initial Registration (Install Token)

```
Agent                     WebSocket Server           Database
  │                            │                        │
  │  1. Connect with           │                        │
  │     install_token          │                        │
  │═══════════════════════════►│                        │
  │                            │                        │
  │                            │  2. Validate token     │
  │                            │─────────────────────── │
  │                            │     - exists?          │
  │                            │     - not used?        │
  │                            │     - not expired?     │
  │                            │◄───────────────────────│
  │                            │                        │
  │                            │  3. Create server      │
  │                            │     record, generate   │
  │                            │     agent_token        │
  │                            │─────────────────────── │
  │                            │                        │
  │                            │  4. Mark install       │
  │                            │     token as used      │
  │                            │◄───────────────────────│
  │                            │                        │
  │  5. Receive agent_token    │                        │
  │◄═══════════════════════════│                        │
  │                            │                        │
  │  6. Store agent_token      │                        │
  │     locally in config      │                        │
```

### Subsequent Connections (Agent Token)

```
Agent                     WebSocket Server           Database
  │                            │                        │
  │  1. Connect with           │                        │
  │     agent_token            │                        │
  │═══════════════════════════►│                        │
  │                            │                        │
  │                            │  2. Validate           │
  │                            │     agent_token        │
  │                            │─────────────────────── │
  │                            │◄───────────────────────│
  │                            │                        │
  │  3. Connection accepted    │                        │
  │◄═══════════════════════════│                        │
  │                            │                        │
  │  4. Regular heartbeats     │                        │
  │◄═══════════════════════════│                        │
```

### Token Generation

```javascript
// crypto.js
const crypto = require('crypto');

function generateInstallToken() {
  return crypto.randomBytes(32).toString('hex');  // 64 char hex string
}

function generateAgentToken() {
  return crypto.randomBytes(64).toString('hex');  // 128 char hex string
}
```

---

## 4. Security Best Practices

| Practice | Implementation |
|----------|---------------|
| Password strength | Minimum 8 chars, must include number + special char |
| Brute force protection | Rate limiting on login (5 attempts per 15 minutes) |
| Token rotation | Refresh token rotated on each use |
| Token revocation | Refresh tokens tracked in Redis, can be revoked |
| HTTPS only | All API and WebSocket connections over TLS |
| CORS | Strict origin whitelist |
| SQL injection | Parameterized queries only |
| XSS | Content-Security-Policy headers, input sanitization |
| CSRF | SameSite cookie attribute + CSRF tokens |
