mod config;
mod import;
mod paths;
mod sidecars;

use std::sync::Mutex;

use tauri::Manager;

use sidecars::SidecarSupervisor;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_dialog::init())
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }

      match sidecars::start_all(app.handle()) {
        Ok(supervisor) => {
          app.manage(supervisor);
        }
        Err(err) => {
          eprintln!("[posr-desktop] sidecar start error: {err}");
          // Still manage an empty supervisor so commands work after manual recovery.
          let app_data = paths::resolve_app_data(app.handle()).unwrap_or_else(|_| {
            std::env::temp_dir().join("posr-desktop-fallback")
          });
          let cfg = config::load_or_create_config(&app_data).unwrap_or_else(|_| {
            config::DesktopConfig::generate()
          });
          app.manage(SidecarSupervisor {
            children: Mutex::new(Vec::new()),
            app_data,
            config: cfg,
          });
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
