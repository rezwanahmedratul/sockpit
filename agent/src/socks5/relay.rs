use std::sync::atomic::{AtomicI64, Ordering};
use std::sync::Arc;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpStream;

pub struct TrafficRelay {
    pub bytes_in: Arc<AtomicI64>,
    pub bytes_out: Arc<AtomicI64>,
}

impl TrafficRelay {
    pub fn new(bytes_in: Arc<AtomicI64>, bytes_out: Arc<AtomicI64>) -> Self {
        Self {
            bytes_in,
            bytes_out,
        }
    }

    pub async fn relay(
        &self,
        mut client: TcpStream,
        mut target: TcpStream,
    ) -> Result<(i64, i64), std::io::Error> {
        let (mut client_read, mut client_write) = client.split();
        let (mut target_read, mut target_write) = target.split();

        // 1. Client to Target relay (Bytes Sent Out)
        let bytes_sent_counter = self.bytes_out.clone();
        let client_to_target = async move {
            let mut buf = [0u8; 16384];
            let mut total_written = 0i64;
            loop {
                let n = client_read.read(&mut buf).await?;
                if n == 0 {
                    break;
                }
                target_write.write_all(&buf[..n]).await?;
                total_written += n as i64;
                bytes_sent_counter.fetch_add(n as i64, Ordering::SeqCst);
            }
            target_write.shutdown().await?;
            Ok::<i64, std::io::Error>(total_written)
        };

        // 2. Target to Client relay (Bytes Received In)
        let bytes_recv_counter = self.bytes_in.clone();
        let target_to_client = async move {
            let mut buf = [0u8; 16384];
            let mut total_read = 0i64;
            loop {
                let n = target_read.read(&mut buf).await?;
                if n == 0 {
                    break;
                }
                client_write.write_all(&buf[..n]).await?;
                total_read += n as i64;
                bytes_recv_counter.fetch_add(n as i64, Ordering::SeqCst);
            }
            client_write.shutdown().await?;
            Ok::<i64, std::io::Error>(total_read)
        };

        // Run both copies concurrently
        let (sent_res, recv_res) = tokio::join!(client_to_target, target_to_client);

        let sent = sent_res?;
        let recv = recv_res?;

        Ok((sent, recv))
    }
}
