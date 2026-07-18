use std::collections::HashMap;
use std::net::SocketAddr;
use std::sync::atomic::AtomicI64;
use std::sync::Arc;
use tokio::net::{TcpListener, TcpStream};
use tokio::sync::mpsc;
use tracing::{error, info, warn};

use super::auth::{AuthManager, UserCredential};
use super::limiter::ConnectionLimiter;
use super::relay::TrafficRelay;

pub struct Socks5Server {
    listeners: Arc<tokio::sync::Mutex<HashMap<u16, mpsc::Sender<()>>>>,
    auth_manager: Arc<AuthManager>,
    conn_limiter: Arc<ConnectionLimiter>,
    bytes_in: Arc<AtomicI64>,
    bytes_out: Arc<AtomicI64>,
}

impl Socks5Server {
    pub fn new(bytes_in: Arc<AtomicI64>, bytes_out: Arc<AtomicI64>) -> Self {
        Self {
            listeners: Arc::new(tokio::sync::Mutex::new(HashMap::new())),
            auth_manager: Arc::new(AuthManager::new()),
            conn_limiter: Arc::new(ConnectionLimiter::new()),
            bytes_in,
            bytes_out,
        }
    }

    pub fn auth_manager(&self) -> &AuthManager {
        &self.auth_manager
    }

    pub fn conn_limiter(&self) -> &ConnectionLimiter {
        &self.conn_limiter
    }

    pub async fn add_port(&self, port: u16) -> anyhow::Result<()> {
        let mut listeners = self.listeners.lock().await;
        if listeners.contains_key(&port) {
            return Ok(());
        }

        let (shutdown_tx, mut shutdown_rx) = mpsc::channel::<()>(1);
        listeners.insert(port, shutdown_tx);

        let listener = TcpListener::bind(format!("0.0.0.0:{}", port)).await?;
        info!("SOCKS5 Listener active on port {}", port);

        let auth_manager = self.auth_manager.clone();
        let conn_limiter = self.conn_limiter.clone();
        let bytes_in = self.bytes_in.clone();
        let bytes_out = self.bytes_out.clone();

        tokio::spawn(async move {
            loop {
                tokio::select! {
                    _ = shutdown_rx.recv() => {
                        info!("Shutting down SOCKS5 listener on port {}", port);
                        break;
                    }
                    conn_res = listener.accept() => {
                        match conn_res {
                            Ok((stream, client_addr)) => {
                                let auth = auth_manager.clone();
                                let limiter = conn_limiter.clone();
                                let b_in = bytes_in.clone();
                                let b_out = bytes_out.clone();
                                tokio::spawn(async move {
                                    if let Err(e) = handle_connection(stream, client_addr, port, auth, limiter, b_in, b_out).await {
                                        warn!("Error handling SOCKS5 connection: {}", e);
                                    }
                                });
                            }
                            Err(e) => {
                                error!("Failed to accept incoming TCP socket connection: {}", e);
                            }
                        }
                    }
                }
            }
        });

        Ok(())
    }

    pub async fn remove_port(&self, port: u16) -> anyhow::Result<()> {
        let mut listeners = self.listeners.lock().await;
        if let Some(shutdown_tx) = listeners.remove(&port) {
            let _ = shutdown_tx.send(()).await;
            self.auth_manager.clear_port(port);
        }
        Ok(())
    }
}

