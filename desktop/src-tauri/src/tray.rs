//! System tray with service status badges.

use std::sync::Mutex;
use std::thread;
use std::time::Duration;

use tauri::menu::{MenuBuilder, MenuItemBuilder, PredefinedMenuItem, SubmenuBuilder};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Manager};

use crate::logging;
use crate::sidecars::SidecarSupervisor;

pub fn setup_tray(app: &AppHandle) -> Result<(), Box<dyn std::error::Error>> {
  let show = MenuItemBuilder::with_id("show", "Show POSR").build(app)?;
  let open_logs = MenuItemBuilder::with_id("open_logs", "Open logs folder").build(app)?;
  let quit = MenuItemBuilder::with_id("quit", "Quit").build(app)?;

  let surreal = MenuItemBuilder::with_id("st_surreal", "Surreal: …").enabled(false).build(app)?;
  let gateway = MenuItemBuilder::with_id("st_gateway", "Gateway: …").enabled(false).build(app)?;
  let print = MenuItemBuilder::with_id("st_print", "Print: …").enabled(false).build(app)?;
  let payment = MenuItemBuilder::with_id("st_payment", "Payment: …").enabled(false).build(app)?;
  let tracking = MenuItemBuilder::with_id("st_tracking", "Tracking: …").enabled(false).build(app)?;
  let api = MenuItemBuilder::with_id("st_api", "API: …").enabled(false).build(app)?;
  let sync = MenuItemBuilder::with_id("st_sync", "Sync: …").enabled(false).build(app)?;

  let services = SubmenuBuilder::new(app, "Services")
    .item(&surreal)
    .item(&gateway)
    .item(&print)
    .item(&payment)
    .item(&tracking)
    .item(&api)
    .item(&sync)
    .build()?;

  let menu = MenuBuilder::new(app)
    .item(&show)
    .item(&services)
    .separator()
    .item(&open_logs)
    .item(&PredefinedMenuItem::separator(app)?)
    .item(&quit)
    .build()?;

  let status_items = Mutex::new(vec![
    surreal, gateway, print, payment, tracking, api, sync,
  ]);
  app.manage(status_items);

  let _tray = TrayIconBuilder::new()
    .icon(app.default_window_icon().cloned().expect("default icon"))
    .menu(&menu)
    .tooltip("POSR Desktop")
    .on_menu_event(|app, event| {
      match event.id().as_ref() {
        "show" => {
          if let Some(w) = app.get_webview_window("main") {
            let _ = w.show();
            let _ = w.set_focus();
          }
        }
        "open_logs" => {
          if let Some(state) = app.try_state::<SidecarSupervisor>() {
            let dir = state.log_hub.logs_dir();
            let _ = logging::open_logs_dir(&dir);
          }
        }
        "quit" => {
          if let Some(state) = app.try_state::<SidecarSupervisor>() {
            state.stop_all();
          }
          app.exit(0);
        }
        _ => {}
      }
    })
    .on_tray_icon_event(|tray, event| {
      if let TrayIconEvent::Click {
        button: MouseButton::Left,
        button_state: MouseButtonState::Up,
        ..
      } = event
      {
        let app = tray.app_handle();
        if let Some(w) = app.get_webview_window("main") {
          let _ = w.show();
          let _ = w.set_focus();
        }
      }
    })
    .build(app)?;

  let handle = app.clone();
  thread::spawn(move || loop {
    thread::sleep(Duration::from_secs(4));
    if let Some(sup) = handle.try_state::<SidecarSupervisor>() {
      sup.refresh_health();
      let statuses = sup.snapshot_statuses();
      if let Some(items) = handle.try_state::<Mutex<Vec<tauri::menu::MenuItem<tauri::Wry>>>>() {
        if let Ok(guard) = items.lock() {
          for (item, st) in guard.iter().zip(statuses.iter()) {
            let label = format!(
              "{}: {}",
              match st.name.as_str() {
                "surreal" => "Surreal",
                "gateway" => "Gateway",
                "print" => "Print",
                "payment" => "Payment",
                "tracking" => "Tracking",
                "api" => "API",
                "sync" => "Sync",
                other => other,
              },
              st.status
            );
            let _ = item.set_text(label);
          }
        }
      }
      let tip = statuses
        .iter()
        .map(|s| format!("{}={}", s.name, s.status))
        .collect::<Vec<_>>()
        .join(" ");
      // tooltip update via tray icon if we kept a reference — skip if unavailable
      let _ = tip;
    }
  });

  Ok(())
}
