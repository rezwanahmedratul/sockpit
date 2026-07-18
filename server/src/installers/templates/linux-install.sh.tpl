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
ENCRYPTION_KEY="{{ENCRYPTION_KEY}}"

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
if [ "$ACTUAL_HASH" != "$CHECKSUM" ] && [ "$CHECKSUM" != "SKIP" ]; then
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
  "encryption_key": "$ENCRYPTION_KEY"
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
ExecStart=$AGENT_BIN --config-path $CONFIG_DIR/config.json
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
