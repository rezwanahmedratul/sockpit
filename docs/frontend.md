# Frontend Dashboard Design

## Overview

The dashboard is a Next.js 14+ application using the App Router. It provides the web interface for administrators and users to manage their SOCKS5 proxy servers.

## Directory Structure

```
dashboard/
├── src/
│   ├── app/
│   │   ├── layout.js                   # Root layout (fonts, global styles, providers)
│   │   ├── page.js                     # Landing / redirect to login or dashboard
│   │   ├── globals.css                 # Global CSS variables and base styles
│   │   ├── (auth)/
│   │   │   ├── login/
│   │   │   │   └── page.js            # Login page
│   │   │   └── layout.js              # Auth layout (centered, minimal)
│   │   └── (dashboard)/
│   │       ├── layout.js              # Dashboard layout (sidebar + topbar)
│   │       ├── overview/
│   │       │   └── page.js            # Dashboard home — stats & recent activity
│   │       ├── servers/
│   │       │   ├── page.js            # Server list (filterable, searchable)
│   │       │   └── [serverId]/
│   │       │       ├── page.js        # Server detail — info + SOCKS5 users
│   │       │       └── metrics/
│   │       │           └── page.js    # Server metrics & charts
│   │       ├── installers/
│   │       │   └── page.js            # Generate & copy install scripts
│   │       ├── users/
│   │       │   └── page.js            # User management (admin only)
│   │       ├── audit-log/
│   │       │   └── page.js            # Audit log viewer (admin only)
│   │       └── settings/
│   │           └── page.js            # Account settings
│   ├── components/
│   │   ├── ui/                         # Reusable primitive components
│   │   │   ├── Button.js
│   │   │   ├── Input.js
│   │   │   ├── Modal.js
│   │   │   ├── Table.js
│   │   │   ├── Badge.js
│   │   │   ├── Card.js
│   │   │   ├── Dropdown.js
│   │   │   ├── Toast.js
│   │   │   ├── Skeleton.js
│   │   │   └── Tooltip.js
│   │   ├── layout/
│   │   │   ├── Sidebar.js              # Navigation sidebar
│   │   │   ├── Topbar.js               # Top bar with user menu
│   │   │   └── MobileNav.js            # Mobile navigation drawer
│   │   ├── servers/
│   │   │   ├── ServerCard.js            # Server overview card
│   │   │   ├── ServerStatusBadge.js     # Online/offline indicator
│   │   │   ├── ServerList.js            # Server grid/list view
│   │   │   └── ServerDetailPanel.js     # Server info panel
│   │   ├── socks5/
│   │   │   ├── Socks5UserTable.js       # SOCKS5 user list for a server
│   │   │   ├── AddSocks5UserModal.js    # Modal to create SOCKS5 user
│   │   │   └── EditSocks5UserModal.js   # Modal to edit SOCKS5 user
│   │   ├── installers/
│   │   │   ├── ScriptGenerator.js       # Script generation UI
│   │   │   └── ScriptDisplay.js         # Code block with copy button
│   │   ├── metrics/
│   │   │   ├── MetricsChart.js          # Time-series chart (CPU, RAM, bandwidth)
│   │   │   └── ConnectionsChart.js      # Active connections chart
│   │   └── auth/
│   │       └── LoginForm.js             # Login form component
│   ├── lib/
│   │   ├── api.js                       # API client (fetch wrapper)
│   │   ├── auth.js                      # Auth helpers (token storage, refresh)
│   │   └── utils.js                     # Formatters, constants
│   ├── hooks/
│   │   ├── useAuth.js                   # Auth context hook
│   │   ├── useServers.js                # Server data fetching
│   │   ├── useSocks5Users.js            # SOCKS5 user data fetching
│   │   └── useWebSocket.js              # WebSocket connection for real-time updates
│   └── styles/
│       ├── variables.css                # CSS custom properties (colors, spacing)
│       ├── Sidebar.module.css
│       ├── ServerCard.module.css
│       └── ... (component-specific CSS modules)
├── public/
│   ├── favicon.ico
│   └── logo.svg
├── next.config.js
├── package.json
└── Dockerfile
```

## Pages & Features

### 1. Login Page (`/login`)

- Email + password form
- JWT token stored in httpOnly cookie or localStorage
- Redirect to `/overview` on success
- Animated gradient background

### 2. Overview / Dashboard Home (`/overview`)

