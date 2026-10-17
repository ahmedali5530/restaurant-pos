//! SurrealQL import + desktop status / logs / runtime config Tauri commands.

use std::path::PathBuf;
use std::process::Command;

/// Dump files redefine indexes and `field.*` types that Surreal 3 rejects once
/// `run-prod-migrations` has already created the schema. `INSERT IGNORE` keeps
/// demo rows that are new and skips migration names already recorded.
fn relax_import_sql(raw: &str) -> String {
  let mut out = String::with_capacity(raw.len());
  for line in raw.split_inclusive('\n') {
    let newline = line.ends_with('\n');
    let content = line.trim_end_matches(['\n', '\r']);
    let trimmed = content.trim_start();
    let indent_len = content.len() - trimmed.len();
    if let Some(rest) = trimmed.strip_prefix("DEFINE FIELD ") {
      let name = rest.split_whitespace().next().unwrap_or("");
      if name.contains(".*") {
        continue;
      }
    }
    if trimmed.starts_with("INSERT ") && !trimmed.starts_with("INSERT IGNORE") {
      out.push_str(&content[..indent_len]);
      out.push_str("INSERT IGNORE ");
      out.push_str(&trimmed["INSERT ".len()..]);
      if newline {
        out.push('\n');
      }
      continue;
    }
    out.push_str(line);
  }
  out
}

use serde::Serialize;
use tauri::{AppHandle, State};

use crate::config::{self, RuntimeConfigDto};
use crate::logging;
use crate::paths;
use crate::sidecars::{ServiceStatusDto, SidecarSupervisor};

#[cfg(windows)]
use std::os::windows::process::CommandExt;

#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DesktopStatus {
  pub is_desktop: bool,
  pub needs_setup: bool,
  pub surreal_ready: bool,
  pub gateway_ready: bool,
  pub setup_complete: bool,
  pub app_data: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportResult {
  pub ok: bool,
  pub imported: Vec<String>,
  pub error: Option<String>,
}

fn tcp_up(addr: &str) -> bool {
  use std::net::TcpStream;
  use std::time::Duration;
  let Ok(parsed) = addr.parse() else {
    return false;
  };
  TcpStream::connect_timeout(&parsed, Duration::from_millis(300)).is_ok()
}

fn health_ok(addr: &str, needle: &str) -> bool {
  use std::io::{Read, Write};
  use std::net::TcpStream;
  use std::time::Duration;
  let Ok(parsed) = addr.parse() else {
    return false;
  };
  let Ok(mut stream) = TcpStream::connect_timeout(&parsed, Duration::from_millis(400)) else {
    return false;
  };
  let _ = stream.set_read_timeout(Some(Duration::from_millis(500)));
  let req = b"GET /health HTTP/1.0\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n";
  if stream.write_all(req).is_err() {
    return false;
  }
  let mut buf = Vec::new();
  let _ = stream.read_to_end(&mut buf);
  let body = String::from_utf8_lossy(&buf);
  body.contains(needle) || body.contains("\"ok\":true")
}

#[tauri::command]
pub fn desktop_status(
  app: AppHandle,
  supervisor: State<'_, SidecarSupervisor>,
) -> Result<DesktopStatus, String> {
  let app_data = supervisor.app_data.clone();
  let setup_complete = config::is_setup_complete(&app_data);
  let surreal_ready = tcp_up("127.0.0.1:8000");
  let gateway_ready = health_ok("127.0.0.1:3142", "posr-gateway");
  let needs_setup = !setup_complete;
  let _ = app;
  Ok(DesktopStatus {
    is_desktop: true,
    needs_setup,
    surreal_ready,
    gateway_ready,
    setup_complete,
    app_data: app_data.display().to_string(),
  })
}

#[tauri::command]
pub fn mark_setup_complete(supervisor: State<'_, SidecarSupervisor>) -> Result<(), String> {
  let _ = config::mark_installer_applied(&supervisor.app_data);
  config::mark_setup_complete(&supervisor.app_data)
}

