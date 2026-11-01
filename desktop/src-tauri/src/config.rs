//! Persisted desktop secrets, installer settings, and setup marker.

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
  #[serde(default)]
  pub integration_token_encryption_key: String,
}

impl DesktopConfig {
  pub fn generate() -> Self {
    Self {
      surreal_user: "root".to_string(),
      surreal_pass: random_hex(24),
      gateway_jwt_secret: random_hex(48),
      surreal_ns: "posr".to_string(),
      surreal_db: "posr".to_string(),
      integration_token_encryption_key: random_hex(32),
    }
  }

  pub fn ensure_secrets(&mut self) {
    if self.gateway_jwt_secret.len() < 32 {
      self.gateway_jwt_secret = random_hex(48);
    }
    if self.integration_token_encryption_key.len() < 16 {
      self.integration_token_encryption_key = random_hex(32);
    }
    if self.surreal_pass.is_empty() {
      self.surreal_pass = random_hex(24);
    }
    if self.surreal_user.is_empty() {
      self.surreal_user = "root".to_string();
    }
  }
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct InstallerStore {
  #[serde(default)]
  pub store_name: String,
  #[serde(default)]
  pub store_address: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct InstallerLocale {
  #[serde(default = "default_language")]
  pub default_language: String,
  #[serde(default = "default_locale")]
  pub locale: String,
  #[serde(default = "default_currency")]
  pub currency: String,
  #[serde(default)]
  pub currency_symbol: String,
  #[serde(default = "default_decimals")]
  pub decimal_places: i32,
  #[serde(default = "default_tz")]
  pub timezone: String,
  #[serde(default = "default_date")]
  pub date_format: String,
  #[serde(default = "default_time")]
  pub time_format: String,
}

fn default_language() -> String {
  "en".into()
}
fn default_locale() -> String {
  "en-US".into()
}
fn default_currency() -> String {
  "USD".into()
}
fn default_decimals() -> i32 {
  2
}
fn default_tz() -> String {
  "UTC".into()
}
fn default_date() -> String {
  "yyyy-MM-dd".into()
}
fn default_time() -> String {
  "HH:mm".into()
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct AiProfile {
  #[serde(default)]
  pub name: String,
  #[serde(default)]
  pub url: String,
  #[serde(default)]
  pub key: String,
  #[serde(default)]
  pub model: String,
  #[serde(default)]
  pub auth: String,
  #[serde(default)]
  pub compact: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct InstallerAi {
  #[serde(default)]
  pub enabled: bool,
  #[serde(default)]
  pub default_profile: String,
  #[serde(default)]
  pub profiles: Vec<AiProfile>,
  #[serde(default)]
  pub daily_limit: Option<u32>,
  #[serde(default)]
  pub monthly_limit: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct InstallerIntegrations {
  #[serde(default)]
  pub token_encryption_key: String,
  #[serde(default)]
  pub qbo_client_id: String,
  #[serde(default)]
  pub qbo_client_secret: String,
  #[serde(default)]
  pub qbo_redirect_uri: String,
  #[serde(default)]
  pub qbo_env: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct InstallerServer {
  /// Other POSR Desktop installs connect here. Empty means this PC is the server.
  #[serde(default)]
  pub host: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct InstallerSettings {
  #[serde(default)]
  pub store: InstallerStore,
  #[serde(default)]
  pub locale: InstallerLocale,
  #[serde(default)]
  pub ai: InstallerAi,
  #[serde(default)]
  pub integrations: InstallerIntegrations,
  #[serde(default)]
  pub server: InstallerServer,
  #[serde(default)]
  pub applied: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeConfigDto {
  pub store_name: String,
  pub store_address: String,
  pub default_language: String,
  pub locale: String,
  pub currency: String,
  pub currency_symbol: String,
  pub decimal_places: i32,
  pub timezone: String,
  pub date_format: String,
  pub time_format: String,
  pub has_installer_settings: bool,
  pub applied: bool,
  /// Set on a satellite terminal. Empty on the PC that runs Surreal.
  #[serde(default)]
  pub central_host: String,
  #[serde(default)]
  pub gateway_url: String,
  #[serde(default)]
  pub db_websocket_url: String,
  #[serde(default)]
  pub print_server_url: String,
  #[serde(default)]
  pub payment_server_url: String,
  #[serde(default)]
  pub tracking_server_url: String,
  #[serde(default)]
  pub api_server_url: String,
  #[serde(default)]
  pub sync_service_url: String,
}

/// Host of another POSR Desktop that should serve this install.
/// `localhost` and `127.0.0.1` mean this PC, so they are ignored.
pub fn central_host(settings: &InstallerSettings) -> Option<String> {
  let mut raw = settings.server.host.trim().trim_end_matches('/').to_string();
  for prefix in ["https://", "http://", "wss://", "ws://"] {
    if let Some(rest) = raw.strip_prefix(prefix) {
      raw = rest.to_string();
      break;
    }
  }
  if let Some((head, _)) = raw.split_once('/') {
    raw = head.to_string();
  }
  if let Some((host, port)) = raw.rsplit_once(':') {
    if !host.is_empty() && port.chars().all(|c| c.is_ascii_digit()) {
      raw = host.to_string();
    }
  }
  let raw = raw.trim();
  if raw.is_empty()
    || raw.eq_ignore_ascii_case("localhost")
    || raw == "127.0.0.1"
    || raw == "0.0.0.0"
  {
    return None;
  }
  Some(raw.to_string())
}

fn remote_urls(host: &str) -> [String; 7] {
  [
    format!("http://{host}:3142"),
    format!("ws://{host}:3142/rpc"),
    format!("http://{host}:3132"),
    format!("http://{host}:3134"),
    format!("http://{host}:3138"),
    format!("http://{host}:3140"),
    format!("http://{host}:3136"),
  ]
}

impl InstallerSettings {
  pub fn to_runtime_dto(&self) -> RuntimeConfigDto {
    let host = central_host(self);
    let urls = host.as_deref().map(remote_urls).unwrap_or_else(|| {
      [
        String::new(),
        String::new(),
        String::new(),
        String::new(),
        String::new(),
        String::new(),
        String::new(),
      ]
    });
    RuntimeConfigDto {
      store_name: self.store.store_name.clone(),
      store_address: self.store.store_address.clone(),
      default_language: self.locale.default_language.clone(),
      locale: self.locale.locale.clone(),
      currency: self.locale.currency.clone(),
      currency_symbol: self.locale.currency_symbol.clone(),
      decimal_places: self.locale.decimal_places,
      timezone: self.locale.timezone.clone(),
      date_format: self.locale.date_format.clone(),
      time_format: self.locale.time_format.clone(),
      has_installer_settings: true,
      applied: self.applied,
      central_host: host.unwrap_or_default(),
      gateway_url: urls[0].clone(),
      db_websocket_url: urls[1].clone(),
      print_server_url: urls[2].clone(),
      payment_server_url: urls[3].clone(),
      tracking_server_url: urls[4].clone(),
      api_server_url: urls[5].clone(),
      sync_service_url: urls[6].clone(),
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

pub fn installer_settings_path(app_data: &Path) -> PathBuf {
  app_data.join("installer-settings.json")
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
  let mut cfg = if path.exists() {
    let raw = fs::read_to_string(&path).map_err(|e| format!("read config: {e}"))?;
    let mut cfg: DesktopConfig =
      serde_json::from_str(&raw).map_err(|e| format!("parse config: {e}"))?;
    cfg.ensure_secrets();
    cfg
  } else {
    let mut cfg = DesktopConfig::generate();
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
      if let Some(v) = crate::paths::load_dotenv_value(&root, "INTEGRATION_TOKEN_ENCRYPTION_KEY") {
        cfg.integration_token_encryption_key = v;
      }
    }
    cfg
  };

  // Merge installer encryption key if present and config key empty/generated placeholder.
  if let Ok(inst) = load_installer_settings(app_data) {
    if !inst.integrations.token_encryption_key.trim().is_empty() {
      cfg.integration_token_encryption_key = inst.integrations.token_encryption_key.trim().to_string();
    }
  }
  cfg.ensure_secrets();
  save_config(app_data, &cfg)?;
  Ok(cfg)
}

pub fn save_config(app_data: &Path, cfg: &DesktopConfig) -> Result<(), String> {
  fs::create_dir_all(app_data).map_err(|e| format!("create app data: {e}"))?;
  let path = config_path(app_data);
  let raw = serde_json::to_string_pretty(cfg).map_err(|e| format!("serialize config: {e}"))?;
  fs::write(&path, raw).map_err(|e| format!("write config: {e}"))
}

fn read_installer_file(path: &Path) -> Result<InstallerSettings, String> {
  if !path.is_file() {
    return Err(format!("installer-settings.json not found at {}", path.display()));
  }
  let raw = fs::read_to_string(path).map_err(|e| format!("read installer-settings: {e}"))?;
  // PowerShell 5.1 Set-Content -Encoding UTF8 writes a BOM, which serde rejects.
  let raw = raw.trim_start_matches('\u{feff}');
  serde_json::from_str(raw).map_err(|e| format!("parse installer-settings: {e}"))
}

fn installer_settings_candidates(app_data: &Path) -> Vec<PathBuf> {
  #[cfg(windows)]
  {
    let mut paths = vec![installer_settings_path(app_data)];
    if let Ok(local) = std::env::var("LOCALAPPDATA") {
      let wizard_copy = PathBuf::from(local)
        .join("com.posr.desktop")
        .join("installer-settings.json");
      if wizard_copy != paths[0] {
        paths.push(wizard_copy);
      }
    }
    return paths;
  }
  #[cfg(not(windows))]
  {
    vec![installer_settings_path(app_data)]
  }
}

fn timezone_is_set(settings: &InstallerSettings) -> bool {
  let tz = settings.locale.timezone.trim();
  !tz.is_empty() && !tz.eq_ignore_ascii_case("utc")
}

fn file_mtime(path: &Path) -> std::time::SystemTime {
  fs::metadata(path)
    .and_then(|meta| meta.modified())
    .unwrap_or(std::time::UNIX_EPOCH)
}

pub fn load_installer_settings(app_data: &Path) -> Result<InstallerSettings, String> {
  let mut found: Vec<(PathBuf, InstallerSettings)> = Vec::new();
  let mut last_err = "installer-settings.json not found".to_string();
  for path in installer_settings_candidates(app_data) {
    match read_installer_file(&path) {
      Ok(settings) => found.push((path, settings)),
      Err(err) => last_err = err,
    }
  }
  if found.is_empty() {
    return Err(last_err);
  }

  // The wizard writes LocalAppData. A later launch can create a Roaming copy
  // that is still the UTC placeholder. Prefer a file that names a real zone.
  let configured: Vec<usize> = found
    .iter()
    .enumerate()
    .filter(|(_, (_, settings))| timezone_is_set(settings))
    .map(|(index, _)| index)
    .collect();
  let pool: Vec<usize> = if configured.is_empty() {
    (0..found.len()).collect()
  } else {
    configured
  };
  let best_index = pool
    .into_iter()
    .max_by_key(|index| file_mtime(&found[*index].0))
    .unwrap_or(0);
  let (path, settings) = found.remove(best_index);

  let canonical = installer_settings_path(app_data);
  if path != canonical && timezone_is_set(&settings) {
    let canonical_is_placeholder = match read_installer_file(&canonical) {
      Ok(existing) => !timezone_is_set(&existing),
      Err(_) => true,
    };
    if canonical_is_placeholder {
      let _ = save_installer_settings(app_data, &settings);
    }
  }

  Ok(settings)
}

pub fn save_installer_settings(app_data: &Path, settings: &InstallerSettings) -> Result<(), String> {
  fs::create_dir_all(app_data).map_err(|e| format!("create app data: {e}"))?;
  let path = installer_settings_path(app_data);
  let raw =
    serde_json::to_string_pretty(settings).map_err(|e| format!("serialize installer-settings: {e}"))?;
  fs::write(&path, raw).map_err(|e| format!("write installer-settings: {e}"))
}

pub fn runtime_config_dto(app_data: &Path) -> RuntimeConfigDto {
  match load_installer_settings(app_data) {
    Ok(s) => s.to_runtime_dto(),
    Err(_) => RuntimeConfigDto {
      store_name: String::new(),
      store_address: String::new(),
      default_language: default_language(),
      locale: default_locale(),
      currency: default_currency(),
      currency_symbol: String::new(),
      decimal_places: default_decimals(),
      timezone: default_tz(),
      date_format: default_date(),
      time_format: default_time(),
      has_installer_settings: false,
      applied: false,
      central_host: String::new(),
      gateway_url: String::new(),
      db_websocket_url: String::new(),
      print_server_url: String::new(),
      payment_server_url: String::new(),
      tracking_server_url: String::new(),
      api_server_url: String::new(),
      sync_service_url: String::new(),
    },
  }
}

pub fn is_setup_complete(app_data: &Path) -> bool {
  setup_marker_path(app_data).exists()
}

pub fn mark_setup_complete(app_data: &Path) -> Result<(), String> {
  fs::create_dir_all(app_data).map_err(|e| format!("create app data: {e}"))?;
  fs::write(setup_marker_path(app_data), b"1").map_err(|e| format!("write setup marker: {e}"))
}

/// Mark installer settings applied after schema import / setup.
pub fn mark_installer_applied(app_data: &Path) -> Result<(), String> {
  let mut settings = load_installer_settings(app_data).unwrap_or_default();
  settings.applied = true;
  if settings.integrations.token_encryption_key.trim().is_empty() {
    // keep desktop-config key
  }
  save_installer_settings(app_data, &settings)
}
