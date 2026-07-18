# Installer Generator Design

## Overview

The installer generator creates user-specific installation scripts for Windows (PowerShell), Linux (Bash), and Docker. Each generated script contains a unique installation token that links the installed server back to the dashboard user who generated the script.

## How It Works

```
Dashboard User                API Server                  Database
     │                            │                          │
     │  1. Click "Generate        │                          │
     │     Install Script"        │                          │
     │  POST /api/installers/     │                          │
     │    script                  │                          │
     │  { platform: "windows",    │                          │
     │    label: "Office PCs" }   │                          │
     │───────────────────────────►│                          │
     │                            │                          │
     │                            │  2. Generate token       │
     │                            │  crypto.randomBytes(32)  │
     │                            │                          │
     │                            │  3. Save to              │
     │                            │  install_tokens table    │
     │                            │─────────────────────────►│
     │                            │                          │
     │                            │  4. Load template        │
     │                            │  windows-install.ps1.tpl │
     │                            │                          │
     │                            │  5. Inject variables     │
     │                            │  - INSTALL_TOKEN         │
     │                            │  - SERVER_URL            │
     │                            │  - DOWNLOAD_URL          │
     │                            │                          │
     │  6. Return rendered script │                          │
     │◄───────────────────────────│                          │
     │                            │                          │
     │  7. User copies script     │                          │
     │     and runs on target PC  │                          │
```

## Template Variables

Variables injected into templates at generation time:

| Variable | Description | Example |
|----------|-------------|---------|
| `{{INSTALL_TOKEN}}` | Unique 64-char hex token | `a1b2c3d4...` |
| `{{SERVER_URL}}` | WebSocket server URL | `wss://sockpit.example.com:3001` |
| `{{API_URL}}` | REST API URL for downloading binary | `https://sockpit.example.com` |
| `{{AGENT_DOWNLOAD_URL}}` | Direct URL to agent binary | `https://sockpit.example.com/downloads/agent-windows-amd64.exe` |
| `{{AGENT_VERSION}}` | Latest agent version | `1.0.0` |
| `{{CHECKSUM}}` | SHA256 of the agent binary | `sha256:abcdef...` |

---

## Windows Installer Template

### File: `installers/templates/windows-install.ps1.tpl`

