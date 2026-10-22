//! Start / stop SurrealDB + Node sidecars (Docker-parity stack).

use std::collections::HashMap;
use std::io::{Read, Write};
use std::net::TcpStream;
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use std::thread;
use std::time::Duration;

use serde::Serialize;
use tauri::{AppHandle, Manager};

#[cfg(windows)]
use std::os::windows::process::CommandExt;

use crate::config::{self, DesktopConfig, InstallerSettings};
use crate::logging::LogHub;
use crate::paths;

#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

pub struct SidecarSupervisor {
  pub children: Mutex<Vec<(String, Child)>>,
  pub app_data: PathBuf,
  pub config: DesktopConfig,
  pub log_hub: LogHub,
  pub statuses: Mutex<HashMap<String, String>>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ServiceStatusDto {
  pub name: String,
  pub status: String,
}

impl SidecarSupervisor {
  pub fn stop_all(&self) {
    if let Ok(mut guard) = self.children.lock() {
      while let Some((name, mut child)) = guard.pop() {
        let pid = child.id();
        match child.kill() {
          Ok(()) => {
            let _ = child.wait();
            self.log_hub.shell(&format!("stopped {name} pid={pid}"));
          }
          Err(err) => self
            .log_hub
            .shell(&format!("failed to stop {name} pid={pid}: {err}")),
        }
      }
    }
  }

  pub fn set_status(&self, name: &str, status: &str) {
    if let Ok(mut g) = self.statuses.lock() {
      g.insert(name.to_string(), status.to_string());
    }
  }

  pub fn snapshot_statuses(&self) -> Vec<ServiceStatusDto> {
    let names = [
      "surreal", "gateway", "print", "payment", "tracking", "api", "sync",
    ];
    let guard = self.statuses.lock().ok();
    names
      .iter()
      .map(|n| {
        let status = guard
          .as_ref()
          .and_then(|g| g.get(*n).cloned())
          .unwrap_or_else(|| "unknown".into());
        ServiceStatusDto {
          name: (*n).to_string(),
          status,
        }
      })
      .collect()
  }

