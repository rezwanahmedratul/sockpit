#!/usr/bin/env bash
#
# SockPit — Automated Installation Script
# Deploys the SockPit stack with Docker, PostgreSQL & Redis
#
# Two modes:
#   1. Dedicated Proxy — Installs Nginx + Certbot, manages SSL/TLS for you
#   2. External Proxy  — Exposes raw ports, you point 3 subdomains from your own proxy
#
# Usage:
#   chmod +x install.sh
#   sudo ./install.sh
#

set -euo pipefail

# ─── Color Codes ────────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

# ─── Configuration ──────────────────────────────────────────────────────────────
INSTALL_DIR="/opt/sockpit"
COMPOSE_FILE="docker-compose.prod.yml"
DOWNLOADS_DIR="${INSTALL_DIR}/downloads"
BACKUPS_DIR="${INSTALL_DIR}/backups"
NGINX_CONF="/etc/nginx/sites-available/sockpit"
NGINX_LINK="/etc/nginx/sites-enabled/sockpit"

# These get set during prompts
PROXY_MODE=""        # "dedicated" or "external"
DOMAIN_DASHBOARD=""
DOMAIN_API=""
DOMAIN_WS=""

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
                log_warn "Detected Ubuntu $VERSION_ID. Tested on 22.04 and 24.04."
            else
                log_success "Detected Ubuntu $VERSION_ID"
            fi
            ;;
        debian)
            local major_version="${VERSION_ID%%.*}"
            if [[ "$major_version" -lt 12 ]]; then
                log_warn "Detected Debian $VERSION_ID. Tested on Debian 12+."
            else
                log_success "Detected Debian $VERSION_ID"
            fi
            ;;
        *)
            log_warn "Detected unsupported OS: $ID $VERSION_ID. Proceeding at your own risk."
            ;;
    esac
}

get_local_ip() {
    local ip=""
    ip=$(hostname -I | awk '{print $1}') || ip="unknown"
    echo "$ip"
}