```powershell
#Requires -RunAsAdministrator
# ============================================================
# SockPit Agent Installer for Windows
# Generated for: {{USER_EMAIL}}
# Generated at: {{GENERATED_AT}}
# ============================================================

$ErrorActionPreference = "Stop"

# ---- Configuration (injected at generation time) ----
$INSTALL_TOKEN = "{{INSTALL_TOKEN}}"
$SERVER_URL    = "{{SERVER_URL}}"
$API_URL       = "{{API_URL}}"
$AGENT_URL     = "{{AGENT_DOWNLOAD_URL}}"
$AGENT_VERSION = "{{AGENT_VERSION}}"
$CHECKSUM      = "{{CHECKSUM}}"

# ---- Variables ----
$INSTALL_DIR   = "C:\ProgramData\SockPit"
$SERVICE_NAME  = "SockPitAgent"
$AGENT_EXE     = "$INSTALL_DIR\sockpit-agent.exe"
$CONFIG_FILE   = "$INSTALL_DIR\config.json"

Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  SockPit Agent Installer v$AGENT_VERSION"     -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

# ---- Step 1: Check prerequisites ----
Write-Host "[1/8] Checking prerequisites..." -ForegroundColor Yellow
if (-not ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Write-Error "This script must be run as Administrator. Right-click PowerShell and select 'Run as Administrator'."
    exit 1
}

# ---- Step 2: Create installation directory ----
Write-Host "[2/8] Creating installation directory..." -ForegroundColor Yellow
if (-not (Test-Path $INSTALL_DIR)) {
    New-Item -ItemType Directory -Path $INSTALL_DIR -Force | Out-Null
}
New-Item -ItemType Directory -Path "$INSTALL_DIR\logs" -Force | Out-Null

# ---- Step 3: Download agent binary ----
Write-Host "[3/8] Downloading agent binary..." -ForegroundColor Yellow
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
Invoke-WebRequest -Uri $AGENT_URL -OutFile $AGENT_EXE -UseBasicParsing

# ---- Step 4: Verify checksum ----
Write-Host "[4/8] Verifying checksum..." -ForegroundColor Yellow
$hash = (Get-FileHash -Path $AGENT_EXE -Algorithm SHA256).Hash
if ($hash -ne $CHECKSUM) {
    Write-Error "Checksum verification failed! Expected: $CHECKSUM, Got: $hash"
    Remove-Item $AGENT_EXE -Force
    exit 1
}
Write-Host "  Checksum verified." -ForegroundColor Green

# ---- Step 5: Write configuration ----
Write-Host "[5/8] Writing configuration..." -ForegroundColor Yellow
$config = @{
    server_url         = $SERVER_URL
    install_token      = $INSTALL_TOKEN
    heartbeat_interval = 30
    metrics_interval   = 60
    log_level          = "info"
} | ConvertTo-Json -Depth 3

Set-Content -Path $CONFIG_FILE -Value $config

# ---- Step 6: Install Windows Service ----
Write-Host "[6/8] Installing Windows Service..." -ForegroundColor Yellow

# Remove existing service if present
$existingService = Get-Service -Name $SERVICE_NAME -ErrorAction SilentlyContinue
if ($existingService) {
    Stop-Service -Name $SERVICE_NAME -Force -ErrorAction SilentlyContinue
    sc.exe delete $SERVICE_NAME | Out-Null
    Start-Sleep -Seconds 2
}

# Create the service
New-Service -Name $SERVICE_NAME `
    -BinaryPathName "$AGENT_EXE --config `"$CONFIG_FILE`" --service" `
    -DisplayName "SockPit SOCKS5 Agent" `
    -Description "SockPit SOCKS5 Proxy Agent - Managed proxy server" `
    -StartupType Automatic | Out-Null

# ---- Step 7: Configure firewall ----
Write-Host "[7/8] Configuring firewall..." -ForegroundColor Yellow
# Base rule — more rules added dynamically by agent when ports are configured
New-NetFirewallRule -DisplayName "SockPit Agent" `
    -Direction Inbound -Action Allow -Protocol TCP `
    -Program $AGENT_EXE -Enabled True -ErrorAction SilentlyContinue | Out-Null

# ---- Step 8: Start service ----
Write-Host "[8/8] Starting service..." -ForegroundColor Yellow
Start-Service -Name $SERVICE_NAME

# ---- Verify ----
Start-Sleep -Seconds 5
$svc = Get-Service -Name $SERVICE_NAME
if ($svc.Status -eq "Running") {
    Write-Host ""
    Write-Host "============================================" -ForegroundColor Green
    Write-Host "  SockPit Agent installed successfully!"     -ForegroundColor Green
    Write-Host "  Service Status: Running"                   -ForegroundColor Green
    Write-Host "  Install Dir: $INSTALL_DIR"                 -ForegroundColor Green
    Write-Host "============================================" -ForegroundColor Green
} else {
    Write-Host ""
    Write-Host "WARNING: Service is not running. Check logs at $INSTALL_DIR\logs\" -ForegroundColor Red
}
```

---

## Linux Installer Template

### File: `installers/templates/linux-install.sh.tpl`

```bash
#!/bin/bash
# ============================================================
# SockPit Agent Installer for Linux
# Generated for: {{USER_EMAIL}}
# Generated at: {{GENERATED_AT}}
# ============================================================

set -euo pipefail

# ---- Configuration (injected at generation time) ----
INSTALL_TOKEN="{{INSTALL_TOKEN}}"
SERVER_URL="{{SERVER_URL}}"
API_URL="{{API_URL}}"
AGENT_VERSION="{{AGENT_VERSION}}"
CHECKSUM="{{CHECKSUM}}"

