#!/usr/bin/env bash
#
# SockPit — Automated Installation Script
# Deploys the SockPit stack with Docker, PostgreSQL & Redis
#
# This script does NOT install or configure any reverse proxy, SSL, or firewall.
# You are expected to handle domain routing and SSL via your own proxy manager
# (e.g., Pangolin, Nginx Proxy Manager, Traefik, Caddy).
#
# Usage:
#   chmod +x install.sh
#   sudo ./install.sh
#
# Repository: https://github.com/rezwanahmedratul/sockpit.git
#

set -euo pipefail

# ─── Color Codes ────────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m' # No Color

# ─── Configuration ──────────────────────────────────────────────────────────────
INSTALL_DIR="/opt/sockpit"
COMPOSE_FILE="docker-compose.prod.yml"
DOWNLOADS_DIR="${INSTALL_DIR}/downloads"
BACKUPS_DIR="${INSTALL_DIR}/backups"

# ─── Helper Functions ───────────────────────────────────────────────────────────
log_info()    { echo -e "${BLUE}[INFO]${NC}    $1"; }
log_success() { echo -e "${GREEN}[✓]${NC}       $1"; }
log_warn()    { echo -e "${YELLOW}[WARN]${NC}    $1"; }
log_error()   { echo -e "${RED}[✗]${NC}       $1"; }
log_step()    { echo -e "\n${CYAN}${BOLD}━━━ $1 ━━━${NC}\n"; }

banner() {
    echo -e "${CYAN}${BOLD}"
    cat << 'BANNER'

    ╔═══════════════════════════════════════════════════════════╗
    ║                                                           ║
    ║     ███████╗ ██████╗  ██████╗██╗  ██╗██████╗ ██╗████████╗ ║
    ║     ██╔════╝██╔═══██╗██╔════╝██║ ██╔╝██╔══██╗██║╚══██╔══╝ ║
    ║     ███████╗██║   ██║██║     █████╔╝ ██████╔╝██║   ██║    ║
    ║     ╚════██║██║   ██║██║     ██╔═██╗ ██╔═══╝ ██║   ██║    ║
    ║     ███████║╚██████╔╝╚██████╗██║  ██╗██║     ██║   ██║    ║
    ║     ╚══════╝ ╚═════╝  ╚═════╝╚═╝  ╚═╝╚═╝     ╚═╝   ╚═╝    ║
    ║                                                           ║
    ║           SOCKS5 Proxy Management Platform                ║
    ║              Automated Server Installer                   ║
    ║                                                           ║
    ╚═══════════════════════════════════════════════════════════╝

BANNER
    echo -e "${NC}"
}

check_root() {
    if [[ "$EUID" -ne 0 ]]; then
        log_error "This script must be run as root (use sudo)."
        exit 1
    fi
}

check_os() {
    if [[ ! -f /etc/os-release ]]; then
        log_error "Cannot detect OS. This script supports Ubuntu 22.04/24.04 and Debian 12."
        exit 1
    fi

    source /etc/os-release

    case "$ID" in
        ubuntu)
            if [[ "$VERSION_ID" != "22.04" && "$VERSION_ID" != "24.04" ]]; then
                log_warn "Detected Ubuntu $VERSION_ID. This script is tested on 22.04 and 24.04."
                log_warn "Proceeding anyway — some steps may need adjustments."
            else
                log_success "Detected Ubuntu $VERSION_ID"
            fi
            ;;
        debian)
            local major_version="${VERSION_ID%%.*}"
            if [[ "$major_version" -lt 12 ]]; then
                log_warn "Detected Debian $VERSION_ID. This script is tested on Debian 12+."
                log_warn "Proceeding anyway — some steps may need adjustments."
            else
                log_success "Detected Debian $VERSION_ID"
            fi
            ;;
        *)
            log_warn "Detected unsupported OS: $ID $VERSION_ID"
            log_warn "This script is designed for Ubuntu/Debian. Proceeding at your own risk."
            ;;
    esac
}

get_local_ip() {
    local ip=""
    ip=$(hostname -I | awk '{print $1}') || ip="unknown"
    echo "$ip"
}

generate_secret() {
    local length="${1:-48}"
    openssl rand -base64 "$length" | tr -d '/+=' | head -c 64
}

generate_hex_key() {
    openssl rand -hex 32
}

generate_password() {
    openssl rand -base64 24 | tr -d '/+=' | head -c 32
}

