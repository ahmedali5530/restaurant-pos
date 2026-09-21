//! Persisted desktop secrets and setup marker under the app data directory.

use std::fs;
use std::path::{Path, PathBuf};

use rand::RngCore;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DesktopConfig {
  pub surreal_user: String,
  pub surreal_pass: String,
  pub gateway_jwt_secret: String,
  pub surreal_ns: String,
  pub surreal_db: String,
}

impl DesktopConfig {
  pub fn generate() -> Self {
    Self {
      surreal_user: "root".to_string(),
      surreal_pass: random_hex(24),
      gateway_jwt_secret: random_hex(48),
      surreal_ns: "posr".to_string(),
      surreal_db: "posr".to_string(),
    }
  }
}

fn random_hex(bytes: usize) -> String {
  let mut buf = vec![0u8; bytes];
  rand::thread_rng().fill_bytes(&mut buf);
  hex::encode(buf)
}

pub fn config_path(app_data: &Path) -> PathBuf {
  app_data.join("desktop-config.json")
}

pub fn setup_marker_path(app_data: &Path) -> PathBuf {
  app_data.join(".posr_setup_done")
}

pub fn surreal_data_dir(app_data: &Path) -> PathBuf {
  app_data.join("database")
}

pub fn load_or_create_config(app_data: &Path) -> Result<DesktopConfig, String> {
  fs::create_dir_all(app_data).map_err(|e| format!("create app data: {e}"))?;
  let path = config_path(app_data);
  if path.exists() {
    let raw = fs::read_to_string(&path).map_err(|e| format!("read config: {e}"))?;
    let cfg: DesktopConfig =
      serde_json::from_str(&raw).map_err(|e| format!("parse config: {e}"))?;
    return Ok(cfg);
  }
  let cfg = DesktopConfig::generate();
  // Prefer repo .env.local secrets when present (dev parity with Docker).
  let mut cfg = cfg;
  if let Ok(root) = std::env::var("POSR_REPO_ROOT") {
    let root = PathBuf::from(root);
    if let Some(v) = crate::paths::load_dotenv_value(&root, "GATEWAY_JWT_SECRET") {
      cfg.gateway_jwt_secret = v;
    }
    if let Some(v) = crate::paths::load_dotenv_value(&root, "SURREAL_USER") {
      cfg.surreal_user = v;
    }
    if let Some(v) = crate::paths::load_dotenv_value(&root, "SURREAL_PASS") {
      cfg.surreal_pass = v;
    }
  }
  save_config(app_data, &cfg)?;
  Ok(cfg)
}

pub fn save_config(app_data: &Path, cfg: &DesktopConfig) -> Result<(), String> {
  fs::create_dir_all(app_data).map_err(|e| format!("create app data: {e}"))?;
  let path = config_path(app_data);
  let raw = serde_json::to_string_pretty(cfg).map_err(|e| format!("serialize config: {e}"))?;
  fs::write(&path, raw).map_err(|e| format!("write config: {e}"))
}

pub fn is_setup_complete(app_data: &Path) -> bool {
  setup_marker_path(app_data).exists()
}

pub fn mark_setup_complete(app_data: &Path) -> Result<(), String> {
  fs::create_dir_all(app_data).map_err(|e| format!("create app data: {e}"))?;
  fs::write(setup_marker_path(app_data), b"1").map_err(|e| format!("write setup marker: {e}"))
}