async fn handle_connection(
    mut stream: TcpStream,
    client_addr: SocketAddr,
    port: u16,
    auth_manager: Arc<AuthManager>,
    conn_limiter: Arc<ConnectionLimiter>,
    bytes_in: Arc<AtomicI64>,
    bytes_out: Arc<AtomicI64>,
) -> anyhow::Result<()> {
    // 1. Negotiation: Read Method Selection Request
    let mut header = [0u8; 2];
    tokio::io::AsyncReadExt::read_exact(&mut stream, &mut header).await?;
    let ver = header[0];
    let nmethods = header[1];

    if ver != 0x05 {
        anyhow::bail!("Unsupported SOCKS protocol version: {}", ver);
    }

    let mut methods = vec![0u8; nmethods as usize];
    tokio::io::AsyncReadExt::read_exact(&mut stream, &mut methods).await?;

    // We only support Username/Password authentication (0x02)
    if !methods.contains(&0x02) {
        // Send METHOD=0xFF (no acceptable methods)
        tokio::io::AsyncWriteExt::write_all(&mut stream, &[0x05, 0xFF]).await?;
        anyhow::bail!("Client does not support username/password auth method");
    }

    // Send METHOD=0x02
    tokio::io::AsyncWriteExt::write_all(&mut stream, &[0x05, 0x02]).await?;

    // 2. Authentication subnegotiation
    let mut auth_header = [0u8; 2];
    tokio::io::AsyncReadExt::read_exact(&mut stream, &mut auth_header).await?;
    let sub_ver = auth_header[0];
    let ulen = auth_header[1] as usize;

    if sub_ver != 0x01 {
        anyhow::bail!("Unsupported subnegotiation version: {}", sub_ver);
    }

    let mut username_bytes = vec![0u8; ulen];
    tokio::io::AsyncReadExt::read_exact(&mut stream, &mut username_bytes).await?;
    let username = String::from_utf8(username_bytes)?;

    let mut plen_buf = [0u8; 1];
    tokio::io::AsyncReadExt::read_exact(&mut stream, &mut plen_buf).await?;
    let plen = plen_buf[0] as usize;

    let mut password_bytes = vec![0u8; plen];
    tokio::io::AsyncReadExt::read_exact(&mut stream, &mut password_bytes).await?;
    let password = String::from_utf8(password_bytes)?;

    // Authenticate
    let user_cred = match auth_manager.authenticate(port, &username, &password) {
        Some(cred) => cred,
        None => {
            // Send STATUS=0x01 (auth failure)
            tokio::io::AsyncWriteExt::write_all(&mut stream, &[0x01, 0x01]).await?;
            anyhow::bail!("Invalid user credentials for port {}", port);
        }
    };

    // Connection limits check
    if !conn_limiter.try_acquire(&user_cred.id) {
        // Reject connection due to limit exceeded
        tokio::io::AsyncWriteExt::write_all(&mut stream, &[0x01, 0x01]).await?;
        anyhow::bail!("Connection limit reached for user: {}", username);
    }

    // Wrap guard to release limit counter on socket exit
    struct LimiterGuard {
        limiter: Arc<ConnectionLimiter>,
        user_id: String,
    }
    impl Drop for LimiterGuard {
        fn drop(&mut self) {
            self.limiter.release(&self.user_id);
        }
    }
    let _guard = LimiterGuard {
        limiter: conn_limiter.clone(),
        user_id: user_cred.id.clone(),
    };

    // Send STATUS=0x00 (auth success)
    tokio::io::AsyncWriteExt::write_all(&mut stream, &[0x01, 0x00]).await?;

    // 3. SOCKS5 request details
    let mut request_header = [0u8; 4];
    tokio::io::AsyncReadExt::read_exact(&mut stream, &mut request_header).await?;
    let req_ver = request_header[0];
    let cmd = request_header[1];
    let atyp = request_header[3];

    if req_ver != 0x05 {
        anyhow::bail!("Invalid SOCKS version in request header: {}", req_ver);
    }

    if cmd != 0x01 {
        // Command not supported: send reply code 0x07 (Command not supported)
        tokio::io::AsyncWriteExt::write_all(&mut stream, &[0x05, 0x07, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]).await?;
        anyhow::bail!("Unsupported command code: {}", cmd);
    }

    // Parse target destination address
    let dest_addr = match atyp {
        0x01 => {
            // IPv4: 4 bytes
            let mut ipv4_buf = [0u8; 4];
            tokio::io::AsyncReadExt::read_exact(&mut stream, &mut ipv4_buf).await?;
            let mut port_buf = [0u8; 2];
            tokio::io::AsyncReadExt::read_exact(&mut stream, &mut port_buf).await?;
            let dest_port = u16::from_be_bytes(port_buf);
            format!("{}.{}.{}.{}:{}", ipv4_buf[0], ipv4_buf[1], ipv4_buf[2], ipv4_buf[3], dest_port)
        }
        0x03 => {
            // Domain Name: 1st byte is length of string
            let mut len_buf = [0u8; 1];
            tokio::io::AsyncReadExt::read_exact(&mut stream, &mut len_buf).await?;
            let host_len = len_buf[0] as usize;
            let mut host_buf = vec![0u8; host_len];
            tokio::io::AsyncReadExt::read_exact(&mut stream, &mut host_buf).await?;
            let host = String::from_utf8(host_buf)?;
            let mut port_buf = [0u8; 2];
            tokio::io::AsyncReadExt::read_exact(&mut stream, &mut port_buf).await?;
            let dest_port = u16::from_be_bytes(port_buf);
            format!("{}:{}", host, dest_port)
        }
        0x04 => {
            // IPv6: 16 bytes
            let mut ipv6_buf = [0u8; 16];
            tokio::io::AsyncReadExt::read_exact(&mut stream, &mut ipv6_buf).await?;
            let mut port_buf = [0u8; 2];
            tokio::io::AsyncReadExt::read_exact(&mut stream, &mut port_buf).await?;
            let dest_port = u16::from_be_bytes(port_buf);
            // Format IPv6 cleanly
            let ip = std::net::Ipv6Addr::from(ipv6_buf);
            format!("[{}]:{}", ip, dest_port)
        }
        _ => {
            // Address type not supported: reply 0x08
            tokio::io::AsyncWriteExt::write_all(&mut stream, &[0x05, 0x08, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]).await?;
            anyhow::bail!("Unsupported address type: {}", atyp);
        }
    };

    // 4. Connect to target destination address
    let target = match TcpStream::connect(&dest_addr).await {
        Ok(t) => t,
        Err(e) => {
            // Host unreachable: reply code 0x04 (Host unreachable)
            tokio::io::AsyncWriteExt::write_all(&mut stream, &[0x05, 0x04, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]).await?;
            anyhow::bail!("Failed to connect to target {}: {}", dest_addr, e);
        }
    };

    // SOCKS5 response connection successful: REP=0x00
    // Send bound address details (we send empty IPv4 0.0.0.0:0 as standard)
    tokio::io::AsyncWriteExt::write_all(&mut stream, &[0x05, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]).await?;

    // 5. Start relay copy
    let relay = TrafficRelay::new(bytes_in, bytes_out);
    relay.relay(stream, target).await?;

    Ok(())
}