# ─── Main Installation Steps ────────────────────────────────────────────────────

install_dependencies() {
    log_step "Step 1/5: Installing System Dependencies"

    log_info "Updating system packages..."
    apt-get update -qq
    apt-get upgrade -y -qq

    log_info "Installing base dependencies..."
    apt-get install -y -qq \
        ca-certificates \
        curl \
        gnupg \
        git \
        openssl \
        jq \
        lsb-release \
        apt-transport-https \
        software-properties-common

    log_success "Base dependencies installed"
}

install_docker() {
    log_step "Step 2/5: Installing Docker"

    if command -v docker &>/dev/null; then
        log_success "Docker is already installed: $(docker --version)"
    else
        log_info "Installing Docker Engine..."
        curl -fsSL https://get.docker.com | sh
        log_success "Docker installed: $(docker --version)"
    fi

    # Ensure Docker service is running
    systemctl enable docker
    systemctl start docker

    # Verify Docker Compose v2
    if docker compose version &>/dev/null; then
        log_success "Docker Compose v2 available: $(docker compose version --short)"
    else
        log_error "Docker Compose v2 is not available. Please install it manually."
        exit 1
    fi
}

prompt_domain() {
    log_step "Step 3/5: Domain Configuration"

    echo -e "${BOLD}Enter the domain name${NC} that you will point to this server via your reverse proxy"
    echo -e "(e.g., panel.yourdomain.com or sockpit.example.com):"
    echo ""
    read -rp "  Domain: " DOMAIN

    if [[ -z "$DOMAIN" ]]; then
        log_error "Domain cannot be empty."
        exit 1
    fi

    # Strip any protocol prefix the user might accidentally include
    DOMAIN="${DOMAIN#https://}"
    DOMAIN="${DOMAIN#http://}"
    DOMAIN="${DOMAIN%/}"

    log_success "Domain set to: ${BOLD}${DOMAIN}${NC}"

    local LOCAL_IP
    LOCAL_IP=$(get_local_ip)

    echo ""
    echo -e "${YELLOW}${BOLD}╔══════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${YELLOW}${BOLD}║                    PROXY CONFIGURATION                       ║${NC}"
    echo -e "${YELLOW}${BOLD}╠══════════════════════════════════════════════════════════════╣${NC}"
    echo -e "${YELLOW}${BOLD}║${NC}                                                              ${YELLOW}${BOLD}║${NC}"
    echo -e "${YELLOW}${BOLD}║${NC}  After installation, point your domain in your proxy          ${YELLOW}${BOLD}║${NC}"
    echo -e "${YELLOW}${BOLD}║${NC}  manager (Pangolin, NPM, Traefik, etc.) to this server:       ${YELLOW}${BOLD}║${NC}"
    echo -e "${YELLOW}${BOLD}║${NC}                                                              ${YELLOW}${BOLD}║${NC}"
    echo -e "${YELLOW}${BOLD}║${NC}    Domain:    ${CYAN}${BOLD}${DOMAIN}${NC}                    ${YELLOW}${BOLD}║${NC}"
    echo -e "${YELLOW}${BOLD}║${NC}    Server IP: ${GREEN}${BOLD}${LOCAL_IP}${NC}                             ${YELLOW}${BOLD}║${NC}"
    echo -e "${YELLOW}${BOLD}║${NC}                                                              ${YELLOW}${BOLD}║${NC}"
    echo -e "${YELLOW}${BOLD}║${NC}  Route:  /       → http://${LOCAL_IP}:3002  (Dashboard)        ${YELLOW}${BOLD}║${NC}"
    echo -e "${YELLOW}${BOLD}║${NC}  Route:  /api/   → http://${LOCAL_IP}:3000  (API)              ${YELLOW}${BOLD}║${NC}"
    echo -e "${YELLOW}${BOLD}║${NC}  Route:  /ws/    → http://${LOCAL_IP}:3001  (WebSocket)        ${YELLOW}${BOLD}║${NC}"
    echo -e "${YELLOW}${BOLD}║${NC}                                                              ${YELLOW}${BOLD}║${NC}"
    echo -e "${YELLOW}${BOLD}║${NC}  ⚠ WebSocket route MUST forward Upgrade headers!             ${YELLOW}${BOLD}║${NC}"
    echo -e "${YELLOW}${BOLD}║${NC}                                                              ${YELLOW}${BOLD}║${NC}"
    echo -e "${YELLOW}${BOLD}╚══════════════════════════════════════════════════════════════╝${NC}"
    echo ""
}

