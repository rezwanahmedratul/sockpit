# Security Considerations

## Overview

Security is critical for SockPit — it manages proxy servers that could be used to route sensitive traffic. This document covers all security layers and best practices.

---

## 1. Transport Security

### TLS Everywhere

| Connection | Protocol | Certificate |
|-----------|----------|-------------|
| Browser → Dashboard | HTTPS (TLS 1.2+) | Let's Encrypt / commercial cert |
| Agent → WebSocket | WSS (TLS 1.2+) | Same as above |
| Server → PostgreSQL | TLS | Self-signed or internal CA |
| Server → Redis | TLS (optional) | Internal CA |

### Certificate Pinning (Agent)

The agent can optionally pin the server's TLS certificate to prevent MITM attacks:

```go
// Agent config option
{
  "tls_pin_sha256": "base64-encoded-sha256-of-cert"
}
```

---

## 2. Authentication Security

### Password Policy

- Minimum 8 characters
- At least 1 uppercase, 1 lowercase, 1 number, 1 special character
- Passwords hashed with bcrypt (cost factor 12)
- No password stored in plaintext

### JWT Security

- Access tokens: 15-minute expiry
- Refresh tokens: 7-day expiry, single-use (rotated on refresh)
- Refresh tokens tracked in Redis for revocation
- JTI (JWT ID) for each token to prevent replay
- Tokens invalidated on password change

### Brute Force Protection

```javascript
// Rate limiting on auth endpoints
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,  // 15 minutes
  max: 5,                     // 5 attempts per window
  message: 'Too many login attempts, please try again later',
  standardHeaders: true,
  legacyHeaders: false,
});
```

### Account Lockout

After 10 failed login attempts, the account is temporarily locked for 30 minutes.

---

## 3. Agent Token Security

### Token Properties

| Property | Value |
|----------|-------|
| Length | 128 hex characters (64 bytes of entropy) |
| Generation | `crypto.randomBytes(64)` |
| Storage (server) | Hashed in database |
| Storage (agent) | Plaintext in local config file with restricted permissions |
| Rotation | Can be rotated via dashboard |
| Revocation | Immediate via dashboard |

### Install Token Security

- One-time use (marked as used after first registration)
- Optional expiration (configurable)
- Tied to a specific user
- Can be revoked before use
- Logged when generated, when used, and when revoked

---

## 4. SOCKS5 Password Security

### The Challenge

SOCKS5 RFC 1929 requires plaintext username/password comparison. The agent needs the actual password to authenticate SOCKS5 clients.

### Solution: Encrypted Storage

```
Dashboard                    Database                     Agent
   │                            │                           │
   │  1. User sets password     │                           │
   │     "mypass123"            │                           │
   │─────────────────────────── │                           │
   │                            │                           │
   │  2. Store:                 │                           │
   │     password_hash (bcrypt) │                           │
   │     password_enc (AES-256) │                           │
   │                            │                           │
   │                            │  3. Send via WebSocket    │
   │                            │     (encrypted password)  │
   │                            │─────────────────────────►│
   │                            │                           │
   │                            │  4. Agent decrypts with   │
   │                            │     shared key, stores    │
   │                            │     in-memory only        │
```

- `password_hash`: bcrypt hash for verification on the API side
- `password_enc`: AES-256-GCM encrypted, decryptable by agent
- Agent holds passwords in-memory only — never written to disk in plaintext
- Encryption key shared between server and agent during registration

---

## 5. Network Security

### API Security Headers (Helmet.js)

```javascript
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:"],
      connectSrc: ["'self'", "wss://*.your-domain.com"],
    }
  },
  crossOriginOpenerPolicy: true,
  crossOriginResourcePolicy: { policy: "same-origin" },
  referrerPolicy: { policy: "strict-origin-when-cross-origin" },
}));
```

### CORS Configuration

```javascript
app.use(cors({
  origin: process.env.DASHBOARD_URL,  // strict origin
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
```

### Rate Limiting

| Endpoint | Limit |
|----------|-------|
| `/api/auth/login` | 5 per 15 min |
| `/api/auth/refresh` | 30 per 15 min |
| `/api/installers/script` | 10 per hour |
| All other endpoints | 100 per 15 min |

---

## 6. Data Security

### SQL Injection Prevention

All database queries use parameterized statements:

```javascript
// ✅ SAFE — parameterized query
const result = await pool.query(
  'SELECT * FROM servers WHERE owner_id = $1 AND status = $2',
  [userId, status]
);

// ❌ UNSAFE — string interpolation (NEVER DO THIS)
const result = await pool.query(
  `SELECT * FROM servers WHERE owner_id = '${userId}'`
);
```

### Input Validation

All API inputs validated with Zod schemas:

```javascript
const createSocks5UserSchema = z.object({
  username: z.string().min(3).max(50).regex(/^[a-zA-Z0-9_]+$/),
  password: z.string().min(6).max(100),
  port: z.number().int().min(1024).max(65535),
  max_connections: z.number().int().min(1).max(1000),
});
```

### Sensitive Data Handling

| Data | Storage | Display |
|------|---------|---------|
| Dashboard passwords | bcrypt hash only | Never shown |
| SOCKS5 passwords | bcrypt hash + AES-256 encrypted | Masked in UI |
| Agent tokens | Hashed in DB | Shown once at registration |
| Install tokens | Plaintext in DB (used for lookup) | Shown in installer scripts |
| JWT secrets | Environment variable | Never exposed |

---

## 7. Agent Security

### File Permissions (Linux)

```bash
/opt/sockpit/sockpit-agent    # 755, owned by sockpit:sockpit
/etc/sockpit/config.json      # 600, owned by sockpit:sockpit
```

### Windows Service Security

- Runs as `LocalService` or a dedicated user account
- Config file in `C:\ProgramData\SockPit\` with restricted ACLs
- No interactive desktop access

### Agent Binary Integrity

- SHA-256 checksum verified during installation
- Optional: code signing for Windows executables

---

## 8. Audit Trail

All security-relevant actions are logged:

- Login attempts (success and failure)
- User creation/modification/deletion
- Server registration/removal
- SOCKS5 user changes
- Install token generation/revocation
- Password changes

Audit logs include:
- User ID
- IP address
- Timestamp
- Action details (JSONB)

Retention: 1 year minimum

---

## 9. Deployment Security Checklist

- [ ] Change all default passwords
- [ ] Set strong `JWT_SECRET` (at least 256 bits)
- [ ] Set strong `ENCRYPTION_KEY` (32 bytes)
- [ ] Enable TLS for all connections
- [ ] Configure firewall (only expose ports 443, 3001)
- [ ] Set up automatic certificate renewal
- [ ] Enable database connection over TLS
- [ ] Set `NODE_ENV=production`
- [ ] Disable debug logging in production
- [ ] Set up log aggregation and alerting
- [ ] Configure backup strategy for PostgreSQL
- [ ] Review CORS origins
- [ ] Test rate limiting
