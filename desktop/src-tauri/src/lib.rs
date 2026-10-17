mod config;
mod import;
mod logging;
mod paths;
mod sidecars;
#[cfg(feature = "tray")]
mod tray;

use std::collections::HashMap;
use std::sync::Mutex;

use tauri::Manager;
use tauri_plugin_log::{Target, TargetKind};

use logging::LogHub;
use sidecars::SidecarSupervisor;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
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
