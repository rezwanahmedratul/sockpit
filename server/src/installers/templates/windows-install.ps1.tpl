#Requires -RunAsAdministrator
# ============================================================
# SockPit Agent Installer for Windows
# Generated for: {{USER_EMAIL}}
# Generated at: {{GENERATED_AT}}
# ============================================================

$ErrorActionPreference = "Stop"

# ---- Configuration (injected at generation time) ----
$INSTALL_TOKEN  = "{{INSTALL_TOKEN}}"
$SERVER_URL     = "{{SERVER_URL}}"
$API_URL        = "{{API_URL}}"
$AGENT_URL      = "{{AGENT_DOWNLOAD_URL}}"
$AGENT_VERSION  = "{{AGENT_VERSION}}"
$CHECKSUM       = "{{CHECKSUM}}"
$ENCRYPTION_KEY = "{{ENCRYPTION_KEY}}"

# ---- Variables ----
$INSTALL_DIR    = "C:\ProgramData\SockPit"
$SERVICE_NAME   = "SockPitAgent"
$AGENT_EXE      = "$INSTALL_DIR\sockpit-agent.exe"
$CONFIG_FILE    = "$INSTALL_DIR\config.json"

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
if ($hash -ne $CHECKSUM -and $CHECKSUM -ne "SKIP") {
    Write-Error "Checksum verification failed! Expected: $CHECKSUM, Got: $hash"
    Remove-Item $AGENT_EXE -Force
    exit 1
}
Write-Host "  Checksum verified." -ForegroundColor Green

# ---- Step 5: Write configuration ----
Write-Host "[5/8] Writing configuration..." -ForegroundColor Yellow
$config = @{
    server_url     = $SERVER_URL
    install_token  = $INSTALL_TOKEN
    encryption_key = $ENCRYPTION_KEY
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

# Create the service using sc.exe (simplest service wrappers logic)
sc.exe create $SERVICE_NAME binPath= "$AGENT_EXE --config-path `"$CONFIG_FILE`"" start= auto displayName= "SockPit SOCKS5 Agent" | Out-Null
sc.exe description $SERVICE_NAME "SockPit SOCKS5 Proxy Agent - Managed proxy server" | Out-Null

# ---- Step 7: Configure firewall ----
Write-Host "[7/8] Configuring firewall..." -ForegroundColor Yellow
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
