use serde::{Deserialize, Serialize};
use std::fs::{self, File};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use tracing::info;

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
pub struct AgentConfig {
    pub server_id: Option<String>,
    pub agent_token: Option<String>,
    pub server_url: String,
    pub encryption_key: String,
}

pub struct ConfigStore {
    path: PathBuf,
}

impl ConfigStore {
    pub fn new<P: AsRef<Path>>(path: P) -> Self {
        Self {
            path: path.as_ref().to_path_buf(),
        }
    }

    pub fn load(&self) -> anyhow::Result<AgentConfig> {
        if !self.path.exists() {
            return Ok(AgentConfig::default());
        }

        let mut file = File::open(&self.path)?;
        let mut content = String::new();
        file.read_to_string(&mut content)?;
        
        let config: AgentConfig = serde_json::from_str(&content)?;
        Ok(config)
    }

    pub fn save(&self, config: &AgentConfig) -> anyhow::Result<()> {
        // Ensure parent directories exist
        if let Some(parent) = self.path.parent() {
            fs::create_dir_all(parent)?;
        }

        let content = serde_json::to_string_pretty(config)?;
        let mut file = File::create(&self.path)?;
        file.write_all(content.as_bytes())?;
        info!("Saved agent config locally to {:?}", self.path);
        Ok(())
    }
}
