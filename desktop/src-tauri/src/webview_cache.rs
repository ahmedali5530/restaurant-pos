//! Drop the embedded UI cache when the installed version changes.
//! The database lives beside that cache and is never touched.

use std::fs;
use std::path::{Path, PathBuf};

const IDENTIFIER: &str = "com.posr.desktop";
const VERSION_FILE: &str = "ui-version";
const REFRESH_MARKER: &str = "refresh-ui";

pub fn clear_if_stale() {
  let version = env!("CARGO_PKG_VERSION");
  let Some(data_dir) = data_dir() else {
    return;
  };
  let marker = data_dir.join(REFRESH_MARKER);
  let stamp = data_dir.join(VERSION_FILE);
  let stored = fs::read_to_string(&stamp).unwrap_or_default();
  let installer_asked = marker.is_file();
  if !installer_asked && stored.trim() == version {
    return;
  }

  for dir in cache_dirs(&data_dir) {
    if dir.is_dir() {
      match fs::remove_dir_all(&dir) {
        Ok(()) => eprintln!("[posr-desktop] cleared UI cache {}", dir.display()),
        Err(err) => {
          eprintln!(
            "[posr-desktop] could not clear UI cache {}: {err}",
            dir.display()
          );
          // Leave the stamp alone so the next launch tries again.
          return;
        }
      }
    }
  }

  let _ = fs::remove_file(&marker);
  if fs::write(&stamp, version).is_err() {
    let _ = fs::create_dir_all(&data_dir);
    let _ = fs::write(&stamp, version);
  }
}

/// Folder that holds `ui-version`. Never deleted.
fn data_dir() -> Option<PathBuf> {
  #[cfg(windows)]
  {
    let local = std::env::var("LOCALAPPDATA").ok()?;
    return Some(PathBuf::from(local).join(IDENTIFIER));
  }
  #[cfg(target_os = "macos")]
  {
    let home = std::env::var("HOME").ok()?;
    return Some(
      PathBuf::from(home)
        .join("Library/Application Support")
        .join(IDENTIFIER),
    );
  }
  #[cfg(all(not(windows), not(target_os = "macos")))]
  {
    let data = std::env::var("XDG_DATA_HOME")
      .ok()
      .map(PathBuf::from)
      .or_else(|| {
        std::env::var("HOME")
          .ok()
          .map(|home| PathBuf::from(home).join(".local/share"))
      })?;
    Some(data.join(IDENTIFIER))
  }
}

fn cache_dirs(data_dir: &Path) -> Vec<PathBuf> {
  #[cfg(windows)]
  {
    // WebView2 cache only. installer-settings.json sits beside this folder.
    vec![data_dir.join("EBWebView")]
  }
  #[cfg(target_os = "macos")]
  {
    let _ = data_dir;
    let home = std::env::var("HOME").unwrap_or_default();
    let home = PathBuf::from(home);
    vec![
      home.join("Library/Caches").join(IDENTIFIER),
      home.join("Library/WebKit").join(IDENTIFIER),
    ]
  }
  #[cfg(all(not(windows), not(target_os = "macos")))]
  {
    // WebKit stores these next to the database. `database` itself stays.
    vec![
      data_dir.join("WebKitCache"),
      data_dir.join("CacheStorage"),
    ]
  }
}