get_public_ip() {
    local ip=""
    ip=$(curl -s --max-time 5 https://ifconfig.me 2>/dev/null) || \
    ip=$(curl -s --max-time 5 https://api.ipify.org 2>/dev/null) || \
    ip=$(curl -s --max-time 5 https://icanhazip.com 2>/dev/null) || \
    ip=$(hostname -I | awk '{print $1}')
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

strip_protocol() {
    local val="$1"
    val="${val#https://}"
    val="${val#http://}"
    val="${val%/}"
    echo "$val"
}

# ─── Installation Steps ─────────────────────────────────────────────────────────

install_dependencies() {
    log_step "Installing System Dependencies"

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
    log_step "Installing Docker"

    if command -v docker &>/dev/null; then
        log_success "Docker is already installed: $(docker --version)"
    else
        log_info "Installing Docker Engine..."
        curl -fsSL https://get.docker.com | sh
        log_success "Docker installed: $(docker --version)"
    fi

    systemctl enable docker
    systemctl start docker

    if docker compose version &>/dev/null; then
        log_success "Docker Compose v2 available: $(docker compose version --short)"
    else
        log_error "Docker Compose v2 is not available. Please install it manually."
        exit 1
    fi
}

install_nginx_certbot() {
    log_step "Installing Nginx & Certbot"

    if command -v nginx &>/dev/null; then
        log_success "Nginx is already installed"
    else
        log_info "Installing Nginx..."
        apt-get install -y -qq nginx
        log_success "Nginx installed"
    fi

    if command -v certbot &>/dev/null; then
        log_success "Certbot is already installed"
    else
        log_info "Installing Certbot..."
        apt-get install -y -qq certbot python3-certbot-nginx
        log_success "Certbot installed"
    fi

    systemctl enable nginx
}

# ─── Prompts ─────────────────────────────────────────────────────────────────────

prompt_proxy_mode() {
    log_step "Proxy Configuration"

    echo -e "${BOLD}How do you want to handle reverse proxy & SSL?${NC}"
    echo ""
    echo -e "  ${CYAN}1)${NC} ${BOLD}Dedicated proxy${NC} — Install Nginx + Certbot on this server."
    echo -e "     SockPit will manage its own reverse proxy and SSL/TLS certificates."
    echo ""
    echo -e "  ${CYAN}2)${NC} ${BOLD}External proxy (BYO)${NC} — I'll use my own proxy manager"
    echo -e "     (Pangolin, NPM, Traefik, Caddy, etc.)"
    echo -e "     SockPit will only expose raw ports for you to route."
    echo ""
    read -rp "  Select [1 or 2]: " proxy_choice

    case "$proxy_choice" in
        1)
            PROXY_MODE="dedicated"
            log_success "Mode: Dedicated proxy (Nginx + Certbot)"
            ;;
        2)
            PROXY_MODE="external"
            log_success "Mode: External proxy (BYO)"
            ;;
        *)
            log_error "Invalid selection. Please enter 1 or 2."
            exit 1
            ;;
    esac
}

prompt_domains() {
    log_step "Domain Configuration"

    echo -e "${BOLD}SockPit uses three separate subdomains — one for each service:${NC}"
    echo ""
    echo -e "  ${CYAN}Dashboard${NC}  — The web UI (e.g., ${BOLD}panel.yourdomain.com${NC})"
    echo -e "  ${CYAN}API${NC}        — REST API server (e.g., ${BOLD}api.yourdomain.com${NC})"
    echo -e "  ${CYAN}WebSocket${NC}  — Agent communication hub (e.g., ${BOLD}ws.yourdomain.com${NC})"
    echo ""

    # Dashboard domain
    read -rp "  Dashboard domain: " DOMAIN_DASHBOARD
    if [[ -z "$DOMAIN_DASHBOARD" ]]; then
        log_error "Dashboard domain cannot be empty."
        exit 1
    fi
    DOMAIN_DASHBOARD=$(strip_protocol "$DOMAIN_DASHBOARD")

    # API domain
    read -rp "  API domain: " DOMAIN_API
    if [[ -z "$DOMAIN_API" ]]; then
        log_error "API domain cannot be empty."
        exit 1
    fi
    DOMAIN_API=$(strip_protocol "$DOMAIN_API")

    # WebSocket domain
    read -rp "  WebSocket domain: " DOMAIN_WS
    if [[ -z "$DOMAIN_WS" ]]; then
        log_error "WebSocket domain cannot be empty."
        exit 1
    fi
    DOMAIN_WS=$(strip_protocol "$DOMAIN_WS")

    echo ""
    log_success "Dashboard: ${BOLD}${DOMAIN_DASHBOARD}${NC}"
    log_success "API:       ${BOLD}${DOMAIN_API}${NC}"
    log_success "WebSocket: ${BOLD}${DOMAIN_WS}${NC}"
}

# ─── Dedicated Proxy Mode ───────────────────────────────────────────────────────

wait_for_dns() {
    local PUBLIC_IP
    PUBLIC_IP=$(get_public_ip)

    echo ""
    echo -e "${YELLOW}${BOLD}╔══════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${YELLOW}${BOLD}║                    ACTION REQUIRED                           ║${NC}"
    echo -e "${YELLOW}${BOLD}╠══════════════════════════════════════════════════════════════╣${NC}"
    echo -e "${YELLOW}${BOLD}║${NC}                                                              ${YELLOW}${BOLD}║${NC}"
    echo -e "${YELLOW}${BOLD}║${NC}  Create A records pointing these domains to this server:      ${YELLOW}${BOLD}║${NC}"
    echo -e "${YELLOW}${BOLD}║${NC}                                                              ${YELLOW}${BOLD}║${NC}"
    echo -e "${YELLOW}${BOLD}║${NC}    Server IP: ${GREEN}${BOLD}${PUBLIC_IP}${NC}                             ${YELLOW}${BOLD}║${NC}"
    echo -e "${YELLOW}${BOLD}║${NC}                                                              ${YELLOW}${BOLD}║${NC}"
    echo -e "${YELLOW}${BOLD}║${NC}    ${CYAN}${DOMAIN_DASHBOARD}${NC}  →  ${GREEN}${PUBLIC_IP}${NC}               ${YELLOW}${BOLD}║${NC}"
    echo -e "${YELLOW}${BOLD}║${NC}    ${CYAN}${DOMAIN_API}${NC}  →  ${GREEN}${PUBLIC_IP}${NC}               ${YELLOW}${BOLD}║${NC}"
    echo -e "${YELLOW}${BOLD}║${NC}    ${CYAN}${DOMAIN_WS}${NC}  →  ${GREEN}${PUBLIC_IP}${NC}               ${YELLOW}${BOLD}║${NC}"
    echo -e "${YELLOW}${BOLD}║${NC}                                                              ${YELLOW}${BOLD}║${NC}"
    echo -e "${YELLOW}${BOLD}╚══════════════════════════════════════════════════════════════╝${NC}"
    echo ""

    echo -e "${BOLD}After creating the DNS records, press Enter to continue...${NC}"
    read -r

    log_info "Verifying DNS resolution..."

    local all_good=true
    for domain in "$DOMAIN_DASHBOARD" "$DOMAIN_API" "$DOMAIN_WS"; do
        local resolved_ip=""
        resolved_ip=$(dig +short "$domain" A 2>/dev/null | head -n1) || true

        if [[ "$resolved_ip" == "$PUBLIC_IP" ]]; then
            log_success "${domain} → ${resolved_ip} ✓"
        else
            log_warn "${domain} → ${resolved_ip:-none} (expected ${PUBLIC_IP})"
            all_good=false
        fi
    done

    if [[ "$all_good" != "true" ]]; then
        log_warn "Some domains are not resolving correctly yet."
        echo -e "${YELLOW}Continue anyway? (y/N):${NC}"
        read -rp "  " continue_anyway
        if [[ "${continue_anyway,,}" != "y" && "${continue_anyway,,}" != "yes" ]]; then
            log_error "Aborting. Configure DNS and run the script again."
            exit 1
        fi
        log_warn "Continuing — SSL may fail if DNS is not ready."
    fi
}

setup_ssl() {
    log_step "Obtaining SSL Certificates"

    systemctl stop nginx 2>/dev/null || true

    echo ""
    echo -e "${BOLD}Enter your email address${NC} (for Let's Encrypt SSL certificate notifications):"
    read -rp "  Email: " CERT_EMAIL

    if [[ -z "$CERT_EMAIL" ]]; then
        log_error "Email cannot be empty."
        exit 1
    fi

    log_info "Requesting SSL certificates for all 3 domains..."

    if certbot certonly \
        --standalone \
        --non-interactive \
        --agree-tos \
        --email "$CERT_EMAIL" \
        -d "$DOMAIN_DASHBOARD" \
        -d "$DOMAIN_API" \
        -d "$DOMAIN_WS"; then
        log_success "SSL certificates obtained"
    else
        log_error "Failed to obtain SSL certificates."
        log_error "Make sure all domains point to this server and port 80 is open."
        exit 1
    fi
}

configure_nginx() {
    log_step "Configuring Nginx Reverse Proxy"

    mkdir -p "$DOWNLOADS_DIR"

    # Determine the cert domain (certbot groups them under the first domain)
    local CERT_DOMAIN="$DOMAIN_DASHBOARD"

    cat > "$NGINX_CONF" << NGINX_EOF
# SockPit — Nginx Reverse Proxy Configuration
# Auto-generated by install.sh on $(date -u +"%Y-%m-%d %H:%M:%S UTC")

# ─── HTTP → HTTPS redirect (all domains) ───
server {
    listen 80;
    listen [::]:80;
    server_name ${DOMAIN_DASHBOARD} ${DOMAIN_API} ${DOMAIN_WS};

    location /.well-known/acme-challenge/ {
        root /var/www/html;
    }

    location / {
        return 301 https://\$host\$request_uri;
    }
}

# ─── Dashboard (${DOMAIN_DASHBOARD}) ───
server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name ${DOMAIN_DASHBOARD};

    ssl_certificate /etc/letsencrypt/live/${CERT_DOMAIN}/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/${CERT_DOMAIN}/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384;
    ssl_prefer_server_ciphers off;
    ssl_session_cache shared:SSL:10m;

    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;

    client_max_body_size 50M;

    location / {
        proxy_pass http://127.0.0.1:3002;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_buffering off;
    }
}

# ─── API Server (${DOMAIN_API}) ───
server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name ${DOMAIN_API};

    ssl_certificate /etc/letsencrypt/live/${CERT_DOMAIN}/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/${CERT_DOMAIN}/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384;
    ssl_prefer_server_ciphers off;
    ssl_session_cache shared:SSL:10m;

    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;

    client_max_body_size 50M;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_buffering off;
    }

    # Agent binary downloads (static files)
    location /downloads/ {
        alias ${DOWNLOADS_DIR}/;
        autoindex off;
        expires 1h;
        add_header Cache-Control "public, immutable";
    }
}