# ---- Variables ----
INSTALL_DIR="/opt/sockpit"
CONFIG_DIR="/etc/sockpit"
SERVICE_FILE="/etc/systemd/system/sockpit.service"
AGENT_BIN="$INSTALL_DIR/sockpit-agent"

# ---- Colors ----
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "${CYAN}============================================${NC}"
echo -e "${CYAN}  SockPit Agent Installer v${AGENT_VERSION}${NC}"
echo -e "${CYAN}============================================${NC}"
echo ""

# ---- Step 1: Check root ----
echo -e "${YELLOW}[1/9] Checking prerequisites...${NC}"
if [ "$EUID" -ne 0 ]; then
    echo -e "${RED}Error: This script must be run as root (use sudo)${NC}"
    exit 1
fi

# ---- Step 2: Detect architecture ----
echo -e "${YELLOW}[2/9] Detecting architecture...${NC}"
ARCH=$(uname -m)
case $ARCH in
    x86_64)  AGENT_ARCH="amd64" ;;
    aarch64) AGENT_ARCH="arm64" ;;
    *)       echo -e "${RED}Unsupported architecture: $ARCH${NC}"; exit 1 ;;
esac
AGENT_URL="${API_URL}/downloads/agent-linux-${AGENT_ARCH}"
echo "  Detected: $ARCH → $AGENT_ARCH"

# ---- Step 3: Create user ----
echo -e "${YELLOW}[3/9] Creating sockpit user...${NC}"
if ! id "sockpit" &>/dev/null; then
    useradd --system --no-create-home --shell /usr/sbin/nologin sockpit
fi

# ---- Step 4: Create directories ----
echo -e "${YELLOW}[4/9] Creating directories...${NC}"
mkdir -p "$INSTALL_DIR"
mkdir -p "$CONFIG_DIR"

# ---- Step 5: Download agent ----
echo -e "${YELLOW}[5/9] Downloading agent binary...${NC}"
curl -fSL "$AGENT_URL" -o "$AGENT_BIN"
chmod 755 "$AGENT_BIN"

# ---- Step 6: Verify checksum ----
echo -e "${YELLOW}[6/9] Verifying checksum...${NC}"
ACTUAL_HASH=$(sha256sum "$AGENT_BIN" | awk '{print $1}')
if [ "$ACTUAL_HASH" != "$CHECKSUM" ]; then
    echo -e "${RED}Checksum verification failed!${NC}"
    echo "Expected: $CHECKSUM"
    echo "Got:      $ACTUAL_HASH"
    rm -f "$AGENT_BIN"
    exit 1
fi
echo -e "  ${GREEN}Checksum verified.${NC}"

# ---- Step 7: Write config ----
echo -e "${YELLOW}[7/9] Writing configuration...${NC}"
cat > "$CONFIG_DIR/config.json" <<EOF
{
  "server_url": "$SERVER_URL",
  "install_token": "$INSTALL_TOKEN",
  "heartbeat_interval": 30,
  "metrics_interval": 60,
  "log_level": "info"
}
EOF
chown sockpit:sockpit "$CONFIG_DIR/config.json"
chmod 600 "$CONFIG_DIR/config.json"

# ---- Step 8: Create systemd service ----
echo -e "${YELLOW}[8/9] Creating systemd service...${NC}"
cat > "$SERVICE_FILE" <<EOF
[Unit]
Description=SockPit SOCKS5 Proxy Agent
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
ExecStart=$AGENT_BIN --config $CONFIG_DIR/config.json
Restart=always
RestartSec=5
User=sockpit
Group=sockpit
LimitNOFILE=65536
NoNewPrivileges=yes
ProtectSystem=strict
ProtectHome=yes
ReadWritePaths=$CONFIG_DIR
PrivateTmp=yes

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable sockpit

# ---- Step 9: Start service ----
echo -e "${YELLOW}[9/9] Starting service...${NC}"
systemctl start sockpit

