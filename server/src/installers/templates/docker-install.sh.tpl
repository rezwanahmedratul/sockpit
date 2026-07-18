#!/bin/bash
# ============================================================
# SockPit Agent Installer for Docker Host
# Generated for: {{USER_EMAIL}}
# Generated at: {{GENERATED_AT}}
# ============================================================

set -euo pipefail

# ---- Configuration (injected at generation time) ----
INSTALL_TOKEN="{{INSTALL_TOKEN}}"
SERVER_URL="{{SERVER_URL}}"
ENCRYPTION_KEY="{{ENCRYPTION_KEY}}"
DOCKER_IMAGE="ghcr.io/rezwanahmedratul/sockpit-agent:latest"

# ---- Colors ----
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "${CYAN}============================================${NC}"
echo -e "${CYAN}  SockPit Docker Agent Setup Script${NC}"
echo -e "${CYAN}============================================${NC}"
echo ""

# ---- Step 1: Check root ----
echo -e "${YELLOW}[1/4] Checking prerequisites...${NC}"
if [ "$EUID" -ne 0 ]; then
    echo -e "${RED}Error: This script must be run as root (use sudo)${NC}"
    exit 1
fi

# ---- Step 2: Ensure Docker is installed ----
echo -e "${YELLOW}[2/4] Verifying Docker environment...${NC}"
if ! command -v docker &>/dev/null; then
    echo -e "${YELLOW}Docker not found. Installing Docker Engine...${NC}"
    curl -fsSL https://get.docker.com -o get-docker.sh
    sh get-docker.sh
    rm get-docker.sh
fi
echo -e "  ${GREEN}Docker is ready.${NC}"

# ---- Step 3: Stop any existing agent container ----
echo -e "${YELLOW}[3/4] Cleaning existing containers...${NC}"
if docker ps -a --format '{{.Names}}' | grep -Eq "^sockpit-agent$"; then
    echo "  Stopping and removing old sockpit-agent container..."
    docker stop sockpit-agent &>/dev/null || true
    docker rm sockpit-agent &>/dev/null || true
fi

# ---- Step 4: Run the Docker agent container ----
echo -e "${YELLOW}[4/4] Starting SockPit Docker Agent container...${NC}"

# Ensure config folder exists
mkdir -p /etc/sockpit

# Write seed config
cat > /etc/sockpit/config.json <<EOF
{
  "server_url": "$SERVER_URL",
  "install_token": "$INSTALL_TOKEN",
  "encryption_key": "$ENCRYPTION_KEY"
}
EOF
chmod 600 /etc/sockpit/config.json

docker run -d \
  --name sockpit-agent \
  --restart always \
  --network host \
  -v /etc/sockpit:/etc/sockpit \
  "$DOCKER_IMAGE"

# ---- Verify ----
sleep 5
if docker ps --format '{{.Names}}' | grep -Eq "^sockpit-agent$"; then
    echo ""
    echo -e "${GREEN}============================================${NC}"
    echo -e "${GREEN}  SockPit Docker Agent container started!${NC}"
    echo -e "${GREEN}  Docker network: Host Mode Active${NC}"
    echo -e "${GREEN}  Logs: docker logs -f sockpit-agent${NC}"
    echo -e "${GREEN}============================================${NC}"
else
    echo ""
    echo -e "${RED}WARNING: Container failed to start. Check logs:${NC}"
    echo "docker logs sockpit-agent"
fi
