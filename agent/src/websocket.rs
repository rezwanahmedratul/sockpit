use std::sync::atomic::{AtomicI64, Ordering};
use std::sync::Arc;
use std::time::Duration;
use futures_util::{SinkExt, StreamExt};
use serde::{Deserialize, Serialize};
use tokio::sync::Mutex;
use tokio::time::sleep;
use tokio_tungstenite::{connect_async, tungstenite::protocol::Message};
use tracing::{error, info, warn};

use crate::config::ConfigStore;
use crate::crypto::decrypt_password;
use crate::socks5::auth::UserCredential;
use crate::socks5::server::Socks5Server;

#[derive(Serialize, Deserialize, Debug)]
struct WsMessage {
    #[serde(rename = "type")]
    msg_type: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[serde(rename = "replyTo")]
    reply_to: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    timestamp: Option<String>,
    payload: serde_json::Value,
}

pub struct WebSocketClient {
    config_store: Arc<ConfigStore>,
    socks5_server: Arc<Socks5Server>,
    bytes_in: Arc<AtomicI64>,
    bytes_out: Arc<AtomicI64>,
    install_token: Option<String>,
}

impl WebSocketClient {
    pub fn new(
        config_store: Arc<ConfigStore>,
        socks5_server: Arc<Socks5Server>,
        bytes_in: Arc<AtomicI64>,
        bytes_out: Arc<AtomicI64>,
        install_token: Option<String>,
    ) -> Self {
        Self {
            config_store,
            socks5_server,
            bytes_in,
            bytes_out,
            install_token,
        }
    }

