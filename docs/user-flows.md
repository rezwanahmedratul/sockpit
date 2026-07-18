# User Flows & Workflows

## Overview

This document describes the key user journeys through the SockPit platform, from first setup to daily operations.

---

## Flow 1: Initial Platform Setup (Admin)

```
Admin
  │
  │  1. Deploy SockPit via Docker Compose
  │     docker compose up -d
  │
  │  2. Run database migrations
  │     npm run migrate
  │
  │  3. Default admin account created:
  │     email: admin@sockpit.local
  │     pass: changeme123
  │
  │  4. Login to dashboard
  │     https://your-domain.com/login
  │
  │  5. Change default password
  │     Settings → Change Password
  │
  │  6. Create user accounts
  │     Users → Add User
  │     - Robert (robert@example.com, role: user)
  │     - Alice (alice@example.com, role: user)
  │
  │  ✅ Platform ready
```

---

## Flow 2: User Deploys a Proxy Server (Robert)

```
Robert                       Dashboard                    Target Windows PC
  │                              │                              │
  │  1. Login                    │                              │
  │     robert@example.com       │                              │
  │─────────────────────────────►│                              │
  │                              │                              │
  │  2. Go to Installers page    │                              │
  │─────────────────────────────►│                              │
  │                              │                              │
  │  3. Select "Windows"         │                              │
  │     Add label: "NYC Office"  │                              │
  │     Click "Generate"         │                              │
  │─────────────────────────────►│                              │
  │                              │                              │
  │  4. Dashboard shows:         │                              │
  │     - Full script (copyable) │                              │
  │     - One-liner command      │                              │
  │◄─────────────────────────────│                              │
  │                              │                              │
  │  5. Copy one-liner:          │                              │
  │     irm https://sockpit...   │                              │
  │        | iex                 │                              │
  │                              │                              │
  │  6. Open PowerShell as Admin │                              │
  │     on target PC, paste      │                              │
  │     and run ─────────────────┼─────────────────────────────►│
  │                              │                              │
  │                              │          7. Script executes: │
  │                              │          - Downloads agent   │
  │                              │          - Installs service  │
  │                              │◄═════════════════════════════│
  │                              │          - Connects via WS   │
  │                              │                              │
  │  8. New server appears       │                              │
  │     in Robert's Servers page │                              │
  │     Status: Online ✅        │                              │
  │◄─────────────────────────────│                              │
  │                              │                              │
  │  ✅ Server deployed          │                              │
```

---

## Flow 3: Configure SOCKS5 Proxy (Robert)

```
Robert                       Dashboard                  Agent (NYC Office PC)
  │                              │                              │
  │  1. Go to Servers page       │                              │
  │     Click "NYC-DESKTOP"      │                              │
  │─────────────────────────────►│                              │
  │                              │                              │
  │  2. Click "Add SOCKS5 User"  │                              │
  │─────────────────────────────►│                              │
  │                              │                              │
  │  3. Fill modal:              │                              │
  │     Username: client1        │                              │
  │     Password: ********       │                              │
  │     Port: 1080               │                              │
  │     Max Connections: 5       │                              │
  │     Click "Create"           │                              │
  │─────────────────────────────►│                              │
  │                              │  4. Save to DB               │
  │                              │  5. Send ADD_SOCKS5_USER     │
  │                              │     via WebSocket            │
  │                              │═════════════════════════════►│
  │                              │                              │
  │                              │  6. Agent configures         │
  │                              │     SOCKS5 listener          │
  │                              │     on port 1080             │
  │                              │                              │
  │                              │  7. ACK                      │
  │                              │◄═════════════════════════════│
  │                              │                              │
  │  8. Success! Table updates   │                              │
  │     showing new user         │                              │
  │◄─────────────────────────────│                              │
  │                              │                              │
  │  ✅ SOCKS5 proxy ready       │                              │
  │     Connect: 1.2.3.4:1080   │                              │
  │     User: client1            │                              │
```

---

## Flow 4: End User Connects via SOCKS5