# ---- Verify ----
sleep 5
if systemctl is-active --quiet sockpit; then
    echo ""
    echo -e "${GREEN}============================================${NC}"
    echo -e "${GREEN}  SockPit Agent installed successfully!${NC}"
    echo -e "${GREEN}  Service Status: Active (running)${NC}"
    echo -e "${GREEN}  Logs: journalctl -u sockpit -f${NC}"
    echo -e "${GREEN}============================================${NC}"
else
    echo ""
    echo -e "${RED}WARNING: Service failed to start.${NC}"
    echo -e "${RED}Check: journalctl -u sockpit -n 50${NC}"
fi
```

---

## Backend Generation Logic

### File: `server/src/services/installer.service.js`

```javascript
// Pseudocode for installer generation
class InstallerService {
  
  async generateScript(userId, platform, label) {
    // 1. Generate unique install token
    const token = crypto.randomBytes(32).toString('hex');
    
    // 2. Save token to database
    await InstallTokenModel.create({
      token,
      user_id: userId,
      label: label || `Install script - ${platform}`,
      expires_at: null,  // or set expiry
    });
    
    // 3. Load appropriate template
    const templates = {
      windows: 'installers/templates/windows-install.ps1.tpl',
      linux: 'installers/templates/linux-install.sh.tpl',
      docker: 'installers/templates/docker-install.sh.tpl',
    };
    const templatePath = templates[platform];
    const template = fs.readFileSync(templatePath, 'utf8');
    
    // 4. Get latest agent info
    const agentVersion = '1.0.0';  // from config or DB
    const agentChecksum = await this.getLatestChecksum(platform);
    
    // 5. Inject variables
    const script = template
      .replace(/\{\{INSTALL_TOKEN\}\}/g, token)
      .replace(/\{\{SERVER_URL\}\}/g, process.env.WS_URL)
      .replace(/\{\{API_URL\}\}/g, process.env.API_URL)
      .replace(/\{\{AGENT_DOWNLOAD_URL\}\}/g, `${process.env.API_URL}/downloads/agent-${platform}-amd64${platform === 'windows' ? '.exe' : ''}`)
      .replace(/\{\{AGENT_VERSION\}\}/g, agentVersion)
      .replace(/\{\{CHECKSUM\}\}/g, agentChecksum)
      .replace(/\{\{USER_EMAIL\}\}/g, user.email)
      .replace(/\{\{GENERATED_AT\}\}/g, new Date().toISOString());
    
    // 6. Audit log
    await AuditLogModel.create({
      user_id: userId,
      action: 'install_token_generated',
      resource_type: 'install_token',
      details: { platform, label },
    });
    
    return { script, token };
  }
  
  async listUserTokens(userId) {
    return InstallTokenModel.findByUserId(userId);
  }
  
  async revokeToken(userId, tokenId) {
    // Mark as expired, prevent future use
  }
}
```

## Token Lifecycle

```
Generated ──► Active ──► Used (server registered)
                │
                └──► Expired (time-based)
                │
                └──► Revoked (manual)
```

| State | Can Register Server? |
|-------|---------------------|
| Active | ✅ Yes |
| Used | ❌ No (already used) |
| Expired | ❌ No |
| Revoked | ❌ No |

## One-Liner Installation

The dashboard displays the script as a one-liner that users can paste:

**Windows (PowerShell):**
```powershell
irm https://sockpit.example.com/api/installers/run/INSTALL_TOKEN | iex
```

**Linux (Bash):**
```bash
curl -sSL https://sockpit.example.com/api/installers/run/INSTALL_TOKEN | sudo bash
```

**Docker:**
```bash
docker run -d --name sockpit-agent --restart always --network host \
  -e SOCKPIT_SERVER_URL="wss://sockpit.example.com:3001" \
  -e SOCKPIT_INSTALL_TOKEN="INSTALL_TOKEN" \
  -v sockpit_config:/etc/sockpit \
  ghcr.io/your-org/sockpit-agent:latest
```

The `/api/installers/run/:token` endpoint returns the rendered script directly, so users don't need to save a file. For Docker, the dashboard displays both the `docker run` one-liner and a `docker-compose.yml` snippet.