    pub async fn run(&self) {
        loop {
            let config = match self.config_store.load() {
                Ok(c) => c,
                Err(e) => {
                    error!("Failed to load config: {}", e);
                    sleep(Duration::from_secs(5)).await;
                    continue;
                }
            };

            info!("Connecting to WebSocket server: {}", config.server_url);
            match connect_async(&config.server_url).await {
                Ok((ws_stream, _)) => {
                    info!("WebSocket connection established!");
                    let (mut write, mut read) = ws_stream.split();
                    
                    // 1. Send AGENT_AUTH
                    let auth_payload = if let Some(ref at) = config.agent_token {
                        serde_json::json!({
                            "auth_type": "agent_token",
                            "token": at,
                            "agent_info": get_agent_info()
                        })
                    } else if let Some(ref it) = self.install_token {
                        serde_json::json!({
                            "auth_type": "install_token",
                            "token": it,
                            "agent_info": get_agent_info()
                        })
                    } else {
                        error!("No installation token or agent token found. Cannot authenticate.");
                        sleep(Duration::from_secs(10)).await;
                        continue;
                    };

                    let auth_msg = WsMessage {
                        msg_type: "AGENT_AUTH".to_string(),
                        id: Some(uuid::Uuid::new_v4().to_string()),
                        reply_to: None,
                        timestamp: Some(chrono::Utc::now().to_rfc3339()),
                        payload: auth_payload,
                    };

                    let auth_json = serde_json::to_string(&auth_msg).unwrap();
                    if let Err(e) = write.send(Message::Text(auth_json)).await {
                        error!("Failed to send AGENT_AUTH: {}", e);
                        continue;
                    }

                    // 2. Receive AUTH_RESULT
                    let ws_write = Arc::new(Mutex::new(write));
                    let _ws_write_clone = ws_write.clone();

                    let mut authenticated = false;
                    let mut server_id = config.server_id.clone();
                    
                    while let Some(msg_res) = read.next().await {
                        match msg_res {
                            Ok(Message::Text(text)) => {
                                match serde_json::from_str::<WsMessage>(&text) {
                                    Ok(ws_msg) => {
                                        if ws_msg.msg_type == "AUTH_RESULT" {
                                            let success = ws_msg.payload.get("success").and_then(|v| v.as_bool()).unwrap_or(false);
                                            if success {
                                                info!("Agent authenticated successfully!");
                                                authenticated = true;

                                                // If registration, save the new agent token & server_id
                                                let mut updated_config = config.clone();
                                                let mut needs_save = false;

                                                if let Some(s_id) = ws_msg.payload.get("server_id").and_then(|v| v.as_str()) {
                                                    updated_config.server_id = Some(s_id.to_string());
                                                    server_id = Some(s_id.to_string());
                                                    needs_save = true;
                                                }
                                                if let Some(a_token) = ws_msg.payload.get("agent_token").and_then(|v| v.as_str()) {
                                                    updated_config.agent_token = Some(a_token.to_string());
                                                    needs_save = true;
                                                }

                                                if needs_save {
                                                    let _ = self.config_store.save(&updated_config);
                                                }
                                                break;
                                            } else {
                                                let err = ws_msg.payload.get("error").and_then(|v| v.as_str()).unwrap_or("Unknown error");
                                                error!("Authentication failed: {}", err);
                                                break;
                                            }
                                        }
                                    }
                                    Err(e) => error!("Failed to parse WS text message: {}", e),
                                }
                            }
                            Ok(Message::Close(_)) => {
                                warn!("Server closed connection during auth handshake");
                                break;
                            }
                            Err(e) => {
                                error!("Socket read error: {}", e);
                                break;
                            }
                            _ => {}
                        }
                    }

                    if !authenticated {
                        sleep(Duration::from_secs(5)).await;
                        continue;
                    }

                    // 3. Spawns Heartbeat Loop
                    let ws_write_hb = ws_write.clone();
                    let s_id_hb = server_id.clone().unwrap_or_default();
                    let hb_handle = tokio::spawn(async move {
                        loop {
                            sleep(Duration::from_secs(30)).await;
                            let hb_msg = WsMessage {
                                msg_type: "HEARTBEAT".to_string(),
                                id: Some(uuid::Uuid::new_v4().to_string()),
                                reply_to: None,
                                timestamp: Some(chrono::Utc::now().to_rfc3339()),
                                payload: serde_json::json!({
                                    "server_id": s_id_hb,
                                    "uptime_seconds": 1234, // Mock uptime
                                    "active_socks5_connections": 0
                                }),
                            };
                            let json = serde_json::to_string(&hb_msg).unwrap();
                            let mut write_guard = ws_write_hb.lock().await;
                            if let Err(e) = write_guard.send(Message::Text(json)).await {
                                error!("Failed to send HEARTBEAT: {}", e);
                                break;
                            }
                        }
                    });

                    // 4. Spawns Metrics Loop
                    let ws_write_metrics = ws_write.clone();
                    let s_id_metrics = server_id.clone().unwrap_or_default();
                    let b_in = self.bytes_in.clone();
                    let b_out = self.bytes_out.clone();
                    let metrics_handle = tokio::spawn(async move {
                        loop {
                            sleep(Duration::from_secs(60)).await;
                            
                            // Load metrics
                            let in_bytes = b_in.load(Ordering::SeqCst);
                            let out_bytes = b_out.load(Ordering::SeqCst);
                            
                            let metrics_msg = WsMessage {
                                msg_type: "METRICS_REPORT".to_string(),
                                id: Some(uuid::Uuid::new_v4().to_string()),
                                reply_to: None,
                                timestamp: Some(chrono::Utc::now().to_rfc3339()),
                                payload: serde_json::json!({
                                    "server_id": s_id_metrics,
                                    "cpu_usage": 5.0, // Mock metrics
                                    "memory_usage": 20.0,
                                    "bandwidth_in": in_bytes,
                                    "bandwidth_out": out_bytes,
                                    "active_connections": 0
                                }),
                            };
                            let json = serde_json::to_string(&metrics_msg).unwrap();
                            let mut write_guard = ws_write_metrics.lock().await;
                            if let Err(e) = write_guard.send(Message::Text(json)).await {
                                error!("Failed to send METRICS_REPORT: {}", e);
                                break;
                            }
                        }
                    });

                    // 5. Incoming WS messages processing loop
                    while let Some(msg_res) = read.next().await {
                        match msg_res {
                            Ok(Message::Text(text)) => {
                                if let Ok(ws_msg) = serde_json::from_str::<WsMessage>(&text) {
                                    if let Err(e) = self.handle_server_command(ws_msg, &config.encryption_key).await {
                                        error!("Error executing command: {}", e);
                                    }
                                }
                            }
                            Ok(Message::Close(_)) => {
                                warn!("WebSocket closed by remote host");
                                break;
                            }
                            Err(e) => {
                                error!("WebSocket read connection error: {}", e);
                                break;
                            }
                            _ => {}
                        }
                    }

                    // Clean up tasks on socket shutdown
                    hb_handle.abort();
                    metrics_handle.abort();
                }
                Err(e) => {
                    error!("Connection connection failed: {}. Retrying in 10s...", e);
                    sleep(Duration::from_secs(10)).await;
                }
            }
        }
    }

