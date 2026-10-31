mod config;
mod import;
mod lan_ui;
mod logging;
mod paths;
mod sidecars;
mod webview_cache;
#[cfg(feature = "tray")]
mod tray;

use std::collections::HashMap;
use std::sync::Mutex;

use tauri::Manager;
use tauri_plugin_log::{Target, TargetKind};

use logging::LogHub;
use sidecars::SidecarSupervisor;

/// Keep loopback traffic off proxy auto-discovery. WebKit otherwise waits on
/// that lookup when the machine has no network, including for 127.0.0.1.
/// WebView2 otherwise sends loopback through proxy discovery and can freeze
/// the window when Windows reports no network.
fn allow_webview_loopback_offline() {
  #[cfg(target_os = "windows")]
  {
    const bypass: &str = "--proxy-bypass-list=<-loopback>;127.0.0.1;localhost;<local>";
    let current = std::env::var("WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS").unwrap_or_default();
    if current.contains("proxy-bypass-list") {
      return;
    }
    let next = if current.trim().is_empty() {
      bypass.to_string()
    } else {
      format!("{current} {bypass}")
    };
    std::env::set_var("WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS", next);
  }
}

fn allow_loopback_without_proxy() {
  for key in ["no_proxy", "NO_PROXY"] {
    let current = std::env::var(key).unwrap_or_default();
    let mut parts: Vec<String> = current
      .split(',')
      .map(str::trim)
      .filter(|part| !part.is_empty())
      .map(str::to_string)
      .collect();
    for host in ["localhost", "127.0.0.1", "::1"] {
      if !parts.iter().any(|part| part.eq_ignore_ascii_case(host)) {
        parts.push(host.to_string());
      }
    }
    std::env::set_var(key, parts.join(","));
  }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  allow_loopback_without_proxy();
  allow_webview_loopback_offline();
  // Before any window exists, so a new install cannot open a cached UI.
  webview_cache::clear_if_stale();
  tauri::Builder::default()
    .plugin(tauri_plugin_dialog::init())
    .setup(|app| {
      let app_data = paths::resolve_app_data(app.handle()).unwrap_or_else(|_| {
        std::env::temp_dir().join("posr-desktop-fallback")
      });
      let _ = std::fs::create_dir_all(app_data.join("logs"));

      app.handle().plugin(
        tauri_plugin_log::Builder::default()
          .level(log::LevelFilter::Info)
          .targets([
            Target::new(TargetKind::Stdout),
            Target::new(TargetKind::LogDir {
              file_name: Some("posr-desktop".into()),
            }),
          ])
          .build(),
      )?;

      match sidecars::start_all(app.handle()) {
        Ok(supervisor) => {
          app.manage(supervisor);
        }
        Err(err) => {
          eprintln!("[posr-desktop] sidecar start error: {err}");
          let cfg = config::load_or_create_config(&app_data).unwrap_or_else(|_| {
            config::DesktopConfig::generate()
          });
          let hub = LogHub::new(&app_data);
          hub.shell(&format!("sidecar start error: {err}"));
          app.manage(SidecarSupervisor {
            children: Mutex::new(Vec::new()),
            app_data: app_data.clone(),
            config: cfg,
            log_hub: hub,
            statuses: Mutex::new(HashMap::new()),
          });
        }
      }

      #[cfg(feature = "tray")]
      {
        if let Err(err) = tray::setup_tray(app.handle()) {
          eprintln!("[posr-desktop] tray setup failed: {err}");
        }
      }

      Ok(())
    })
    .invoke_handler(tauri::generate_handler![
      import::desktop_status,
      import::mark_setup_complete,
      import::import_surql,
      import::pick_surql_files,
      import::open_migrations_folder,
      import::get_service_status,
      import::get_log_tail,
      import::open_logs_dir,
      import::clear_logs,
      import::get_runtime_config,
    ])
    .build(tauri::generate_context!())
    .expect("error while building tauri application")
    .run(|app_handle, event| {
      if let tauri::RunEvent::Exit = event {
        if let Some(state) = app_handle.try_state::<SidecarSupervisor>() {
          state.inner().stop_all();
        }
      }
    });
}
