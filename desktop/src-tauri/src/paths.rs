//! Resolve Node/Surreal binaries and sidecar service directories (dev + packaged).

use std::path::{Path, PathBuf};

use tauri::{AppHandle, Manager};

pub const DEFAULT_ALLOWED_ORIGINS: &str = concat!(
  "http://localhost:5173,",
  "http://127.0.0.1:5173,",
  "tauri://localhost,",
  "https://tauri.localhost,",
  "http://tauri.localhost"
);

pub fn load_dotenv_value(repo_root: &Path, key: &str) -> Option<String> {
  for name in [".env.local", ".env"] {
    let path = repo_root.join(name);
    let Ok(contents) = std::fs::read_to_string(&path) else {
      continue;
    };
    for line in contents.lines() {
      let line = line.trim();
      if line.is_empty() || line.starts_with('#') {
        continue;
      }
      let Some((k, v)) = line.split_once('=') else {
        continue;
      };
      if k.trim() != key {
        continue;
      }
      let mut val = v.trim().to_string();
      if (val.starts_with('"') && val.ends_with('"'))
        || (val.starts_with('\'') && val.ends_with('\''))
      {
        val = val[1..val.len() - 1].to_string();
      }
      if !val.is_empty() {
        return Some(val);
      }
    }
  }
  None
}

pub fn resolve_repo_root() -> Option<PathBuf> {
  if let Ok(root) = std::env::var("POSR_REPO_ROOT") {
    let p = PathBuf::from(root);
    if p.join("package.json").exists() {
      return Some(p);
    }
  }
  let from_manifest = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../..");
  if let Ok(canonical) = from_manifest.canonicalize() {
    if canonical.join("package.json").exists() {
      return Some(canonical);
    }
  }
  None
}

fn bundled_bin(app: &AppHandle, name: &str) -> Option<PathBuf> {
  let resource = app.path().resource_dir().ok()?;
  let exe_name = if cfg!(windows) {
    format!("{name}.exe")
  } else {
    name.to_string()
  };
  // Tauri externalBin places sidecars next to the executable.
  if let Ok(exe) = std::env::current_exe() {
    if let Some(dir) = exe.parent() {
      let p = dir.join(&exe_name);
      if p.exists() {
        return Some(p);
      }
      // Linux AppImage / deb layouts sometimes nest under resources
      let p2 = dir.join("binaries").join(&exe_name);
      if p2.exists() {
        return Some(p2);
      }
    }
  }
  let candidates = [
    resource.join(&exe_name),
    resource.join("binaries").join(&exe_name),
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
      .join("binaries")
      .join(format!(
        "{}-{}",
        name,
        current_target_triple_stub()
      )),
  ];
  candidates.into_iter().find(|p| p.exists())
}

fn current_target_triple_stub() -> &'static str {
  if cfg!(all(target_os = "linux", target_arch = "x86_64")) {
    "x86_64-unknown-linux-gnu"
  } else if cfg!(all(target_os = "windows", target_arch = "x86_64")) {
    "x86_64-pc-windows-msvc"
  } else if cfg!(all(target_os = "macos", target_arch = "aarch64")) {
    "aarch64-apple-darwin"
  } else if cfg!(all(target_os = "macos", target_arch = "x86_64")) {
    "x86_64-apple-darwin"
  } else {
    "unknown"
  }
}