    async fn handle_server_command(&self, msg: WsMessage, encryption_key: &str) -> anyhow::Result<()> {
        info!("Executing server command: {}", msg.msg_type);
        match msg.msg_type.as_str() {
            "SYNC_CONFIG" => {
                let users = msg.payload.get("socks5_users").and_then(|v| v.as_array()).ok_or_else(|| anyhow::anyhow!("Invalid sync payload"))?;
                for u in users {
                    let socks5_user_id = u.get("socks5_user_id").and_then(|v| v.as_str()).unwrap_or_default().to_string();
                    let username = u.get("username").and_then(|v| v.as_str()).unwrap_or_default().to_string();
                    let enc_password = u.get("password").and_then(|v| v.as_str()).unwrap_or_default();
                    let port = u.get("port").and_then(|v| v.as_u64()).unwrap_or(1080) as u16;
                    let max_connections = u.get("max_connections").and_then(|v| v.as_u64()).unwrap_or(1) as u32;
                    let is_active = u.get("is_active").and_then(|v| v.as_bool()).unwrap_or(true);

                    // Decrypt password
                    let password_plain = decrypt_password(enc_password, encryption_key)?;

                    // Setup listener port
                    self.socks5_server.add_port(port).await?;

                    // Configure credentials
                    let cred = UserCredential {
                        id: socks5_user_id.clone(),
                        username,
                        password_plain,
                        max_connections,
                        is_active,
                    };
                    self.socks5_server.auth_manager().add_user(port, cred);
                    self.socks5_server.conn_limiter().set_limit(&socks5_user_id, max_connections);
                }
            }
            "ADD_SOCKS5_USER" | "UPDATE_SOCKS5_USER" => {
                let socks5_user_id = msg.payload.get("socks5_user_id").and_then(|v| v.as_str()).unwrap_or_default().to_string();
                let username = msg.payload.get("username").and_then(|v| v.as_str()).unwrap_or_default().to_string();
                let enc_password = msg.payload.get("password").and_then(|v| v.as_str()).unwrap_or_default();
                let port = msg.payload.get("port").and_then(|v| v.as_u64()).unwrap_or(1080) as u16;
                let old_port = msg.payload.get("old_port").and_then(|v| v.as_u64()).map(|p| p as u16);
                let max_connections = msg.payload.get("max_connections").and_then(|v| v.as_u64()).unwrap_or(1) as u32;
                let is_active = msg.payload.get("is_active").and_then(|v| v.as_bool()).unwrap_or(true);

                let password_plain = decrypt_password(enc_password, encryption_key)?;

                // Shut down old port listener if port changed
                if let Some(op) = old_port {
                    if op != port {
                        let _ = self.socks5_server.remove_port(op).await;
                    }
                }

                // Setup port
                self.socks5_server.add_port(port).await?;

                let cred = UserCredential {
                    id: socks5_user_id.clone(),
                    username,
                    password_plain,
                    max_connections,
                    is_active,
                };
                self.socks5_server.auth_manager().add_user(port, cred);
                self.socks5_server.conn_limiter().set_limit(&socks5_user_id, max_connections);
                info!("Successfully added/updated SOCKS5 user credentials");
            }
            "REMOVE_SOCKS5_USER" => {
                let socks5_user_id = msg.payload.get("socks5_user_id").and_then(|v| v.as_str()).unwrap_or_default();
                let username = msg.payload.get("username").and_then(|v| v.as_str()).unwrap_or_default();
                let port = msg.payload.get("port").and_then(|v| v.as_u64()).unwrap_or(1080) as u16;

                self.socks5_server.auth_manager().remove_user(port, username);
                self.socks5_server.conn_limiter().remove_user(socks5_user_id);
                
                // Shut down port listener completely
                let _ = self.socks5_server.remove_port(port).await;
                info!("Successfully deleted SOCKS5 user credentials and closed port");
            }
            "HEARTBEAT_ACK" => {}
            _ => warn!("Unknown server command: {}", msg.msg_type),
        }
        Ok(())
    }
}

fn get_agent_info() -> serde_json::Value {
    serde_json::json!({
        "hostname": "linux-agent",
        "ip_address": "127.0.0.1",
        "os_type": "linux",
        "os_version": "Ubuntu",
        "agent_version": "1.0.0"
    })
}