| Widget | Description |
|--------|-------------|
| Total Servers | Count of registered servers (scoped to user) |
| Online Servers | Count currently connected |
| Total SOCKS5 Users | Sum across all servers |
| Active Connections | Real-time count |
| Recent Activity | Latest audit log entries |
| Server Status Map | Quick glance of all server statuses |

### 3. Servers Page (`/servers`)

- **Grid/List view** toggle
- **Search** by hostname, IP
- **Filter** by status (online/offline/error)
- **Sort** by name, created date, status
- Each card shows:
  - Hostname & IP
  - OS icon (Windows/Linux/Docker)
  - Status badge (green/red/yellow)
  - SOCKS5 user count
  - Last heartbeat time
  - Click → Server Detail

### 4. Server Detail (`/servers/[serverId]`)

- **Server Info Panel**: hostname, IP, OS, agent version, uptime, status
- **SOCKS5 Users Table**:
  - Username, port, max connections, current connections, status
  - Actions: Edit, Delete, Toggle Active
- **Add SOCKS5 User** button → modal
- **Quick Actions**: Restart agent, Remove server
- **Link to Metrics** page

### 5. Server Metrics (`/servers/[serverId]/metrics`)

- Time-range selector (1h, 6h, 24h, 7d)
- Charts:
  - CPU Usage (line chart)
  - Memory Usage (line chart)
  - Bandwidth In/Out (area chart)
  - Active Connections (bar chart)

### 6. Installers Page (`/installers`)

- Platform selector: Windows / Linux / Docker
- Optional label for the install token
- **Generate** button → creates unique script
- **Script Display**: syntax-highlighted code block with one-click copy
  - Windows: PowerShell script
  - Linux: Bash script
  - Docker: `docker run` one-liner or `docker-compose.yml` snippet
- History of generated tokens (table: label, platform, token, used/unused, created_at)

### 7. User Management (`/users`) — Admin Only

- User list table: email, name, role, servers count, status
- Actions: Create User, Edit, Deactivate, Delete
- Create User modal: email, password, display name, role (admin/user)

### 8. Audit Log (`/audit-log`) — Admin Only

- Filterable table of all actions
- Filters: user, action type, date range
- Details expandable for each entry

### 9. Settings (`/settings`)

- Change password
- Update display name
- API key management (future)

## Design System

### Color Palette (Dark Theme)

```css
:root {
  /* Background layers */
  --bg-primary: #0a0a0f;
  --bg-secondary: #12121a;
  --bg-tertiary: #1a1a28;
  --bg-elevated: #22223a;
  
  /* Accent */
  --accent-primary: #6c5ce7;
  --accent-secondary: #a29bfe;
  --accent-glow: rgba(108, 92, 231, 0.3);
  
  /* Status */
  --status-online: #00cec9;
  --status-offline: #636e72;
  --status-error: #ff6b6b;
  --status-warning: #feca57;
  
  /* Text */
  --text-primary: #f0f0f5;
  --text-secondary: #a0a0b0;
  --text-muted: #60607a;
  
  /* Border */
  --border-subtle: rgba(255, 255, 255, 0.06);
  --border-default: rgba(255, 255, 255, 0.1);
  
  /* Glassmorphism */
  --glass-bg: rgba(255, 255, 255, 0.04);
  --glass-border: rgba(255, 255, 255, 0.08);
}
```

### Typography

```css
/* Google Fonts: Inter for UI, JetBrains Mono for code */
--font-sans: 'Inter', -apple-system, sans-serif;
--font-mono: 'JetBrains Mono', monospace;
```

### Component Style Guidelines

- **Cards**: Glassmorphism with `backdrop-filter: blur(12px)`, subtle borders
- **Buttons**: Gradient fill for primary, ghost for secondary, smooth hover transitions
- **Tables**: Alternating subtle row backgrounds, sticky headers
- **Modals**: Frosted glass overlay, slide-in animation
- **Badges**: Rounded pills with status-appropriate colors
- **Charts**: Use smooth gradients, avoid harsh colors

## Real-Time Updates

The dashboard maintains a WebSocket connection to receive real-time updates:

```javascript
// Events the frontend listens for:
{
  "server_status_changed": { serverId, status },
  "server_metrics_update": { serverId, cpu, memory, connections },
  "socks5_user_connection_count": { serverId, userId, count },
  "server_registered": { server },
  "server_removed": { serverId }
}
```

This allows the dashboard to update server status badges, metrics charts, and connection counts without polling.
