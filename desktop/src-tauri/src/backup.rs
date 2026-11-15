//! Scheduled Surreal exports. Times are the PC's local clock.
//! The live `database` directory is never used as the destination.

use std::fs;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::thread;
use std::time::{Duration, Instant};

use chrono::{Local, Timelike};
use tauri::AppHandle;

use crate::config::{self, InstallerBackup};
use crate::logging::LogHub;
use crate::paths;

#[cfg(windows)]
use std::os::windows::process::CommandExt;

#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

const POLL_SECS: u64 = 15;
const EXPORT_TIMEOUT: Duration = Duration::from_secs(15 * 60);

pub fn spawn(
  app: AppHandle,
  app_data: PathBuf,
  hub: LogHub,
  stop: Arc<AtomicBool>,
) {
  let bin = paths::resolve_surreal_bin(Some(&app));
  thread::Builder::new()
    .name("posr-backup".into())
    .spawn(move || run_loop(bin, app_data, hub, stop))
    .ok();
}

fn run_loop(bin: PathBuf, app_data: PathBuf, hub: LogHub, stop: Arc<AtomicBool>) {
  hub.shell("database backup schedule started (local clock)");
  let mut last_slot = read_last_slot(&app_data);
  while !stop.load(Ordering::SeqCst) {
    let backup = load_backup(&app_data);
    if backup.enabled {
      let now = Local::now();
      let date = now.format("%Y-%m-%d").to_string();
      if let Some(slot) = slot_if_due(
        &date,
        now.time().hour(),
        now.time().minute(),
        &backup.times,
        last_slot.as_deref(),
      ) {
        match export_once(&bin, &app_data, &backup, &hub, &stop) {
          Ok(path) => {
            hub.shell(&format!("database backup wrote {}", path.display()));
            last_slot = Some(slot.clone());
            let _ = write_last_slot(&app_data, &slot);
          }
          Err(err) => hub.shell(&format!("database backup failed: {err}")),
        }
      }
    }
    for _ in 0..POLL_SECS {
      if stop.load(Ordering::SeqCst) {
        return;
      }
      thread::sleep(Duration::from_secs(1));
    }
  }
}

fn load_backup(app_data: &Path) -> InstallerBackup {
  config::load_installer_settings(app_data)
    .map(|settings| settings.backup)
    .unwrap_or_default()
}

fn export_once(
  bin: &Path,
  app_data: &Path,
  backup: &InstallerBackup,
  hub: &LogHub,
  stop: &AtomicBool,
) -> Result<PathBuf, String> {
  if !bin.is_file() {
    return Err(format!("Surreal program not found at {}", bin.display()));
  }
  let cfg = config::load_or_create_config(app_data)?;
  let dir = backup_dir(app_data, backup)?;
  fs::create_dir_all(&dir).map_err(|err| format!("create backup folder: {err}"))?;
  if directory_is_live_database(&dir, app_data) {
    return Err("backup folder is inside the live database directory".into());
  }

  let stamp = Local::now().format("%Y%m%d-%H%M%S").to_string();
  let path = dir.join(format!("posr-database-{stamp}.surql"));
  hub.shell(&format!(
    "database backup exporting to {}",
    path.display()
  ));

  let mut cmd = Command::new(bin);
  cmd
    .arg("--log")
    .arg("error")
    .arg("export")
    .arg("--endpoint")
    .arg("http://127.0.0.1:8000")
    .arg("--username")
    .arg(&cfg.surreal_user)
    .arg("--password")
    .arg(&cfg.surreal_pass)
    .arg("--namespace")
    .arg(&cfg.surreal_ns)
    .arg("--database")
    .arg(&cfg.surreal_db)
    .arg(&path)
    .stdin(Stdio::null())
    .stdout(Stdio::piped())
    .stderr(Stdio::piped());
  #[cfg(windows)]
  {
    cmd.creation_flags(CREATE_NO_WINDOW);
  }

  let mut child = cmd.spawn().map_err(|err| format!("start surreal export: {err}"))?;
  let started = Instant::now();
  let status = loop {
    match child.try_wait() {
      Ok(Some(status)) => break status,
      Ok(None) if stop.load(Ordering::SeqCst) || started.elapsed() > EXPORT_TIMEOUT => {
        let _ = child.kill();
        let _ = child.wait();
        let _ = fs::remove_file(&path);
        return Err(if stop.load(Ordering::SeqCst) {
          "surreal export stopped".into()
        } else {
          "surreal export timed out".into()
        });
      }
      Ok(None) => thread::sleep(Duration::from_secs(1)),
      Err(err) => {
        let _ = fs::remove_file(&path);
        return Err(format!("surreal export: {err}"));
      }
    }
  };
  if !status.success() {
    let _ = fs::remove_file(&path);
    let code = status.code().map(|c| c.to_string()).unwrap_or_else(|| "signal".into());
    return Err(format!("surreal export exited {code}"));
  }
  let size = fs::metadata(&path).map(|meta| meta.len()).unwrap_or(0);
  if size == 0 {
    let _ = fs::remove_file(&path);
    return Err("surreal export wrote an empty file".into());
  }
  if let Err(err) = prune_dir(&dir, backup.keep) {
    hub.shell(&format!("database backup prune failed: {err}"));
  }
  Ok(path)
}