pub fn resolve_node_bin(app: Option<&AppHandle>) -> PathBuf {
  if let Ok(p) = std::env::var("NODE_BINARY") {
    let path = PathBuf::from(p);
    if path.exists() {
      return path;
    }
  }
  if let Some(app) = app {
    if let Some(p) = bundled_bin(app, "node") {
      return p;
    }
  }
  // Dev: binaries prepared by prepare-sidecars
  let local = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("binaries").join(format!(
    "node-{}",
    current_target_triple_stub()
  ));
  if local.exists() {
    return local;
  }

  let home = std::env::var("HOME")
    .or_else(|_| std::env::var("USERPROFILE"))
    .unwrap_or_default();
  for nvm_glob in [
    format!("{home}/.nvm/versions/node"),
    format!("{home}/AppData/Roaming/nvm"),
  ] {
    if let Ok(entries) = std::fs::read_dir(&nvm_glob) {
      let mut versions: Vec<PathBuf> = entries
        .filter_map(|e| e.ok().map(|e| e.path()))
        .filter(|p| p.is_dir())
        .map(|dir| {
          if cfg!(windows) {
            dir.join("node.exe")
          } else {
            dir.join("bin/node")
          }
        })
        .filter(|p| p.exists())
        .collect();
      versions.sort();
      if let Some(last) = versions.pop() {
        return last;
      }
    }
  }

  if cfg!(windows) {
    for c in [
      r"C:\Program Files\nodejs\node.exe",
      r"C:\Program Files (x86)\nodejs\node.exe",
    ] {
      let p = PathBuf::from(c);
      if p.exists() {
        return p;
      }
    }
    return PathBuf::from("node.exe");
  }

  for c in ["/usr/local/bin/node", "/usr/bin/node"] {
    let p = PathBuf::from(c);
    if p.exists() {
      return p;
    }
  }
  PathBuf::from("node")
}

pub fn resolve_surreal_bin(app: Option<&AppHandle>) -> PathBuf {
  if let Ok(p) = std::env::var("SURREAL_BINARY") {
    let path = PathBuf::from(p);
    if path.exists() {
      return path;
    }
  }
  if let Some(app) = app {
    if let Some(p) = bundled_bin(app, "surreal") {
      return p;
    }
  }
  let local = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("binaries").join(format!(
    "surreal-{}",
    current_target_triple_stub()
  ));
  if local.exists() {
    return local;
  }
  // Prefer a v3 binary if present next to common install paths
  for c in ["/usr/local/bin/surreal", "/usr/bin/surreal"] {
    let p = PathBuf::from(c);
    if p.exists() {
      return p;
    }
  }
  PathBuf::from("surreal")
}

/// Service directory: packaged resources/sidecars/<name> or repo/<name>.
pub fn resolve_service_dir(app: Option<&AppHandle>, name: &str) -> Option<PathBuf> {
  if let Some(app) = app {
    if let Ok(resource) = app.path().resource_dir() {
      let p = resource.join("sidecars").join(name);
      if p.join("server.js").exists() || p.join("package.json").exists() {
        return Some(p);
      }
    }
  }
  if let Some(root) = resolve_repo_root() {
    let p = root.join(name);
    if p.join("server.js").exists() {
      return Some(p);
    }
  }
  let from_manifest = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
    .join("../../")
    .join(name);
  if let Ok(canonical) = from_manifest.canonicalize() {
    if canonical.join("server.js").exists() {
      return Some(canonical);
    }
  }
  // Prepared resources during local build
  let prepared = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
    .join("resources/sidecars")
    .join(name);
  if prepared.join("server.js").exists() {
    return Some(prepared);
  }
  None
}

pub fn resolve_app_data(app: &AppHandle) -> Result<PathBuf, String> {
  if let Ok(override_dir) = std::env::var("POSR_APP_DATA") {
    let p = PathBuf::from(override_dir);
    std::fs::create_dir_all(&p).map_err(|e| format!("POSR_APP_DATA: {e}"))?;
    return Ok(p);
  }
  let dir = app
    .path()
    .app_data_dir()
    .map_err(|e| format!("app_data_dir: {e}"))?;
  std::fs::create_dir_all(&dir).map_err(|e| format!("create app_data: {e}"))?;
  Ok(dir)
}

pub fn allowed_origins(repo_root: Option<&Path>) -> String {
  std::env::var("GATEWAY_ALLOWED_ORIGINS")
    .ok()
    .filter(|s| !s.trim().is_empty())
    .or_else(|| {
      repo_root.and_then(|root| load_dotenv_value(root, "GATEWAY_ALLOWED_ORIGINS"))
    })
    .unwrap_or_else(|| DEFAULT_ALLOWED_ORIGINS.to_string())
}
