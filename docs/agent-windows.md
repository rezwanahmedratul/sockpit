# Windows Agent Design

## Overview

The Windows agent is a Rust binary compiled as a `.exe` (built via GitHub Actions CI/CD) that:
1. Runs as a Windows Service (auto-start on boot)
2. Maintains a persistent WebSocket connection to the SockPit server
3. Runs one or more SOCKS5 proxy listeners
4. Reports system metrics periodically

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                 Windows Machine                      │
│                                                      │
│  ┌───────────────────────────────────────────────┐  │
│  │           sockpit-agent.exe                    │  │
│  │         (Windows Service)                      │  │
│  │                                                │  │
│  │  ┌─────────────┐    ┌──────────────────────┐  │  │
│  │  │  Service     │    │   Config Manager     │  │  │
│  │  │  Manager     │    │   (config.json)      │  │  │
│  │  └─────────────┘    └──────────────────────┘  │  │
│  │                                                │  │
│  │  ┌─────────────────────────────────────────┐  │  │
│  │  │          WebSocket Client               │  │  │
│  │  │  - Connect to wss://server:3001         │  │  │
│  │  │  - Auto-reconnect with backoff          │  │  │
│  │  │  - Process commands from server         │  │  │
│  │  └─────────────────────────────────────────┘  │  │
│  │                                                │  │
│  │  ┌─────────────────────────────────────────┐  │  │
│  │  │          SOCKS5 Engine                  │  │  │
│  │  │  - Multi-port listeners                 │  │  │
│  │  │  - Auth + connection limiting           │  │  │
│  │  └─────────────────────────────────────────┘  │  │
│  │                                                │  │
│  │  ┌─────────────────────────────────────────┐  │  │
│  │  │          Metrics Collector              │  │  │
│  │  │  - CPU, RAM, bandwidth                  │  │  │
│  │  └─────────────────────────────────────────┘  │  │
│  └───────────────────────────────────────────────┘  │
│                                                      │
│  Installation Path: C:\ProgramData\SockPit\          │
│  Config File:       C:\ProgramData\SockPit\config.json│
│  Log File:          C:\ProgramData\SockPit\agent.log  │
│  Service Name:      SockPitAgent                      │
└─────────────────────────────────────────────────────┘
```

## File System Layout

```
C:\ProgramData\SockPit\
├── sockpit-agent.exe       # The agent binary
├── config.json             # Agent configuration
└── logs/
    └── agent.log           # Rolling log file
```

### config.json

```json
{
  "server_url": "wss://your-sockpit-server.com:3001",
  "agent_token": "128-char-hex-token",
  "server_id": "server-uuid",
  "heartbeat_interval": 30,
  "metrics_interval": 60,
  "log_level": "info",
  "log_max_size_mb": 50,
  "log_max_backups": 3
}
```

## Windows Service Integration

```rust
// src/service/windows.rs
use windows_service::{
    service::{ServiceControl, ServiceControlAccept, ServiceExitCode, ServiceState, ServiceStatus, ServiceType},
    service_control_handler::{self, ServiceControlHandlerResult},
    service_dispatcher,
};

fn run_service() -> Result<(), Box<dyn std::error::Error>> {
    let event_handler = move |control_event| -> ServiceControlHandlerResult {
        match control_event {
            ServiceControl::Stop | ServiceControl::Shutdown => {
                // Signal the agent to shut down gracefully
                agent::shutdown();
                ServiceControlHandlerResult::NoError
            }
            _ => ServiceControlHandlerResult::NotImplemented,
        }
    };

    let status_handle = service_control_handler::register("SockPitAgent", event_handler)?;

    status_handle.set_service_status(ServiceStatus {
        service_type: ServiceType::OWN_PROCESS,
        current_state: ServiceState::Running,
        controls_accepted: ServiceControlAccept::STOP | ServiceControlAccept::SHUTDOWN,
        exit_code: ServiceExitCode::Win32(0),
        ..Default::default()
    })?;

    // Start the agent (blocks until shutdown signal)
    agent::run();

    status_handle.set_service_status(ServiceStatus {
        current_state: ServiceState::Stopped,
        ..Default::default()
    })?;

    Ok(())
}
```

## Installation Process

The PowerShell installer script performs these steps:

```
Step 1: Check for admin/elevated privileges
Step 2: Create installation directory (C:\ProgramData\SockPit\)
Step 3: Download agent binary from server
Step 4: Write config.json with embedded install token + server URL
Step 5: Register Windows Service (sc.exe create)
Step 6: Configure service for auto-start
Step 7: Add Windows Firewall rules for SOCKS5 ports
Step 8: Start the service
Step 9: Verify agent connected (wait and check)
```

## Firewall Management

The agent dynamically manages Windows Firewall rules:

```rust
// src/firewall/windows.rs
use std::process::Command;

/// Add a Windows Firewall inbound rule for a SOCKS5 port
pub fn add_firewall_rule(port: u16) -> Result<(), Box<dyn std::error::Error>> {
    Command::new("netsh")
        .args([
            "advfirewall", "firewall", "add", "rule",
            &format!("name=SockPit-SOCKS5-{}", port),
            "dir=in", "action=allow", "protocol=TCP",
            &format!("localport={}", port),
        ])
        .status()?;
    Ok(())
}

/// Remove a Windows Firewall rule for a SOCKS5 port
pub fn remove_firewall_rule(port: u16) -> Result<(), Box<dyn std::error::Error>> {
    Command::new("netsh")
        .args([
            "advfirewall", "firewall", "delete", "rule",
            &format!("name=SockPit-SOCKS5-{}", port),
        ])
        .status()?;
    Ok(())
}
```

## Metrics Collection (Windows)

```rust
// src/metrics/windows.rs
use sysinfo::{System, SystemExt, CpuExt};

pub struct SystemMetrics {
    pub cpu_usage: f64,
    pub memory_usage: f64,
    pub bandwidth_in: i64,
    pub bandwidth_out: i64,
    pub active_connections: u32,
}

pub fn collect() -> SystemMetrics {
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

A separate uninstall command is also embedded in the agent:

```
sockpit-agent.exe --uninstall
```

Steps:
1. Stop the Windows Service
2. Remove the Windows Service
3. Remove firewall rules
4. Delete installation directory
5. Clean up registry entries