fn backup_dir(app_data: &Path, backup: &InstallerBackup) -> Result<PathBuf, String> {
  let raw = backup.directory.trim();
  if raw.is_empty() {
    return Ok(app_data.join("backups"));
  }
  Ok(PathBuf::from(raw))
}

fn directory_is_live_database(dir: &Path, app_data: &Path) -> bool {
  let database = config::surreal_data_dir(app_data);
  let dir = dir.canonicalize().unwrap_or_else(|_| dir.to_path_buf());
  let database = database.canonicalize().unwrap_or(database);
  dir.starts_with(&database)
}

fn prune_dir(dir: &Path, keep: u32) -> Result<(), String> {
  let mut names = Vec::new();
  let entries = fs::read_dir(dir).map_err(|err| format!("read backup folder: {err}"))?;
  for entry in entries {
    let entry = entry.map_err(|err| format!("read backup folder: {err}"))?;
    let name = entry.file_name().to_string_lossy().to_string();
    if name.starts_with("posr-database-") && name.ends_with(".surql") {
      names.push(name);
    }
  }
  for name in files_to_prune(&names, keep) {
    let _ = fs::remove_file(dir.join(name));
  }
  Ok(())
}

fn last_slot_path(app_data: &Path) -> PathBuf {
  app_data.join("backups").join(".last-slot")
}

fn read_last_slot(app_data: &Path) -> Option<String> {
  fs::read_to_string(last_slot_path(app_data))
    .ok()
    .map(|text| text.trim().to_string())
    .filter(|text| !text.is_empty())
}

fn write_last_slot(app_data: &Path, slot: &str) -> Result<(), String> {
  let path = last_slot_path(app_data);
  if let Some(parent) = path.parent() {
    fs::create_dir_all(parent).map_err(|err| format!("create backup folder: {err}"))?;
  }
  fs::write(path, slot).map_err(|err| format!("write backup slot: {err}"))
}

/// `HH:mm` → hour, minute. Rejects anything else.
pub(crate) fn parse_clock(value: &str) -> Option<(u32, u32)> {
  let value = value.trim();
  let (hour, minute) = value.split_once(':')?;
  if hour.len() != 2 || minute.len() != 2 {
    return None;
  }
  if !hour.chars().all(|c| c.is_ascii_digit()) || !minute.chars().all(|c| c.is_ascii_digit()) {
    return None;
  }
  let hour: u32 = hour.parse().ok()?;
  let minute: u32 = minute.parse().ok()?;
  if hour > 23 || minute > 59 {
    return None;
  }
  Some((hour, minute))
}

/// Returns the slot key when the local clock is on a configured minute and
/// that slot has not already been written.
pub(crate) fn slot_if_due(
  date: &str,
  hour: u32,
  minute: u32,
  times: &[String],
  last: Option<&str>,
) -> Option<String> {
  let matched = times.iter().any(|time| {
    parse_clock(time).is_some_and(|(h, m)| h == hour && m == minute)
  });
  if !matched {
    return None;
  }
  let slot = format!("{date} {hour:02}:{minute:02}");
  if last == Some(slot.as_str()) {
    return None;
  }
  Some(slot)
}

/// Oldest names first. `keep == 0` deletes nothing.
pub(crate) fn files_to_prune(names: &[String], keep: u32) -> Vec<String> {
  if keep == 0 {
    return Vec::new();
  }
  let mut ordered = names.to_vec();
  ordered.sort();
  let keep = keep as usize;
  if ordered.len() <= keep {
    return Vec::new();
  }
  ordered.truncate(ordered.len() - keep);
  ordered
}

#[cfg(test)]
mod tests {
  use super::{files_to_prune, parse_clock, slot_if_due};

  #[test]
  fn parses_midnight_and_noon() {
    assert_eq!(parse_clock("00:00"), Some((0, 0)));
    assert_eq!(parse_clock("12:00"), Some((12, 0)));
    assert_eq!(parse_clock("24:00"), None);
    assert_eq!(parse_clock("12:00:00"), None);
  }

  #[test]
  fn fires_once_per_slot() {
    let times = vec!["00:00".to_string(), "12:00".to_string()];
    let slot = slot_if_due("2026-11-15", 0, 0, &times, None);
    assert_eq!(slot.as_deref(), Some("2026-11-15 00:00"));
    assert!(slot_if_due("2026-11-15", 0, 0, &times, slot.as_deref()).is_none());
    assert!(slot_if_due("2026-11-15", 0, 1, &times, None).is_none());
    assert_eq!(
      slot_if_due("2026-11-15", 12, 0, &times, slot.as_deref()).as_deref(),
      Some("2026-11-15 12:00")
    );
  }

  #[test]
  fn prune_keeps_newest() {
    let names = vec![
      "posr-database-20261115-000000.surql".to_string(),
      "posr-database-20261115-120000.surql".to_string(),
      "posr-database-20261116-000000.surql".to_string(),
    ];
    assert_eq!(
      files_to_prune(&names, 2),
      vec!["posr-database-20261115-000000.surql".to_string()]
    );
    assert!(files_to_prune(&names, 0).is_empty());
  }
}