# ─── WebSocket Hub (${DOMAIN_WS}) ───
server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name ${DOMAIN_WS};

    ssl_certificate /etc/letsencrypt/live/${CERT_DOMAIN}/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/${CERT_DOMAIN}/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384;
    ssl_prefer_server_ciphers off;
    ssl_session_cache shared:SSL:10m;

    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 86400s;
        proxy_send_timeout 86400s;
    }
}
NGINX_EOF

    ln -sf "$NGINX_CONF" "$NGINX_LINK"
    rm -f /etc/nginx/sites-enabled/default

    nginx -t
    systemctl start nginx
    systemctl reload nginx

    log_success "Nginx configured with 3 virtual hosts"
}

setup_certbot_renewal() {
    log_info "Setting up SSL certificate auto-renewal..."

    mkdir -p /etc/letsencrypt/renewal-hooks/deploy

    cat > /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh << 'HOOK_EOF'
#!/bin/bash
systemctl reload nginx
HOOK_EOF

    chmod +x /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh
    systemctl enable certbot.timer 2>/dev/null || true
    systemctl start certbot.timer 2>/dev/null || true

    log_success "Certbot auto-renewal configured"
}

# ─── External Proxy Mode ────────────────────────────────────────────────────────

show_external_proxy_info() {
    local LOCAL_IP
    LOCAL_IP=$(get_local_ip)

    echo ""
    echo -e "${YELLOW}${BOLD}╔══════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${YELLOW}${BOLD}║                 REVERSE PROXY CONFIGURATION                  ║${NC}"
    echo -e "${YELLOW}${BOLD}╠══════════════════════════════════════════════════════════════╣${NC}"
    echo -e "${YELLOW}${BOLD}║${NC}                                                              ${YELLOW}${BOLD}║${NC}"
    echo -e "${YELLOW}${BOLD}║${NC}  Point these subdomains to this server in your proxy:         ${YELLOW}${BOLD}║${NC}"
    echo -e "${YELLOW}${BOLD}║${NC}                                                              ${YELLOW}${BOLD}║${NC}"
    echo -e "${YELLOW}${BOLD}║${NC}    Server IP: ${GREEN}${BOLD}${LOCAL_IP}${NC}                             ${YELLOW}${BOLD}║${NC}"
    echo -e "${YELLOW}${BOLD}║${NC}                                                              ${YELLOW}${BOLD}║${NC}"
    echo -e "${YELLOW}${BOLD}║${NC}    ${CYAN}${DOMAIN_DASHBOARD}${NC}  →  http://${LOCAL_IP}:${BOLD}3002${NC}  (Dashboard)    ${YELLOW}${BOLD}║${NC}"
    echo -e "${YELLOW}${BOLD}║${NC}    ${CYAN}${DOMAIN_API}${NC}  →  http://${LOCAL_IP}:${BOLD}3000${NC}  (API)           ${YELLOW}${BOLD}║${NC}"
    echo -e "${YELLOW}${BOLD}║${NC}    ${CYAN}${DOMAIN_WS}${NC}  →  http://${LOCAL_IP}:${BOLD}3001${NC}  (WebSocket)     ${YELLOW}${BOLD}║${NC}"
    echo -e "${YELLOW}${BOLD}║${NC}                                                              ${YELLOW}${BOLD}║${NC}"
    echo -e "${YELLOW}${BOLD}║${NC}  ⚠ WebSocket target MUST forward Upgrade headers!            ${YELLOW}${BOLD}║${NC}"
    echo -e "${YELLOW}${BOLD}║${NC}  ⚠ Set WebSocket read timeout to 86400s (24h)                ${YELLOW}${BOLD}║${NC}"
    echo -e "${YELLOW}${BOLD}║${NC}                                                              ${YELLOW}${BOLD}║${NC}"
    echo -e "${YELLOW}${BOLD}╚══════════════════════════════════════════════════════════════╝${NC}"
    echo ""
}

