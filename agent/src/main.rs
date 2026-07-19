use clap::Parser;
use std::sync::atomic::AtomicI64;
use std::sync::Arc;
use tracing::{error, info, warn, Level};
use tracing_subscriber::FmtSubscriber;

mod config;
mod crypto;
mod socks5;
mod websocket;

use config::ConfigStore;
use socks5::server::Socks5Server;
use websocket::WebSocketClient;

#[derive(Parser, Debug)]
#[command(author, version, about, long_about = None)]
struct Args {
    /// Dashboard WebSocket Server URL (e.g. ws://localhost:3000)
    #[arg(long, default_value = "ws://localhost:3000")]
    server_url: String,

    /// Installation Token (only needed for initial registration setup)
    #[arg(long)]
    install_token: Option<String>,

    /// Cryptographic AES decryption key hex (64 hex characters)
    #[arg(long, default_value = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef")]
    encryption_key: String,

    /// Path to config storage file
    #[arg(long, default_value = "config.json")]
    config_path: String,

    /// Run as a Windows Service (used internally by the service dispatcher)
    #[arg(long, default_value_t = false)]
    service: bool,
}

/// Check if the current process is running with Administrator privileges on Windows.
/// On non-Windows platforms this always returns true.
#[cfg(windows)]
fn is_elevated() -> bool {
    use windows_sys::Win32::Foundation::{CloseHandle, HANDLE};
    use windows_sys::Win32::Security::{
        GetTokenInformation, TokenElevation, TOKEN_ELEVATION, TOKEN_QUERY,
    };
    use std::mem;

    unsafe {
        let mut token: HANDLE = 0;
        let process = windows_sys::Win32::System::Threading::GetCurrentProcess();
        if windows_sys::Win32::Security::OpenProcessToken(process, TOKEN_QUERY, &mut token) == 0 {
            return false;
        }

        let mut elevation: TOKEN_ELEVATION = mem::zeroed();
        let mut size: u32 = 0;
        let result = GetTokenInformation(
            token,
            TokenElevation,
            &mut elevation as *mut _ as *mut _,
            mem::size_of::<TOKEN_ELEVATION>() as u32,
            &mut size,
        );

        CloseHandle(token);
        result != 0 && elevation.TokenIsElevated != 0
    }
}

#[cfg(not(windows))]
fn is_elevated() -> bool {
    // On Linux/macOS, check if running as root (UID 0)
    // Use /proc/self/status or the `id` command to avoid a libc dependency
    std::process::Command::new("id")
        .arg("-u")
        .output()
        .map(|o| String::from_utf8_lossy(&o.stdout).trim() == "0")
        .unwrap_or(false)
}

/// Core agent logic — shared between standalone and Windows Service modes
async fn run_agent(args: &Args) -> anyhow::Result<()> {
    info!("Starting SockPit SOCKS5 Agent...");

    // Check for elevated privileges
    if !is_elevated() {
        warn!("⚠ Agent is NOT running with elevated privileges!");
        warn!("  On Windows: Right-click the .exe and select 'Run as Administrator'");
        warn!("  On Linux: Run with 'sudo' or as root");
        warn!("  Some ports below 1024 may fail to bind.");
    } else {
        info!("Running with elevated privileges ✓");
    }

    // Initialize local config file
    let config_store = Arc::new(ConfigStore::new(&args.config_path));

    // Save arguments to config if they are fresh or no config exists
    let mut config = config_store.load()?;
    if config.server_url.is_empty() || args.install_token.is_some() {
        config.server_url = args.server_url.clone();
        config.encryption_key = args.encryption_key.clone();
        config_store.save(&config)?;
    }

    // Initialize Shared bandwidth counters & SOCKS5 Server
    let bytes_in = Arc::new(AtomicI64::new(0));
    let bytes_out = Arc::new(AtomicI64::new(0));

    let socks5_server = Arc::new(Socks5Server::new(bytes_in.clone(), bytes_out.clone()));

    // Start WebSocket loop
    let ws_client = WebSocketClient::new(
        config_store,
        socks5_server,
        bytes_in,
        bytes_out,
        args.install_token.clone(),
    );

    // Block on client execution loop
    ws_client.run().await;

    Ok(())
}