  pub fn refresh_health(&self) {
    let checks: &[(&str, &str, &str)] = &[
      ("surreal", "127.0.0.1:8000", ""),
      ("gateway", "127.0.0.1:3142", "posr-gateway"),
      ("print", "127.0.0.1:3132", "posr-print-server"),
      ("payment", "127.0.0.1:3134", "ok"),
      ("tracking", "127.0.0.1:3138", "ok"),
      ("api", "127.0.0.1:3140", "ok"),
      ("sync", "127.0.0.1:3136", "ok"),
    ];
    for (name, addr, needle) in checks {
      let up = if *name == "surreal" {
        wait_tcp(addr, 1, 0)
      } else {
        http_health(addr, needle)
      };
      self.set_status(name, if up { "up" } else { "down" });
    }
  }
}

fn use_external_services() -> bool {
  matches!(
    std::env::var("POSR_USE_EXTERNAL_SERVICES")
      .ok()
      .as_deref()
      .map(str::trim)
      .map(str::to_ascii_lowercase),
    Some(v) if v == "1" || v == "true" || v == "yes" || v == "on"
  )
}

fn http_health(host_port: &str, needle: &str) -> bool {
  let addr = match host_port.parse() {
    Ok(a) => a,
    Err(_) => return false,
  };
  let Ok(mut stream) = TcpStream::connect_timeout(&addr, Duration::from_millis(400)) else {
    return false;
  };
  let _ = stream.set_read_timeout(Some(Duration::from_millis(600)));
  let _ = stream.set_write_timeout(Some(Duration::from_millis(600)));
  let req = format!("GET /health HTTP/1.0\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n");
  if stream.write_all(req.as_bytes()).is_err() {
    return false;
  }
  let mut buf = Vec::new();
  let _ = stream.read_to_end(&mut buf);
  let body = String::from_utf8_lossy(&buf);
  if needle.is_empty() {
    return body.contains("200");
  }
  body.contains(needle) || body.contains("\"ok\":true")
}

fn wait_tcp(host_port: &str, attempts: u32, delay_ms: u64) -> bool {
  let addr = match host_port.parse() {
    Ok(a) => a,
    Err(_) => return false,
  };
  for _ in 0..attempts {
    if TcpStream::connect_timeout(&addr, Duration::from_millis(300)).is_ok() {
      return true;
    }
    thread::sleep(Duration::from_millis(delay_ms));
  }
  false
}

fn wait_health(host_port: &str, needle: &str, attempts: u32) -> bool {
  for _ in 0..attempts {
    if http_health(host_port, needle) {
      return true;
    }
    thread::sleep(Duration::from_millis(400));
  }
  false
}

fn configure_no_window(cmd: &mut Command) {
  #[cfg(windows)]
  {
    cmd.creation_flags(CREATE_NO_WINDOW);
  }
  let _ = cmd;
}

fn push_child(supervisor: &SidecarSupervisor, name: &str, mut child: Child) {
  let stdout = child.stdout.take();
  let stderr = child.stderr.take();
  supervisor
    .log_hub
    .pump_child_stdio(name, stdout, stderr);
  supervisor
    .log_hub
    .shell(&format!("started {name} pid={}", child.id()));
  supervisor.set_status(name, "starting");
  if let Ok(mut guard) = supervisor.children.lock() {
    guard.push((name.to_string(), child));
  }
}

fn spawn_surreal(
  app: &AppHandle,
  cfg: &DesktopConfig,
  app_data: &Path,
  hub: &LogHub,
) -> Result<Child, String> {
  let bin = paths::resolve_surreal_bin(Some(app));
  let data = config::surreal_data_dir(app_data);
  std::fs::create_dir_all(&data).map_err(|e| format!("surreal data dir: {e}"))?;
  let endpoint = format!("surrealkv://{}", data.display());
  hub.shell(&format!(
    "starting surreal: {} (data={})",
    bin.display(),
    data.display()
  ));
  let mut cmd = Command::new(&bin);
  cmd
    .args([
      "start",
      "--user",
      &cfg.surreal_user,
      "--pass",
      &cfg.surreal_pass,
      "--bind",
      "127.0.0.1:8000",
      &endpoint,
    ])
    .stdin(Stdio::null())
    .stdout(Stdio::piped())
    .stderr(Stdio::piped());
  configure_no_window(&mut cmd);
  cmd
    .spawn()
    .map_err(|e| format!("spawn surreal ({}): {e}", bin.display()))
}

fn apply_ai_env(cmd: &mut Command, ai: &config::InstallerAi) {
  if ai.enabled {
    cmd.env("AI_ENABLED", "true");
  } else {
    cmd.env("AI_ENABLED", "false");
  }
  if !ai.default_profile.is_empty() {
    cmd.env("AI_DEFAULT_PROFILE", &ai.default_profile);
  }
  if !ai.profiles.is_empty() {
    let names: Vec<&str> = ai.profiles.iter().map(|p| p.name.as_str()).collect();
    cmd.env("AI_PROFILES", names.join(","));
  }
  if let Some(d) = ai.daily_limit {
    cmd.env("AI_DAILY_LIMIT", d.to_string());
  }
  if let Some(m) = ai.monthly_limit {
    cmd.env("AI_MONTHLY_LIMIT", m.to_string());
  }
  for p in &ai.profiles {
    if p.name.is_empty() {
      continue;
    }
    let prefix = format!("AI_{}", p.name.to_ascii_uppercase().replace('-', "_"));
    if !p.url.is_empty() {
      cmd.env(format!("{prefix}_URL"), &p.url);
    }
    if !p.key.is_empty() {
      cmd.env(format!("{prefix}_KEY"), &p.key);
    }
    if !p.model.is_empty() {
      cmd.env(format!("{prefix}_MODEL"), &p.model);
    }
    if !p.auth.is_empty() {
      cmd.env(format!("{prefix}_AUTH"), &p.auth);
    }
    if let Some(c) = p.compact {
      cmd.env(format!("{prefix}_COMPACT"), if c { "true" } else { "false" });
    }
  }
}

fn apply_common_env(
  cmd: &mut Command,
  cfg: &DesktopConfig,
  origins: &str,
  installer: Option<&InstallerSettings>,
) {
  cmd
    .env("SURREAL_USER", &cfg.surreal_user)
    .env("SURREAL_PASS", &cfg.surreal_pass)
    .env("SURREAL_NS", &cfg.surreal_ns)
    .env("SURREAL_DB", &cfg.surreal_db)
    .env("SURREAL_NAMESPACE", &cfg.surreal_ns)
    .env("SURREAL_DATABASE", &cfg.surreal_db)
    .env("GATEWAY_JWT_SECRET", &cfg.gateway_jwt_secret)
    .env("GATEWAY_AUTH_REQUIRED", "true")
    .env("GATEWAY_ALLOWED_ORIGINS", origins)
    .env("PAYMENT_ALLOWED_ORIGINS", origins)
    .env("API_ALLOWED_ORIGINS", origins)
    .env("ALLOWED_ORIGINS", origins)
    .env("SURREAL_URL", "ws://127.0.0.1:8000/rpc")
    .env("TRACKING_DB_URL", "ws://127.0.0.1:8000/rpc")
    .env("TRACKING_DB_NS", &cfg.surreal_ns)
    .env("TRACKING_DB_NAME", &cfg.surreal_db)
    .env("TRACKING_DB_USER", &cfg.surreal_user)
    .env("TRACKING_DB_PASS", &cfg.surreal_pass)
    .env("SYNC_SOURCE_URL", "ws://127.0.0.1:8000/rpc")
    .env("SYNC_SOURCE_NS", &cfg.surreal_ns)
    .env("SYNC_SOURCE_DB", &cfg.surreal_db)
    .env("SYNC_SOURCE_USER", &cfg.surreal_user)
    .env("SYNC_SOURCE_PASS", &cfg.surreal_pass)
    .env(
      "INTEGRATION_TOKEN_ENCRYPTION_KEY",
      &cfg.integration_token_encryption_key,
    )
    .env(
      "PAYMENT_CREDENTIAL_ENCRYPTION_KEY",
      &cfg.integration_token_encryption_key,
    );

  if let Some(inst) = installer {
    apply_ai_env(cmd, &inst.ai);
    let integ = &inst.integrations;
    if !integ.qbo_client_id.is_empty() {
      cmd.env("QBO_CLIENT_ID", &integ.qbo_client_id);
    }
    if !integ.qbo_client_secret.is_empty() {
      cmd.env("QBO_CLIENT_SECRET", &integ.qbo_client_secret);
    }
    if !integ.qbo_redirect_uri.is_empty() {
      cmd.env("QBO_REDIRECT_URI", &integ.qbo_redirect_uri);
    }
    if !integ.qbo_env.is_empty() {
      cmd.env("QBO_ENV", &integ.qbo_env);
    }
  }
}

fn spawn_node_service(
  app: &AppHandle,
  cfg: &DesktopConfig,
  origins: &str,
  installer: Option<&InstallerSettings>,
  service_folder: &str,
  label: &str,
  extra_env: &[(&str, &str)],
  hub: &LogHub,
) -> Result<Child, String> {
  let dir = paths::resolve_service_dir(Some(app), service_folder).ok_or_else(|| {
    let resource = app
      .path()
      .resource_dir()
      .map(|p| p.display().to_string())
      .unwrap_or_else(|_| "(unavailable)".into());
    let exe = std::env::current_exe()
      .ok()
      .and_then(|p| p.parent().map(|d| d.display().to_string()))
      .unwrap_or_else(|| "(unavailable)".into());
    format!(
      "{service_folder}/ not found (looked under resource_dir={resource} and exe_dir={exe}; expected resources/sidecars/{service_folder})"
    )
  })?;
  let node = paths::resolve_node_bin(Some(app));
  let server_js = dir.join("server.js");
  if !server_js.exists() {
    return Err(format!("{} missing in {}", server_js.display(), dir.display()));
  }
  hub.shell(&format!(
    "starting {label}: {} {} (cwd={})",
    node.display(),
    server_js.display(),
    dir.display()
  ));
  hub.shell(&format!(
    "env ok: jwt=set surreal=set origins_len={} integration_key=set",
    origins.len()
  ));
  let mut cmd = Command::new(&node);
  cmd
    .arg(&server_js)
    .current_dir(&dir)
    .stdin(Stdio::null())
    .stdout(Stdio::piped())
    .stderr(Stdio::piped());
  configure_no_window(&mut cmd);
  apply_common_env(&mut cmd, cfg, origins, installer);
  for (k, v) in extra_env {
    cmd.env(k, v);
  }
  cmd
    .spawn()
    .map_err(|e| format!("spawn {label} ({}): {e}", node.display()))
}

fn skip_migrations() -> bool {
  matches!(
    std::env::var("POSR_SKIP_MIGRATIONS")
      .ok()
      .as_deref()
      .map(str::trim)
      .map(str::to_ascii_lowercase),
    Some(v) if v == "1" || v == "true" || v == "yes" || v == "on"
  )
}

fn node_path_with(modules: &Path) -> String {
  let mut paths = vec![modules.to_path_buf()];
  if let Some(existing) = std::env::var_os("NODE_PATH") {
    paths.extend(std::env::split_paths(&existing));
  }
  std::env::join_paths(&paths)
    .map(|s| s.to_string_lossy().into_owned())
    .unwrap_or_else(|_| modules.display().to_string())
}

fn log_bytes(hub: &LogHub, source: &str, bytes: &[u8]) {
  let text = String::from_utf8_lossy(bytes);
  for line in text.lines() {
    hub.append(source, line);
  }
}

/// Same runner as Docker Compose `migrate`: baseline `latest.surql` on an empty
/// database, then pending files tracked in `_schema_migration`.
fn run_schema_migrations(app: &AppHandle, cfg: &DesktopConfig, app_data: &Path, hub: &LogHub) {
  if skip_migrations() {
    hub.shell("POSR_SKIP_MIGRATIONS set — not applying schema");
    return;
  }
  let Some(script) = paths::resolve_migration_runner(Some(app)) else {
    hub.shell("schema migrations skipped — run-prod-migrations.cjs not found");
    return;
  };
  let Some(migrations_dir) = script.parent().and_then(|p| p.parent()) else {
    hub.shell("schema migrations skipped — could not resolve migrations directory");
    return;
  };
  let Some(payments) = paths::resolve_service_dir(Some(app), "payments") else {
    hub.shell("schema migrations skipped — payments/ not found (needed for surrealdb)");
    return;
  };
  let modules = payments.join("node_modules");
  if !modules.join("surrealdb").is_dir() || !modules.join("ws").is_dir() {
    hub.shell(&format!(
      "schema migrations skipped — surrealdb/ws missing in {}",
      modules.display()
    ));
    return;
  }

  let node = paths::resolve_node_bin(Some(app));
  hub.shell(&format!(
    "applying schema migrations: {} {}",
    node.display(),
    script.display()
  ));

  let mut cmd = Command::new(&node);
  cmd
    .arg(&script)
    .current_dir(migrations_dir)
    .env("SURREAL_URL", "ws://127.0.0.1:8000/rpc")
    .env("SURREAL_NS", &cfg.surreal_ns)
    .env("SURREAL_DB", &cfg.surreal_db)
    .env("SURREAL_USER", &cfg.surreal_user)
    .env("SURREAL_PASS", &cfg.surreal_pass)
    .env("MIGRATIONS_DIR", migrations_dir)
    .env("PAYMENTS_ROOT", &payments)
    .env("NODE_PATH", node_path_with(&modules))
    .env(
      "INTEGRATION_TOKEN_ENCRYPTION_KEY",
      &cfg.integration_token_encryption_key,
    )
    .env(
      "PAYMENT_CREDENTIAL_ENCRYPTION_KEY",
      &cfg.integration_token_encryption_key,
    )
    .stdin(Stdio::null())
    .stdout(Stdio::piped())
    .stderr(Stdio::piped());
  configure_no_window(&mut cmd);

  match cmd.output() {
    Ok(output) => {
      log_bytes(hub, "migrate", &output.stdout);
      log_bytes(hub, "migrate", &output.stderr);
      if output.status.success() {
        match config::mark_setup_complete(app_data) {
          Ok(()) => hub.shell("schema migrations finished"),
          Err(err) => hub.shell(&format!("schema migrations finished; setup marker failed: {err}")),
        }
      } else {
        let code = output
          .status
          .code()
          .map(|c| c.to_string())
          .unwrap_or_else(|| "signal".into());
        hub.shell(&format!(
          "schema migrations failed (exit {code}) — database setup screen will stay available"
        ));
      }
    }
    Err(err) => hub.shell(&format!("schema migrations failed to start: {err}")),
  }
}

pub fn start_all(app: &AppHandle) -> Result<SidecarSupervisor, String> {
  let app_data = paths::resolve_app_data(app)?;
  let cfg = config::load_or_create_config(&app_data)?;
  let installer = config::load_installer_settings(&app_data).ok();
  let repo = paths::resolve_repo_root();
  let origins = paths::allowed_origins(repo.as_deref());
  let log_hub = LogHub::new(&app_data);
  log_hub.shell("sidecar supervisor starting");

  let supervisor = SidecarSupervisor {
    children: Mutex::new(Vec::new()),
    app_data: app_data.clone(),
    config: cfg.clone(),
    log_hub: log_hub.clone(),
    statuses: Mutex::new(HashMap::new()),
  };

  if use_external_services() {
    log_hub.shell("POSR_USE_EXTERNAL_SERVICES=1 — not spawning bundled sidecars");
    return Ok(supervisor);
  }

  let spawned_surreal = if !wait_tcp("127.0.0.1:8000", 1, 0) {
    let child = spawn_surreal(app, &cfg, &app_data, &log_hub)?;
    push_child(&supervisor, "surreal", child);
    if !wait_tcp("127.0.0.1:8000", 40, 250) {
      return Err("SurrealDB did not become ready on 127.0.0.1:8000".into());
    }
    supervisor.set_status("surreal", "up");
    true
  } else {
    log_hub.shell("Surreal already listening on :8000 — reusing");
    supervisor.set_status("surreal", "up");
    false
  };

  if spawned_surreal {
    run_schema_migrations(app, &cfg, &app_data, &log_hub);
  } else {
    log_hub.shell("skipping schema migrations — Surreal on :8000 was already running");
  }

  if !http_health("127.0.0.1:3142", "posr-gateway") {
    let child = spawn_node_service(
      app,
      &cfg,
      &origins,
      installer.as_ref(),
      "gateway",
      "gateway",
      &[
        ("GATEWAY_HOST", "0.0.0.0"),
        ("GATEWAY_PORT", "3142"),
      ],
      &log_hub,
    )?;
    push_child(&supervisor, "gateway", child);
    if !wait_health("127.0.0.1:3142", "posr-gateway", 40) {
      return Err("Gateway did not become healthy on :3142".into());
    }
    supervisor.set_status("gateway", "up");
  } else {
    log_hub.shell("gateway already healthy — reusing");
    supervisor.set_status("gateway", "up");
  }

  let services: &[(&str, &str, &[(&str, &str)], &str, &str)] = &[
    (
      "printing",
      "print",
      &[
        ("PRINT_HOST", "127.0.0.1"),
        ("PRINT_PORT", "3132"),
      ],
      "127.0.0.1:3132",
      "posr-print-server",
    ),
    (
      "payments",
      "payment",
      &[
        ("PAYMENT_HOST", "127.0.0.1"),
        ("PAYMENT_PORT", "3134"),
        ("PAYMENT_BASE_URL", "http://127.0.0.1:3134"),
      ],
      "127.0.0.1:3134",
      "ok",
    ),
    (
      "tracking-api",
      "tracking",
      &[
        ("TRACKING_HOST", "127.0.0.1"),
        ("TRACKING_PORT", "3138"),
      ],
      "127.0.0.1:3138",
      "ok",
    ),
    (
      "api",
      "api",
      &[
        ("API_HOST", "127.0.0.1"),
        ("API_PORT", "3140"),
      ],
      "127.0.0.1:3140",
      "ok",
    ),
    (
      "sync-service",
      "sync",
      &[
        ("SYNC_SERVICE_HOST", "127.0.0.1"),
        ("SYNC_SERVICE_PORT", "3136"),
        ("SYNC_CLIENT_ID", "posr-desktop-local"),
        (
          "SYNC_ALLOWED_ORIGINS",
          "http://tauri.localhost,https://tauri.localhost,http://localhost:5173,http://127.0.0.1:5173",
        ),
      ],
      "127.0.0.1:3136",
      "ok",
    ),
  ];

  for (folder, label, env, health_addr, needle) in services {
    if http_health(health_addr, needle) {
      log_hub.shell(&format!("{label} already healthy — reusing"));
      supervisor.set_status(label, "up");
      continue;
    }
    match spawn_node_service(
      app,
      &cfg,
      &origins,
      installer.as_ref(),
      folder,
      label,
      env,
      &log_hub,
    ) {
      Ok(child) => {
        push_child(&supervisor, label, child);
        if wait_health(health_addr, needle, 20) {
          supervisor.set_status(label, "up");
        } else {
          supervisor.set_status(label, "starting");
        }
      }
      Err(err) => {
        if *label == "sync" {
          log_hub.shell(&format!("sync skipped: {err}"));
          supervisor.set_status(label, "down");
        } else {
          log_hub.shell(&format!("WARN {label}: {err}"));
          supervisor.set_status(label, "down");
        }
      }
    }
  }

  let _ = wait_health("127.0.0.1:3132", "posr-print-server", 25);
  supervisor.refresh_health();
  Ok(supervisor)
}