#[tauri::command]
pub fn import_surql(
  app: AppHandle,
  supervisor: State<'_, SidecarSupervisor>,
  paths: Vec<String>,
) -> Result<ImportResult, String> {
  if paths.is_empty() {
    return Ok(ImportResult {
      ok: false,
      imported: vec![],
      error: Some("No files selected".into()),
    });
  }

  let cfg = &supervisor.config;
  let surreal = paths::resolve_surreal_bin(Some(&app));
  let mut imported = Vec::new();

  for path_str in &paths {
    let path = PathBuf::from(path_str);
    if !path.exists() {
      return Ok(ImportResult {
        ok: false,
        imported,
        error: Some(format!("File not found: {path_str}")),
      });
    }
    if path
      .extension()
      .and_then(|e| e.to_str())
      .map(|e| e.eq_ignore_ascii_case("surql"))
      != Some(true)
    {
      return Ok(ImportResult {
        ok: false,
        imported,
        error: Some(format!("Not a .surql file: {path_str}")),
      });
    }

    supervisor
      .log_hub
      .shell(&format!("importing {}", path.display()));
    let raw = std::fs::read_to_string(&path).map_err(|e| format!("read {}: {e}", path.display()))?;
    let relaxed = relax_import_sql(&raw);
    let tmp = std::env::temp_dir().join(format!(
      "posr-import-{}-{}.surql",
      std::process::id(),
      imported.len()
    ));
    std::fs::write(&tmp, relaxed).map_err(|e| format!("write temp import: {e}"))?;
    let mut cmd = Command::new(&surreal);
    cmd.args([
      "import",
      "--endpoint",
      "http://127.0.0.1:8000",
      "--username",
      &cfg.surreal_user,
      "--password",
      &cfg.surreal_pass,
      "--namespace",
      &cfg.surreal_ns,
      "--database",
      &cfg.surreal_db,
    ])
    .arg(&tmp);
    #[cfg(windows)]
    {
      cmd.creation_flags(CREATE_NO_WINDOW);
    }
    let output = cmd.output();
    let _ = std::fs::remove_file(&tmp);
    let output = output.map_err(|e| format!("failed to run surreal import: {e}"))?;

    let stderr = String::from_utf8_lossy(&output.stderr);
    let stdout = String::from_utf8_lossy(&output.stdout);
    for line in stderr.lines().chain(stdout.lines()) {
      supervisor.log_hub.append("import", line);
    }

    if !output.status.success() {
      return Ok(ImportResult {
        ok: false,
        imported,
        error: Some(format!(
          "Import failed for {}: {} {}",
          path.display(),
          stderr.trim(),
          stdout.trim()
        )),
      });
    }
    imported.push(path.display().to_string());
  }

  let _ = config::mark_installer_applied(&supervisor.app_data);

  Ok(ImportResult {
    ok: true,
    imported,
    error: None,
  })
}

#[tauri::command]
pub async fn pick_surql_files(app: AppHandle) -> Result<Vec<String>, String> {
  use tauri_plugin_dialog::DialogExt;
  let files = app
    .dialog()
    .file()
    .add_filter("SurrealQL", &["surql"])
    .set_title("Select SurrealQL file(s) to import")
    .blocking_pick_files();
  Ok(
    files
      .unwrap_or_default()
      .into_iter()
      .filter_map(|f| f.into_path().ok())
      .map(|p| p.display().to_string())
      .collect(),
  )
}

#[tauri::command]
pub fn open_migrations_folder(app: AppHandle) -> Result<String, String> {
  paths::resolve_migrations_dir(Some(&app))
    .map(|p| p.display().to_string())
    .ok_or_else(|| "migrations folder not found".into())
}

#[tauri::command]
pub fn get_service_status(
  supervisor: State<'_, SidecarSupervisor>,
) -> Result<Vec<ServiceStatusDto>, String> {
  supervisor.refresh_health();
  Ok(supervisor.snapshot_statuses())
}

#[tauri::command]
pub fn get_log_tail(
  supervisor: State<'_, SidecarSupervisor>,
  source: Option<String>,
  lines: Option<usize>,
) -> Result<Vec<String>, String> {
  let max = lines.unwrap_or(500).clamp(50, 5000);
  Ok(supervisor.log_hub.tail(source.as_deref(), max))
}

#[tauri::command]
pub fn open_logs_dir(supervisor: State<'_, SidecarSupervisor>) -> Result<String, String> {
  let dir = supervisor.log_hub.logs_dir();
  std::fs::create_dir_all(&dir).map_err(|e| format!("logs dir: {e}"))?;
  logging::open_logs_dir(&dir)?;
  Ok(dir.display().to_string())
}

#[tauri::command]
pub fn clear_logs(supervisor: State<'_, SidecarSupervisor>) -> Result<(), String> {
  supervisor.log_hub.clear_ring();
  Ok(())
}

#[tauri::command]
pub fn get_runtime_config(
  supervisor: State<'_, SidecarSupervisor>,
) -> Result<RuntimeConfigDto, String> {
  Ok(config::runtime_config_dto(&supervisor.app_data))
}