```
End User (Browser/App)         Target PC (Agent)          Internet
       │                            │                        │
       │  1. Configure SOCKS5       │                        │
       │     proxy in browser:      │                        │
       │     Host: 1.2.3.4          │                        │
       │     Port: 1080             │                        │
       │     User: client1          │                        │
       │     Pass: ********         │                        │
       │                            │                        │
       │  2. Browse to website      │                        │
       │─────────────────────────── │                        │
       │     SOCKS5 CONNECT         │                        │
       │─────────────────────────── │                        │
       │                            │                        │
       │  3. Auth check:            │                        │
       │     ✅ Username valid      │                        │
       │     ✅ Password valid      │                        │
       │     ✅ Connections < max   │                        │
       │                            │                        │
       │                            │  4. Connect to target  │
       │                            │─────────────────────── │
       │                            │                        │
       │  5. Bidirectional relay    │                        │
       │◄═══════════════════════════│◄═══════════════════════│
       │                            │                        │
       │  Traffic flows through     │                        │
       │  the proxy                 │                        │
```

---

## Flow 5: Admin Monitors All Servers

```
Admin                        Dashboard
  │                              │
  │  1. Login as admin           │
  │─────────────────────────────►│
  │                              │
  │  2. Overview shows:          │
  │     - Total: 20 servers      │
  │     - Online: 18             │
  │     - Offline: 2             │
  │     - 45 active SOCKS5 users │
  │     - 120 active connections │
  │◄─────────────────────────────│
  │                              │
  │  3. Servers page shows ALL   │
  │     servers from ALL users   │
  │     with owner column        │
  │◄─────────────────────────────│
  │                              │
  │  4. Can filter by owner      │
  │     Can click any server     │
  │     Can manage any server    │
  │                              │
  │  5. Audit Log shows all      │
  │     actions across platform  │
  │◄─────────────────────────────│
```

---

## Flow 6: Server Goes Offline / Reconnects

```
Agent                        WebSocket Server             Dashboard
  │                               │                           │
  │  ═══ Connected ═══            │                           │
  │  HEARTBEAT every 30s          │                           │
  │═══════════════════════════════│                           │
  │                               │                           │
  │  ❌ Network interruption      │                           │
  │  ×                            │                           │
  │                               │                           │
  │                               │  No heartbeat for 90s     │
  │                               │  Mark server: OFFLINE     │
  │                               │──────────────────────────►│
  │                               │  Push: STATUS_CHANGED     │
  │                               │                           │
  │                               │                    🔴 Badge turns red
  │                               │                           │
  │  ... network restored ...     │                           │
  │                               │                           │
  │  Reconnect (backoff: 1s)      │                           │
  │═══════════════════════════════│                           │
  │  AGENT_AUTH (agent_token)     │                           │
  │═══════════════════════════════│                           │
  │                               │                           │
  │  AUTH_RESULT (success)        │                           │
  │◄══════════════════════════════│                           │
  │                               │                           │
  │  SYNC_CONFIG                  │  Mark server: ONLINE      │
  │◄══════════════════════════════│──────────────────────────►│
  │  SYNC_RESULT                  │  Push: STATUS_CHANGED     │
  │═══════════════════════════════│                           │
  │                               │                    🟢 Badge turns green
  │  Resume normal operation      │                           │
```

---

## Flow 7: User Deletes a SOCKS5 User

```
Robert                       Dashboard                  Agent
  │                              │                         │
  │  1. Server detail page       │                         │
  │     Click 🗑 on "client2"    │                         │
  │─────────────────────────────►│                         │
  │                              │                         │
  │  2. Confirm deletion modal   │                         │
  │     "Delete client2?"        │                         │
  │     "This will terminate     │                         │
  │      active connections"     │                         │
  │                              │                         │
  │  3. Click "Delete"           │                         │
  │─────────────────────────────►│                         │
  │                              │                         │
  │                              │  4. Send REMOVE_SOCKS5  │
  │                              │═════════════════════════►│
  │                              │                         │
  │                              │  5. Agent terminates    │
  │                              │     client2 connections │
  │                              │     Removes listener if │
  │                              │     no other users on   │
  │                              │     that port           │
  │                              │                         │
  │                              │  6. ACK                 │
  │                              │◄═════════════════════════│
  │                              │                         │
  │                              │  7. Delete from DB      │
  │                              │                         │
  │  8. Table refreshes          │                         │
  │◄─────────────────────────────│                         │
```