setup_env() {
    log_step "Step 4/5: Generating Secure Environment Configuration"

    local JWT_SECRET
    local ENCRYPTION_KEY
    local DB_PASSWORD

    JWT_SECRET=$(generate_secret)
    ENCRYPTION_KEY=$(generate_hex_key)
    DB_PASSWORD=$(generate_password)

    cat > "${INSTALL_DIR}/.env" << ENV_EOF
# SockPit Production Environment — Auto-generated on $(date -u +"%Y-%m-%d %H:%M:%S UTC")
# ────────────────────────────────────────────────────────────────────────────────
# WARNING: This file contains secrets. Do NOT commit to version control.
# ────────────────────────────────────────────────────────────────────────────────

# Server Core
PORT=3000
WS_PORT=3001
NODE_ENV=production

# PostgreSQL Database
POSTGRES_DB=sockpit
POSTGRES_USER=sockpit
POSTGRES_PASSWORD=${DB_PASSWORD}
DATABASE_URL=postgresql://sockpit:${DB_PASSWORD}@postgres:5432/sockpit?sslmode=disable

# Redis Cache
REDIS_URL=redis://redis:6379

# JWT Authentication
JWT_SECRET=${JWT_SECRET}
JWT_EXPIRES_IN=24h
JWT_REFRESH_EXPIRES_IN=7d

# SOCKS5 AES-256 Encryption Key (32-byte = 64 hex characters)
ENCRYPTION_KEY=${ENCRYPTION_KEY}

# Public URLs — these are used for agent installer script generation
DASHBOARD_URL=https://${DOMAIN}
AGENT_DOWNLOAD_BASE_URL=https://${DOMAIN}/downloads

# Dashboard Build-time Environment
NEXT_PUBLIC_API_URL=https://${DOMAIN}/api
NEXT_PUBLIC_WS_URL=wss://${DOMAIN}/ws
ENV_EOF

    chmod 600 "${INSTALL_DIR}/.env"

    log_success "Environment file created at ${INSTALL_DIR}/.env"
    log_info "JWT Secret: ${JWT_SECRET:0:8}... (truncated)"
    log_info "Encryption Key: ${ENCRYPTION_KEY:0:8}... (truncated)"
    log_info "DB Password: ${DB_PASSWORD:0:4}... (truncated)"
}

deploy_docker_stack() {
    log_step "Step 5/5: Building & Starting Docker Containers"

    cd "$INSTALL_DIR"

    # Create required directories
    mkdir -p "$DOWNLOADS_DIR"
    mkdir -p "$BACKUPS_DIR"

    log_info "Building Docker images (this may take a few minutes)..."
    docker compose -f "$COMPOSE_FILE" build --no-cache

    log_info "Starting containers..."
    docker compose -f "$COMPOSE_FILE" up -d

    # Wait for services to become healthy
    log_info "Waiting for services to become healthy..."

    local max_wait=60
    local waited=0

    while [[ $waited -lt $max_wait ]]; do
        local pg_healthy
        pg_healthy=$(docker compose -f "$COMPOSE_FILE" ps --format json 2>/dev/null | \
            grep -o '"Health":"healthy"' | wc -l) || pg_healthy=0

        if [[ $pg_healthy -ge 2 ]]; then
            log_success "All services are healthy"
            break
        fi

        sleep 5
        waited=$((waited + 5))
        log_info "Still waiting... (${waited}s / ${max_wait}s)"
    done

    if [[ $waited -ge $max_wait ]]; then
        log_warn "Timed out waiting for health checks. Checking container status..."
        docker compose -f "$COMPOSE_FILE" ps
    fi

    # Show container status
    echo ""
    docker compose -f "$COMPOSE_FILE" ps
    echo ""

    # Run database migrations and seed admin
    log_info "Running database migrations..."
    sleep 5
    docker compose -f "$COMPOSE_FILE" exec -T server npx node-pg-migrate up --migrations-dir migrations 2>&1 || {
        log_warn "Migration command returned a non-zero exit code. This may be okay if migrations were already applied."
    }

    log_info "Seeding default admin user..."
    docker compose -f "$COMPOSE_FILE" exec -T server node src/seeds/001_admin_user.js 2>&1 || {
        log_warn "Seed command returned a non-zero exit code. Admin user may already exist."
    }

    log_success "Database initialized"
}

