//! Serves the packaged POS screens on the LAN so another PC can open them
//! in a browser. The database stays on this machine; the browser talks to
//! the gateway on port 3142.

use std::fs::File;
use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};
use std::path::{Path, PathBuf};
use std::thread;
use std::time::Duration;

use tauri::{AppHandle, Manager};

use crate::logging::LogHub;
use crate::paths;

const PORT: u16 = 5173;

pub fn start(app: &AppHandle, log_hub: &LogHub) {
  let Some(root) = web_root(app) else {
    log_hub.shell("LAN screens not bundled — browser access unavailable");
    return;
  };

  let listener = match TcpListener::bind(("0.0.0.0", PORT)) {
    Ok(listener) => listener,
    Err(err) => {
      log_hub.shell(&format!(
        "LAN screens port {PORT} is already in use ({err})"
      ));
      return;
    }
  };
  let _ = listener.set_nonblocking(false);
  log_hub.shell(&format!(
    "LAN screens on port {PORT} — other PCs open http://<this-ip>:{PORT} (allow it in the firewall)"
  ));

  thread::spawn(move || {
    for conn in listener.incoming() {
      let Ok(stream) = conn else { continue };
      let root = root.clone();
      thread::spawn(move || {
        let _ = handle_client(stream, &root);
      });
    }
  });
}

fn web_root(app: &AppHandle) -> Option<PathBuf> {
  if let Ok(resource) = app.path().resource_dir() {
    for rel in ["resources/web", "web", "resources/resources/web"] {
      let dir = resource.join(rel);
      if dir.join("index.html").is_file() {
        return Some(dir);
      }
    }
  }
  let dist = paths::resolve_repo_root()?.join("dist");
  if dist.join("index.html").is_file() {
    return Some(dist);
  }
  None
}

fn handle_client(mut stream: TcpStream, root: &Path) -> std::io::Result<()> {
  let _ = stream.set_read_timeout(Some(Duration::from_secs(5)));
  let mut buf = [0_u8; 8192];
  let n = stream.read(&mut buf)?;
  let req = String::from_utf8_lossy(&buf[..n]);
  let path = req
    .lines()
    .next()
    .and_then(|line| line.split_whitespace().nth(1))
    .unwrap_or("/");

  match resolve_file(root, path) {
    Some(file) => send_file(&mut stream, &file),
    None => {
      let body = b"Not found";
      write!(
        stream,
        "HTTP/1.1 404 Not Found\r\nContent-Type: text/plain; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
        body.len()
      )?;
      stream.write_all(body)?;
      Ok(())
    }
  }
}

fn resolve_file(root: &Path, raw_path: &str) -> Option<PathBuf> {
  let path_only = raw_path.split('?').next().unwrap_or("/");
  let decoded = percent_decode(path_only);
  if decoded.contains('\0') {
    return None;
  }
  let rel = decoded.trim_start_matches(['/', '\\']);
  if rel.split(['/', '\\']).any(|part| part == "..") {
    return None;
  }

  let root = root.canonicalize().ok()?;
  if !rel.is_empty() {
    let candidate = root.join(rel);
    if let Ok(canon) = candidate.canonicalize() {
      if canon.starts_with(&root) && canon.is_file() {
        return Some(canon);
      }
    }
  }
  let looks_like_file = Path::new(rel).extension().is_some();
  if looks_like_file {
    return None;
  }
  let index = root.join("index.html");
  if index.is_file() {
    return Some(index);
  }
  None
}

fn send_file(stream: &mut TcpStream, path: &Path) -> std::io::Result<()> {
  let mut file = File::open(path)?;
  let mut body = Vec::new();
  file.read_to_end(&mut body)?;
  let mime = mime_for(path);
  write!(
    stream,
    "HTTP/1.1 200 OK\r\nContent-Type: {mime}\r\nContent-Length: {}\r\nCache-Control: no-cache\r\nConnection: close\r\n\r\n",
    body.len()
  )?;
  stream.write_all(&body)?;
  Ok(())
}

fn mime_for(path: &Path) -> &'static str {
  match path
    .extension()
    .and_then(|ext| ext.to_str())
    .unwrap_or("")
    .to_ascii_lowercase()
    .as_str()
  {
    "html" => "text/html; charset=utf-8",
    "js" | "mjs" => "text/javascript; charset=utf-8",
    "css" => "text/css; charset=utf-8",
    "json" | "map" => "application/json",
    "svg" => "image/svg+xml",
    "png" => "image/png",
    "jpg" | "jpeg" => "image/jpeg",
    "webp" => "image/webp",
    "gif" => "image/gif",
    "ico" => "image/x-icon",
    "woff" => "font/woff",
    "woff2" => "font/woff2",
    "ttf" => "font/ttf",
    "wasm" => "application/wasm",
    _ => "application/octet-stream",
  }
}

fn percent_decode(input: &str) -> String {
  let bytes = input.as_bytes();
  let mut out = Vec::with_capacity(bytes.len());
  let mut i = 0;
  while i < bytes.len() {
    if bytes[i] == b'%' && i + 2 < bytes.len() {
      if let Ok(hex) = std::str::from_utf8(&bytes[i + 1..i + 3]) {
        if let Ok(value) = u8::from_str_radix(hex, 16) {
          out.push(value);
          i += 3;
          continue;
        }
      }
    }
    out.push(bytes[i]);
    i += 1;
  }
  String::from_utf8_lossy(&out).into_owned()
}
