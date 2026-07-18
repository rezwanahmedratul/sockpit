use aes_gcm::{
    aead::{Aead, KeyInit},
    Aes256Gcm, Nonce, Key
};
use anyhow::{anyhow, Result};

pub fn decrypt_password(encrypted_str: &str, encryption_key_hex: &str) -> Result<String> {
    // 1. Decode Key
    let key_bytes = hex::decode(encryption_key_hex)
        .map_err(|e| anyhow!("Failed to decode encryption key hex: {}", e))?;
    
    if key_bytes.len() != 32 {
        return Err(anyhow!("Encryption key must be exactly 32 bytes (64 hex characters)"));
    }

    let key = Key::<Aes256Gcm>::from_slice(&key_bytes);

    // 2. Parse encrypted string: iv:tag:ciphertext
    let parts: Vec<&str> = encrypted_str.split(':').collect();
    if parts.len() != 3 {
        return Err(anyhow!("Invalid encrypted password format. Expected iv:tag:ciphertext"));
    }

    let iv_bytes = hex::decode(parts[0])
        .map_err(|e| anyhow!("Failed to decode IV hex: {}", e))?;
    let tag_bytes = hex::decode(parts[1])
        .map_err(|e| anyhow!("Failed to decode tag hex: {}", e))?;
    let cipher_bytes = hex::decode(parts[2])
        .map_err(|e| anyhow!("Failed to decode ciphertext hex: {}", e))?;

    // IV must be 12 bytes for GCM mode
    if iv_bytes.len() != 12 {
        return Err(anyhow!("Invalid IV length. Expected 12 bytes"));
    }

    // Combine ciphertext and tag (aes-gcm crate expects tag appended to ciphertext)
    let mut payload = cipher_bytes;
    payload.extend_from_slice(&tag_bytes);

    // 3. Decrypt
    let cipher = Aes256Gcm::new(key);
    let nonce = Nonce::from_slice(&iv_bytes);

    let decrypted_bytes = cipher
        .decrypt(nonce, payload.as_slice())
        .map_err(|e| anyhow!("AES decryption failed: {}", e))?;

    let decrypted_str = String::from_utf8(decrypted_bytes)
        .map_err(|e| anyhow!("Decrypted payload is not valid UTF-8: {}", e))?;

    Ok(decrypted_str)
}