print_summary() {
    local LOCAL_IP
    LOCAL_IP=$(get_local_ip)

    echo ""
    echo -e "${GREEN}${BOLD}"
    cat << 'DONE'
    ╔═══════════════════════════════════════════════════════════╗
    ║                                                           ║
    ║          ✅  INSTALLATION COMPLETE!                       ║
    ║                                                           ║
    ╚═══════════════════════════════════════════════════════════╝
DONE
    echo -e "${NC}"

    echo -e "  ${BOLD}Server IP:${NC}            ${GREEN}${LOCAL_IP}${NC}"
    echo ""
    echo -e "  ${BOLD}─── Exposed Ports ───${NC}"
    echo -e "  Dashboard:          ${CYAN}http://${LOCAL_IP}:3002${NC}"
    echo -e "  API Server:         ${CYAN}http://${LOCAL_IP}:3000${NC}"
    echo -e "  WebSocket Hub:      ${CYAN}http://${LOCAL_IP}:3001${NC}"
    echo ""
    echo -e "  ${BOLD}─── After Proxy Setup ───${NC}"
    echo -e "  Dashboard URL:      ${CYAN}https://${DOMAIN}${NC}"
    echo -e "  API Endpoint:       ${CYAN}https://${DOMAIN}/api${NC}"
    echo -e "  WebSocket Endpoint: ${CYAN}wss://${DOMAIN}/ws${NC}"
    echo -e "  Health Check:       ${CYAN}http://${LOCAL_IP}:3000/api/health${NC}"
    echo ""
    echo -e "  ${BOLD}─── Default Admin Credentials ───${NC}"
    echo -e "  Email:    admin@sockpit.local"
    echo -e "  Password: changeme123"
    echo ""
    echo -e "  ${RED}${BOLD}⚠  IMPORTANT: Change the default admin password immediately!${NC}"
    echo ""
    echo -e "  ${BOLD}─── Next Step ───${NC}"
    echo -e "  Point your domain ${CYAN}${DOMAIN}${NC} to ${GREEN}${LOCAL_IP}${NC}"
    echo -e "  in your reverse proxy manager (Pangolin, NPM, etc.)"
    echo -e "  and route /api/ → :3000, /ws/ → :3001, / → :3002"
    echo ""
    echo -e "  ${BOLD}─── Useful Commands ───${NC}"
    echo -e "  View logs:        ${CYAN}docker compose -f ${INSTALL_DIR}/${COMPOSE_FILE} logs -f${NC}"
    echo -e "  Restart stack:    ${CYAN}docker compose -f ${INSTALL_DIR}/${COMPOSE_FILE} restart${NC}"
    echo -e "  Stop stack:       ${CYAN}docker compose -f ${INSTALL_DIR}/${COMPOSE_FILE} down${NC}"
    echo -e "  Update:           ${CYAN}cd ${INSTALL_DIR} && git pull && docker compose -f ${COMPOSE_FILE} up -d --build${NC}"
    echo ""
    echo -e "  ${BOLD}─── File Locations ───${NC}"
    echo -e "  Install directory: ${INSTALL_DIR}"
    echo -e "  Environment file:  ${INSTALL_DIR}/.env"
    echo -e "  Downloads dir:     ${DOWNLOADS_DIR}"
    echo -e "  Backups dir:       ${BACKUPS_DIR}"
    echo ""
}

# ─── Main Execution ─────────────────────────────────────────────────────────────

main() {
    banner
    check_root
    check_os

    # Ensure we're running from the install directory
    if [[ ! -f "${INSTALL_DIR}/docker-compose.prod.yml" ]]; then
        # Check if we're being run from a cloned repo location
        SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
        if [[ -f "${SCRIPT_DIR}/docker-compose.prod.yml" ]]; then
            if [[ "$SCRIPT_DIR" != "$INSTALL_DIR" ]]; then
                log_info "Copying repository to ${INSTALL_DIR}..."
                mkdir -p "$INSTALL_DIR"
                cp -a "${SCRIPT_DIR}/." "$INSTALL_DIR/"
            fi
        else
            log_error "Cannot find docker-compose.prod.yml."
            log_error "Please clone the repo first: git clone https://github.com/rezwanahmedratul/sockpit.git ${INSTALL_DIR}"
            exit 1
        fi
    fi

    install_dependencies
    install_docker
    prompt_domain
    setup_env
    deploy_docker_stack
    print_summary
}

main "$@"
