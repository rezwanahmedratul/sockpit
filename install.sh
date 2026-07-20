#!/usr/bin/env bash
#
# SockPit — Automated Linux VPS Installation Script
# Deploys the full SockPit stack with SSL, Nginx, Docker, PostgreSQL & Redis
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
NGINX_CONF="/etc/nginx/sites-available/sockpit"
NGINX_LINK="/etc/nginx/sites-enabled/sockpit"

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

get_public_ip() {
    local ip=""
    # Try multiple services for reliability
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

# ─── Main Installation Steps ────────────────────────────────────────────────────

install_dependencies() {
    log_step "Step 1/9: Installing System Dependencies"

    log_info "Updating system packages..."
    apt-get update -qq
    apt-get upgrade -y -qq

    log_info "Installing base dependencies..."
    apt-get install -y -qq \
        ca-certificates \
        curl \
        gnupg \
        git \
        ufw \
        openssl \
        jq \
        lsb-release \
        apt-transport-https \
        software-properties-common

    log_success "Base dependencies installed"
}

install_docker() {
    log_step "Step 2/9: Installing Docker"

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

install_nginx() {
    log_step "Step 3/9: Installing Nginx & Certbot"

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

prompt_domain() {
    log_step "Step 4/9: Domain Configuration"

    echo -e "${BOLD}Enter your domain name${NC} (e.g., panel.yourdomain.com or sockpit.example.com):"
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

    echo ""
    echo -e "${BOLD}Enter your email address${NC} (for Let's Encrypt SSL certificate notifications):"
    echo ""
    read -rp "  Email: " CERT_EMAIL

    if [[ -z "$CERT_EMAIL" ]]; then
        log_error "Email cannot be empty."
        exit 1
    fi

    log_success "Email set to: ${CERT_EMAIL}"
}

wait_for_dns() {
    local PUBLIC_IP
    PUBLIC_IP=$(get_public_ip)

    echo ""
    echo -e "${YELLOW}${BOLD}╔══════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${YELLOW}${BOLD}║                    ACTION REQUIRED                           ║${NC}"
    echo -e "${YELLOW}${BOLD}╠══════════════════════════════════════════════════════════════╣${NC}"
    echo -e "${YELLOW}${BOLD}║${NC}                                                              ${YELLOW}${BOLD}║${NC}"
    echo -e "${YELLOW}${BOLD}║${NC}  Point your domain to this server's IP address:              ${YELLOW}${BOLD}║${NC}"
    echo -e "${YELLOW}${BOLD}║${NC}                                                              ${YELLOW}${BOLD}║${NC}"
    echo -e "${YELLOW}${BOLD}║${NC}    Domain:    ${CYAN}${BOLD}${DOMAIN}${NC}                    ${YELLOW}${BOLD}║${NC}"
    echo -e "${YELLOW}${BOLD}║${NC}    Server IP: ${GREEN}${BOLD}${PUBLIC_IP}${NC}                             ${YELLOW}${BOLD}║${NC}"
    echo -e "${YELLOW}${BOLD}║${NC}                                                              ${YELLOW}${BOLD}║${NC}"
    echo -e "${YELLOW}${BOLD}║${NC}  Go to your DNS provider and create an A record:             ${YELLOW}${BOLD}║${NC}"
    echo -e "${YELLOW}${BOLD}║${NC}                                                              ${YELLOW}${BOLD}║${NC}"
    echo -e "${YELLOW}${BOLD}║${NC}    Type: ${BOLD}A${NC}                                                    ${YELLOW}${BOLD}║${NC}"
    echo -e "${YELLOW}${BOLD}║${NC}    Name: ${BOLD}${DOMAIN}${NC} (or @ for root)               ${YELLOW}${BOLD}║${NC}"
    echo -e "${YELLOW}${BOLD}║${NC}    Value: ${BOLD}${PUBLIC_IP}${NC}                                        ${YELLOW}${BOLD}║${NC}"
    echo -e "${YELLOW}${BOLD}║${NC}    TTL: ${BOLD}300${NC} (5 minutes)                                      ${YELLOW}${BOLD}║${NC}"
    echo -e "${YELLOW}${BOLD}║${NC}                                                              ${YELLOW}${BOLD}║${NC}"
    echo -e "${YELLOW}${BOLD}╚══════════════════════════════════════════════════════════════╝${NC}"
    echo ""

    # Wait for the user to configure DNS
    echo -e "${BOLD}After creating the DNS record, press Enter to continue...${NC}"
    read -r

    # Verify DNS resolution
    log_info "Verifying DNS resolution for ${DOMAIN}..."

    local max_retries=12
    local retry=0
    local resolved_ip=""

    while [[ $retry -lt $max_retries ]]; do
        resolved_ip=$(dig +short "$DOMAIN" A 2>/dev/null | head -n1) || true

        if [[ "$resolved_ip" == "$PUBLIC_IP" ]]; then
            log_success "DNS is correctly pointing to this server (${resolved_ip})"
            return 0
        fi

        retry=$((retry + 1))

        if [[ $retry -lt $max_retries ]]; then
            log_warn "DNS not yet resolved (got: '${resolved_ip:-none}', expected: '${PUBLIC_IP}'). Retrying in 10s... (${retry}/${max_retries})"
            sleep 10
        fi
    done

    log_warn "DNS verification timed out. The domain may not be pointing to this server yet."
    echo -e "${YELLOW}Do you want to continue anyway? (y/N):${NC}"
    read -rp "  " continue_anyway

    if [[ "${continue_anyway,,}" != "y" && "${continue_anyway,,}" != "yes" ]]; then
        log_error "Aborting. Please configure DNS and run the script again."
        exit 1
    fi

    log_warn "Continuing without DNS verification. SSL certificate may fail if DNS is not ready."
}

setup_ssl() {
    log_step "Step 5/9: Obtaining SSL Certificate"

    # Stop nginx temporarily so certbot can bind to port 80
    systemctl stop nginx 2>/dev/null || true

    log_info "Requesting SSL certificate from Let's Encrypt..."

    if certbot certonly \
        --standalone \
        --non-interactive \
        --agree-tos \
        --email "$CERT_EMAIL" \
        -d "$DOMAIN"; then
        log_success "SSL certificate obtained for ${DOMAIN}"
    else
        log_error "Failed to obtain SSL certificate."
        log_error "Make sure the domain points to this server and port 80 is open."
        exit 1
    fi
}

configure_nginx() {
    log_step "Step 6/9: Configuring Nginx Reverse Proxy"

    # Create downloads directory
    mkdir -p "$DOWNLOADS_DIR"

    # Write Nginx config
    cat > "$NGINX_CONF" << NGINX_EOF
# SockPit — Nginx Reverse Proxy Configuration
# Auto-generated by install.sh on $(date -u +"%Y-%m-%d %H:%M:%S UTC")

# HTTP → HTTPS redirect
server {
    listen 80;
    listen [::]:80;
    server_name ${DOMAIN};

    # Allow Let's Encrypt ACME challenges
    location /.well-known/acme-challenge/ {
        root /var/www/html;
    }

    location / {
        return 301 https://\$host\$request_uri;
    }
}

# HTTPS server
server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name ${DOMAIN};

    # SSL Configuration
    ssl_certificate /etc/letsencrypt/live/${DOMAIN}/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/${DOMAIN}/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384;
    ssl_prefer_server_ciphers off;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 10m;
    ssl_session_tickets off;

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;

    # Client body size (for file uploads if needed)
    client_max_body_size 50M;

    # Dashboard (Next.js)
    location / {
        proxy_pass http://127.0.0.1:3002;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_buffering off;
    }

    # API Server
    location /api/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_buffering off;
    }

    # WebSocket endpoint for agents
    location /ws/ {
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

    # Agent binary downloads (static files)
    location /downloads/ {
        alias ${DOWNLOADS_DIR}/;
        autoindex off;
        expires 1h;
        add_header Cache-Control "public, immutable";
    }
}
NGINX_EOF

    # Enable the site
    ln -sf "$NGINX_CONF" "$NGINX_LINK"
    rm -f /etc/nginx/sites-enabled/default

    # Test and start Nginx
    nginx -t
    systemctl start nginx
    systemctl reload nginx

    log_success "Nginx configured and running"
}

setup_env() {
    log_step "Step 7/9: Generating Secure Environment Configuration"

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

# Public URLs
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
    log_step "Step 8/9: Building & Starting Docker Containers"

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
}

initialize_database() {
    log_step "Step 9/9: Initializing Database"

    cd "$INSTALL_DIR"

    # Wait a bit for the server to fully start
    sleep 5

    log_info "Running database migrations..."
    docker compose -f "$COMPOSE_FILE" exec -T server npx node-pg-migrate up --migrations-dir migrations 2>&1 || {
        log_warn "Migration command returned a non-zero exit code. This may be okay if migrations were already applied."
    }

    log_info "Seeding default admin user..."
    docker compose -f "$COMPOSE_FILE" exec -T server node src/seeds/001_admin_user.js 2>&1 || {
        log_warn "Seed command returned a non-zero exit code. Admin user may already exist."
    }

    log_success "Database initialized"
}

configure_firewall() {
    log_info "Configuring UFW firewall..."

    ufw default deny incoming 2>/dev/null || true
    ufw default allow outgoing 2>/dev/null || true
    ufw allow 22/tcp 2>/dev/null || true    # SSH
    ufw allow 80/tcp 2>/dev/null || true    # HTTP
    ufw allow 443/tcp 2>/dev/null || true   # HTTPS

    # Enable firewall non-interactively
    ufw --force enable 2>/dev/null || true

    log_success "Firewall configured (SSH, HTTP, HTTPS allowed)"
}

setup_certbot_renewal() {
    log_info "Setting up SSL certificate auto-renewal..."

    # Create a renewal hook to reload nginx
    mkdir -p /etc/letsencrypt/renewal-hooks/deploy

    cat > /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh << 'HOOK_EOF'
#!/bin/bash
systemctl reload nginx
HOOK_EOF

    chmod +x /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh

    # Verify the certbot timer is active
    systemctl enable certbot.timer 2>/dev/null || true
    systemctl start certbot.timer 2>/dev/null || true

    log_success "Certbot auto-renewal configured"
}

print_summary() {
    local PUBLIC_IP
    PUBLIC_IP=$(get_public_ip)

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

    echo -e "  ${BOLD}Dashboard URL:${NC}        ${CYAN}https://${DOMAIN}${NC}"
    echo -e "  ${BOLD}API Endpoint:${NC}         ${CYAN}https://${DOMAIN}/api${NC}"
    echo -e "  ${BOLD}WebSocket Endpoint:${NC}   ${CYAN}wss://${DOMAIN}/ws${NC}"
    echo -e "  ${BOLD}Health Check:${NC}         ${CYAN}https://${DOMAIN}/api/health${NC}"
    echo -e "  ${BOLD}Server IP:${NC}            ${GREEN}${PUBLIC_IP}${NC}"
    echo ""
    echo -e "  ${BOLD}─── Default Admin Credentials ───${NC}"
    echo -e "  ${BOLD}Email:${NC}    admin@sockpit.local"
    echo -e "  ${BOLD}Password:${NC} changeme123"
    echo ""
    echo -e "  ${RED}${BOLD}⚠  IMPORTANT: Change the default admin password immediately!${NC}"
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
    echo -e "  Nginx config:      ${NGINX_CONF}"
    echo -e "  SSL certificates:  /etc/letsencrypt/live/${DOMAIN}/"
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
    install_nginx
    prompt_domain
    wait_for_dns
    setup_ssl
    configure_nginx
    setup_env
    deploy_docker_stack
    initialize_database
    configure_firewall
    setup_certbot_renewal
    print_summary
}

main "$@"