# ─── Shared Steps ────────────────────────────────────────────────────────────────

setup_env() {
    log_step "Generating Secure Environment Configuration"

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

# Public URLs (separate subdomains per service)
DASHBOARD_URL=https://${DOMAIN_DASHBOARD}
AGENT_DOWNLOAD_BASE_URL=https://${DOMAIN_API}/downloads

# Dashboard Build-time Environment
NEXT_PUBLIC_API_URL=https://${DOMAIN_API}
NEXT_PUBLIC_WS_URL=wss://${DOMAIN_WS}
ENV_EOF

    chmod 600 "${INSTALL_DIR}/.env"

    log_success "Environment file created at ${INSTALL_DIR}/.env"
    log_info "JWT Secret: ${JWT_SECRET:0:8}... (truncated)"
    log_info "Encryption Key: ${ENCRYPTION_KEY:0:8}... (truncated)"
    log_info "DB Password: ${DB_PASSWORD:0:4}... (truncated)"
}

deploy_docker_stack() {
    log_step "Building & Starting Docker Containers"

    cd "$INSTALL_DIR"

    mkdir -p "$DOWNLOADS_DIR"
    mkdir -p "$BACKUPS_DIR"

    log_info "Building Docker images (this may take a few minutes)..."
    docker compose -f "$COMPOSE_FILE" build --no-cache

    log_info "Starting containers..."
    docker compose -f "$COMPOSE_FILE" up -d

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
        log_warn "Timed out waiting for health checks."
        docker compose -f "$COMPOSE_FILE" ps
    fi

    echo ""
    docker compose -f "$COMPOSE_FILE" ps
    echo ""

    # Database initialization
    sleep 5

    log_info "Running database migrations..."
    docker compose -f "$COMPOSE_FILE" exec -T server npx node-pg-migrate up --migrations-dir migrations 2>&1 || {
        log_warn "Migrations may already be applied."
    }

    log_info "Seeding default admin user..."
    docker compose -f "$COMPOSE_FILE" exec -T server node src/seeds/001_admin_user.js 2>&1 || {
        log_warn "Admin user may already exist."
    }

    log_success "Docker stack deployed and database initialized"
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
    echo -e "  ${BOLD}Proxy Mode:${NC}           ${CYAN}${PROXY_MODE}${NC}"
    echo ""
    echo -e "  ${BOLD}─── Service URLs ───${NC}"
    echo -e "  Dashboard:          ${CYAN}https://${DOMAIN_DASHBOARD}${NC}"
    echo -e "  API Server:         ${CYAN}https://${DOMAIN_API}${NC}"
    echo -e "  WebSocket Hub:      ${CYAN}wss://${DOMAIN_WS}${NC}"
    echo ""
    echo -e "  ${BOLD}─── Raw Ports (internal) ───${NC}"
    echo -e "  Dashboard:          http://${LOCAL_IP}:3002"
    echo -e "  API Server:         http://${LOCAL_IP}:3000"
    echo -e "  WebSocket Hub:      http://${LOCAL_IP}:3001"
    echo ""
    echo -e "  ${BOLD}─── Default Admin Credentials ───${NC}"
    echo -e "  Email:    admin@sockpit.local"
    echo -e "  Password: changeme123"
    echo ""
    echo -e "  ${RED}${BOLD}⚠  IMPORTANT: Change the default admin password immediately!${NC}"
    echo ""

    if [[ "$PROXY_MODE" == "external" ]]; then
        echo -e "  ${BOLD}─── Next Step ───${NC}"
        echo -e "  Configure your reverse proxy to route the three subdomains"
        echo -e "  to the ports shown above. Enable WebSocket support for ${CYAN}${DOMAIN_WS}${NC}."
        echo ""
    fi

    echo -e "  ${BOLD}─── Useful Commands ───${NC}"
    echo -e "  View logs:        ${CYAN}docker compose -f ${INSTALL_DIR}/${COMPOSE_FILE} logs -f${NC}"
    echo -e "  Restart stack:    ${CYAN}docker compose -f ${INSTALL_DIR}/${COMPOSE_FILE} restart${NC}"
    echo -e "  Stop stack:       ${CYAN}docker compose -f ${INSTALL_DIR}/${COMPOSE_FILE} down${NC}"
    echo -e "  Update:           ${CYAN}cd ${INSTALL_DIR} && git pull && docker compose -f ${COMPOSE_FILE} up -d --build${NC}"
    echo ""
    echo -e "  ${BOLD}─── File Locations ───${NC}"
    echo -e "  Install directory: ${INSTALL_DIR}"
    echo -e "  Environment file:  ${INSTALL_DIR}/.env"
    if [[ "$PROXY_MODE" == "dedicated" ]]; then
        echo -e "  Nginx config:      ${NGINX_CONF}"
        echo -e "  SSL certificates:  /etc/letsencrypt/live/${DOMAIN_DASHBOARD}/"
    fi
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
        SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
        if [[ -f "${SCRIPT_DIR}/docker-compose.prod.yml" ]]; then
            if [[ "$SCRIPT_DIR" != "$INSTALL_DIR" ]]; then
                log_info "Copying repository to ${INSTALL_DIR}..."
                mkdir -p "$INSTALL_DIR"
                cp -a "${SCRIPT_DIR}/." "$INSTALL_DIR/"
            fi
        else
            log_error "Cannot find docker-compose.prod.yml."
            log_error "Clone the repo first: git clone https://github.com/rezwanahmedratul/sockpit.git ${INSTALL_DIR}"
            exit 1
        fi
    fi

    # Step 1: Common deps + Docker
    install_dependencies
    install_docker

    # Step 2: Choose proxy mode
    prompt_proxy_mode

    # Step 3: Get domain names
    prompt_domains

    # Step 4: Mode-specific setup
    if [[ "$PROXY_MODE" == "dedicated" ]]; then
        install_nginx_certbot
        wait_for_dns
        setup_ssl
        configure_nginx
        setup_certbot_renewal
    else
        show_external_proxy_info
    fi

    # Step 5: Env + Deploy
    setup_env
    deploy_docker_stack
    print_summary
}

main "$@"
