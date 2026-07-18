# Linux Agent Design

## Overview

The Linux agent is the same Rust binary as the Windows agent (cross-compiled for Linux via GitHub Actions). It runs as a systemd service and is installed via a bash script.

## Architecture

Same internal architecture as the Windows agent, but with Linux-specific integrations:

```
┌─────────────────────────────────────────────────────┐
│                   Linux Machine                      │
│                                                      │
│  ┌───────────────────────────────────────────────┐  │
│  │         sockpit-agent (binary)                 │  │
│  │        (systemd service)                       │  │
│  │                                                │  │
│  │  ┌─────────────┐    ┌──────────────────────┐  │  │
│  │  │  Daemon      │    │   Config Manager     │  │  │
│  │  │  Manager     │    │   (config.json)      │  │  │
│  │  └─────────────┘    └──────────────────────┘  │  │
│  │                                                │  │
│  │  ┌────────────────────────────────────────┐   │  │
│  │  │  WebSocket Client + SOCKS5 + Metrics   │   │  │
│  │  └────────────────────────────────────────┘   │  │
│  └───────────────────────────────────────────────┘  │
│                                                      │
│  Installation Path: /opt/sockpit/                    │
│  Config File:       /etc/sockpit/config.json         │
│  Service File:      /etc/systemd/system/sockpit.service│
│  Log:               journalctl -u sockpit            │
└─────────────────────────────────────────────────────┘
```

## File System Layout

```
/opt/sockpit/
└── sockpit-agent               # The agent binary

/etc/sockpit/
└── config.json                 # Agent configuration

/etc/systemd/system/
└── sockpit.service             # Systemd unit file

Logs: journalctl -u sockpit -f
```

## Systemd Unit File

```ini
# /etc/systemd/system/sockpit.service
[Unit]
Description=SockPit SOCKS5 Proxy Agent
Documentation=https://github.com/your-org/sockpit
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
ExecStart=/opt/sockpit/sockpit-agent --config /etc/sockpit/config.json
Restart=always
RestartSec=5
User=sockpit
Group=sockpit
LimitNOFILE=65536

# Security hardening
NoNewPrivileges=yes
ProtectSystem=strict
ProtectHome=yes
ReadWritePaths=/etc/sockpit
PrivateTmp=yes

# Environment
Environment=LOG_LEVEL=info

[Install]
WantedBy=multi-user.target
```

## Installation Script Flow

The bash installer performs:

```bash
#!/bin/bash
# Step 1: Check for root privileges
# Step 2: Detect OS and architecture (amd64/arm64)
# Step 3: Create sockpit user (non-login)
# Step 4: Create directories (/opt/sockpit, /etc/sockpit)
# Step 5: Download agent binary from server
# Step 6: Set permissions (chmod 755)
# Step 7: Write config.json with embedded install token + server URL
# Step 8: Write systemd unit file
# Step 9: systemctl daemon-reload
# Step 10: systemctl enable sockpit
# Step 11: systemctl start sockpit
# Step 12: Verify agent connected (systemctl status + wait)
```

## Firewall Management (Linux)

The agent manages firewall rules using `iptables` or `firewalld`:

```rust
// src/firewall/linux.rs
use std::process::Command;

pub fn add_firewall_rule(port: u16) -> Result<(), Box<dyn std::error::Error>> {
    // Try firewalld first
    if has_firewalld() {
        Command::new("firewall-cmd")
            .args(["--permanent", "--add-port", &format!("{}/tcp", port)])
            .status()?;
        Command::new("firewall-cmd")
            .arg("--reload")
            .status()?;
        return Ok(());
    }

    // Fall back to iptables
    Command::new("iptables")
        .args(["-A", "INPUT", "-p", "tcp",
               "--dport", &port.to_string(),
               "-j", "ACCEPT",
               "-m", "comment", "--comment", "SockPit-SOCKS5"])
        .status()?;
    Ok(())
}
```

## Linux-Specific Metrics

```rust
// src/metrics/linux.rs
use sysinfo::{System, SystemExt, CpuExt};

pub fn collect_linux_metrics() -> SystemMetrics {
    let mut sys = System::new_all();
    sys.refresh_all();

    SystemMetrics {
        cpu_usage: sys.global_cpu_info().cpu_usage() as f64,
        memory_usage: (sys.used_memory() as f64 / sys.total_memory() as f64) * 100.0,
        bandwidth_in: 0,  // tracked by SOCKS5 engine
        bandwidth_out: 0, // tracked by SOCKS5 engine
        active_connections: 0,
    }
}
```

## Uninstallation

```bash
#!/bin/bash
sudo systemctl stop sockpit
sudo systemctl disable sockpit
sudo rm /etc/systemd/system/sockpit.service
sudo systemctl daemon-reload
sudo rm -rf /opt/sockpit
sudo rm -rf /etc/sockpit
sudo userdel sockpit
# Remove firewall rules
```