// ── Windows Service Integration ──────────────────────────────────────────────
#[cfg(windows)]
mod windows_svc {
    use std::ffi::OsString;
    use windows_service::{
        define_windows_service,
        service::{
            ServiceControl, ServiceControlAccept, ServiceExitCode, ServiceState, ServiceStatus,
            ServiceType,
        },
        service_control_handler::{self, ServiceControlHandlerResult},
        service_dispatcher,
    };
    use tracing::{error, info};

    const SERVICE_NAME: &str = "SockPitAgent";
    const SERVICE_TYPE: ServiceType = ServiceType::OWN_PROCESS;

    define_windows_service!(ffi_service_main, service_main);

    pub fn run_as_service() -> anyhow::Result<()> {
        service_dispatcher::start(SERVICE_NAME, ffi_service_main)
            .map_err(|e| anyhow::anyhow!("Failed to start service dispatcher: {:?}", e))?;
        Ok(())
    }

    fn service_main(arguments: Vec<OsString>) {
        if let Err(e) = run_service(arguments) {
            error!("Service error: {:?}", e);
        }
    }

    fn run_service(_arguments: Vec<OsString>) -> anyhow::Result<()> {
        let (shutdown_tx, shutdown_rx) = std::sync::mpsc::channel();

        let event_handler = move |control_event| -> ServiceControlHandlerResult {
            match control_event {
                ServiceControl::Stop => {
                    let _ = shutdown_tx.send(());
                    ServiceControlHandlerResult::NoError
                }
                ServiceControl::Interrogate => ServiceControlHandlerResult::NoError,
                _ => ServiceControlHandlerResult::NotImplemented,
            }
        };

        let status_handle =
            service_control_handler::register(SERVICE_NAME, event_handler)
                .map_err(|e| anyhow::anyhow!("Failed to register service handler: {:?}", e))?;

        // Report: Running
        status_handle
            .set_service_status(ServiceStatus {
                service_type: SERVICE_TYPE,
                current_state: ServiceState::Running,
                controls_accepted: ServiceControlAccept::STOP,
                exit_code: ServiceExitCode::Win32(0),
                checkpoint: 0,
                wait_hint: std::time::Duration::default(),
                process_id: None,
            })
            .ok();

        info!("SockPit Agent Windows Service started");

        // Build a tokio runtime and run the agent inside it
        let rt = tokio::runtime::Runtime::new()
            .map_err(|e| anyhow::anyhow!("Failed to create tokio runtime: {}", e))?;

        let args = super::Args::parse();

        rt.spawn(async move {
            if let Err(e) = super::run_agent(&args).await {
                error!("Agent error: {:?}", e);
            }
        });

        // Block until stop signal
        let _ = shutdown_rx.recv();

        info!("SockPit Agent Windows Service stopping");

        // Report: Stopped
        status_handle
            .set_service_status(ServiceStatus {
                service_type: SERVICE_TYPE,
                current_state: ServiceState::Stopped,
                controls_accepted: ServiceControlAccept::empty(),
                exit_code: ServiceExitCode::Win32(0),
                checkpoint: 0,
                wait_hint: std::time::Duration::default(),
                process_id: None,
            })
            .ok();

        Ok(())
    }
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    // Initialize Tracing Structured Logger
    let subscriber = FmtSubscriber::builder()
        .with_max_level(Level::INFO)
        .finish();
    tracing::subscriber::set_global_default(subscriber)?;

    let args = Args::parse();

    // If --service flag is set, run as a Windows Service
    #[cfg(windows)]
    if args.service {
        return windows_svc::run_as_service();
    }

    // Otherwise, run as a standalone console application
    run_agent(&args).await
}
