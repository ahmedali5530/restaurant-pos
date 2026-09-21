//! Start / stop SurrealDB + Node sidecars (Docker-parity stack).

use std::io::{Read, Write};
use std::net::TcpStream;
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use std::thread;
use std::time::Duration;

use tauri::AppHandle;

use crate::config::{self, DesktopConfig};
use crate::paths;

pub struct SidecarSupervisor {
  pub children: Mutex<Vec<(String, Child)>>,
  pub app_data: PathBuf,
  pub config: DesktopConfig,
}

impl SidecarSupervisor {
  pub fn stop_all(&self) {
    if let Ok(mut guard) = self.children.lock() {
      while let Some((name, mut child)) = guard.pop() {
        let pid = child.id();
        match child.kill() {
          Ok(()) => {
            let _ = child.wait();
            eprintln!("[posr-desktop] stopped {name} pid={pid}");
          }
          Err(err) => eprintln!("[posr-desktop] failed to stop {name} pid={pid}: {err}"),
        }
      }
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

fn push_child(supervisor: &SidecarSupervisor, name: &str, child: Child) {
  eprintln!("[posr-desktop] started {name} pid={}", child.id());
  if let Ok(mut guard) = supervisor.children.lock() {
    guard.push((name.to_string(), child));
  }
}

fn spawn_surreal(
  app: &AppHandle,
  cfg: &DesktopConfig,
  app_data: &Path,
) -> Result<Child, String> {
  let bin = paths::resolve_surreal_bin(Some(app));
  let data = config::surreal_data_dir(app_data);
  std::fs::create_dir_all(&data).map_err(|e| format!("surreal data dir: {e}"))?;
  let endpoint = format!("surrealkv://{}", data.display());
  eprintln!(
    "[posr-desktop] starting surreal: {} (data={})",
    bin.display(),
    data.display()
  );
  Command::new(&bin)
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
    .stdout(Stdio::inherit())
    .stderr(Stdio::inherit())
    .spawn()
    .map_err(|e| format!("spawn surreal ({}): {e}", bin.display()))
}

fn apply_common_env(
  cmd: &mut Command,
  cfg: &DesktopConfig,
  origins: &str,
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
    .env("SYNC_SOURCE_PASS", &cfg.surreal_pass);
}

fn spawn_node_service(
  app: &AppHandle,
  cfg: &DesktopConfig,
  origins: &str,
  service_folder: &str,
  label: &str,
  extra_env: &[(&str, &str)],
) -> Result<Child, String> {
  let dir = paths::resolve_service_dir(Some(app), service_folder)
    .ok_or_else(|| format!("{service_folder}/ not found (set POSR_REPO_ROOT or package resources)"))?;
  let node = paths::resolve_node_bin(Some(app));
  let server_js = dir.join("server.js");
  if !server_js.exists() {
    return Err(format!("{} missing in {}", server_js.display(), dir.display()));
  }
  eprintln!(
    "[posr-desktop] starting {label}: {} {} (cwd={})",
    node.display(),
    server_js.display(),
    dir.display()
  );
  let mut cmd = Command::new(&node);
  cmd
    .arg(&server_js)
    .current_dir(&dir)
    .stdin(Stdio::null())
    .stdout(Stdio::inherit())
    .stderr(Stdio::inherit());
  apply_common_env(&mut cmd, cfg, origins);
  for (k, v) in extra_env {
    cmd.env(k, v);
  }
  cmd
    .spawn()
    .map_err(|e| format!("spawn {label} ({}): {e}", node.display()))
}

pub fn start_all(app: &AppHandle) -> Result<SidecarSupervisor, String> {
  let app_data = paths::resolve_app_data(app)?;
  let cfg = config::load_or_create_config(&app_data)?;
  let repo = paths::resolve_repo_root();
  let origins = paths::allowed_origins(repo.as_deref());

  let supervisor = SidecarSupervisor {
    children: Mutex::new(Vec::new()),
    app_data: app_data.clone(),
    config: cfg.clone(),
  };

  if use_external_services() {
    eprintln!("[posr-desktop] POSR_USE_EXTERNAL_SERVICES=1 — not spawning bundled sidecars");
    return Ok(supervisor);
  }

  // Surreal
  if !wait_tcp("127.0.0.1:8000", 1, 0) {
    let child = spawn_surreal(app, &cfg, &app_data)?;
    push_child(&supervisor, "surreal", child);
    if !wait_tcp("127.0.0.1:8000", 40, 250) {
      return Err("SurrealDB did not become ready on 127.0.0.1:8000".into());
    }
  } else {
    eprintln!("[posr-desktop] Surreal already listening on :8000 — reusing");
  }

  // Gateway
  if !http_health("127.0.0.1:3142", "posr-gateway") {
    let child = spawn_node_service(
      app,
      &cfg,
      &origins,
      "gateway",
      "gateway",
      &[
        ("GATEWAY_HOST", "127.0.0.1"),
        ("GATEWAY_PORT", "3142"),
      ],
    )?;
    push_child(&supervisor, "gateway", child);
    if !wait_health("127.0.0.1:3142", "posr-gateway", 40) {
      return Err("Gateway did not become healthy on :3142".into());
    }
  } else {
    eprintln!("[posr-desktop] gateway already healthy — reusing");
  }

  // Remaining Node services (parallel-ish sequential spawn)
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
      ],
      "127.0.0.1:3136",
      "ok",
    ),
  ];

  for (folder, label, env, health_addr, needle) in services {
    if http_health(health_addr, needle) {
      eprintln!("[posr-desktop] {label} already healthy — reusing");
      continue;
    }
    match spawn_node_service(app, &cfg, &origins, folder, label, env) {
      Ok(child) => push_child(&supervisor, label, child),
      Err(err) => {
        // sync is optional-ish; log and continue. Others are required for full POS.
        if *label == "sync" {
          eprintln!("[posr-desktop] sync skipped: {err}");
        } else {
          eprintln!("[posr-desktop] WARN {label}: {err}");
        }
      }
    }
  }

  // Best-effort wait for print (most critical after gateway)
  let _ = wait_health("127.0.0.1:3132", "posr-print-server", 25);

  Ok(supervisor)
}
