//! SurrealQL import + desktop status Tauri commands.

use std::path::PathBuf;
use std::process::Command;

use serde::Serialize;
use tauri::{AppHandle, Manager, State};

use crate::config;
use crate::paths;
use crate::sidecars::SidecarSupervisor;

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
  // Needs setup until the operator marks complete after at least one import path.
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

    eprintln!(
      "[posr-desktop] importing {} via {}",
      path.display(),
      surreal.display()
    );
    let output = Command::new(&surreal)
      .args([
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
      .arg(&path)
      .output()
      .map_err(|e| format!("failed to run surreal import: {e}"))?;

    if !output.status.success() {
      let stderr = String::from_utf8_lossy(&output.stderr);
      let stdout = String::from_utf8_lossy(&output.stdout);
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
  // Prefer packaged samples, then repo migrations/
  if let Ok(resource) = app.path().resource_dir() {
    let p = resource.join("migrations");
    if p.is_dir() {
      return Ok(p.display().to_string());
    }
  }
  if let Some(root) = paths::resolve_repo_root() {
    let p = root.join("migrations");
    if p.is_dir() {
      return Ok(p.display().to_string());
    }
  }
  Err("migrations folder not found".into())
}
