use clap::Parser;
use std::sync::atomic::AtomicI64;
use std::sync::Arc;
use tracing::{info, Level};
use tracing_subscriber::FmtSubscriber;

mod config;
mod crypto;
mod socks5;
mod websocket;

use config::{AgentConfig, ConfigStore};
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
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    // 1. Initialize Tracing Structured Logger
    let subscriber = FmtSubscriber::builder()
        .with_max_level(Level::INFO)
        .finish();
    tracing::subscriber::set_global_default(subscriber)?;

    let args = Args::parse();
    info!("Starting SockPit SOCKS5 Agent...");

    // 2. Initialize local config file
    let config_store = Arc::new(ConfigStore::new(&args.config_path));
    
    // Save arguments to config if they are fresh or no config exists
    let mut config = config_store.load()?;
    if config.server_url.is_empty() || args.install_token.is_some() {
        config.server_url = args.server_url;
        config.encryption_key = args.encryption_key;
        config_store.save(&config)?;
    }

    // 3. Initialize Shared bandwidth counters & SOCKS5 Server
    let bytes_in = Arc::new(AtomicI64::new(0));
    let bytes_out = Arc::new(AtomicI64::new(0));

    let socks5_server = Arc::new(Socks5Server::new(bytes_in.clone(), bytes_out.clone()));

    // 4. Start WebSocket loop
    let ws_client = WebSocketClient::new(
        config_store,
        socks5_server,
        bytes_in,
        bytes_out,
        args.install_token,
    );

    // Block on client execution loop
    ws_client.run().await;

    Ok(())
}
