//! Unified log buffer + file sink for shell and sidecar stdout/stderr.

use std::collections::VecDeque;
use std::fs::{self, OpenOptions};
use std::io::{BufRead, BufReader, Write};
use std::path::{Path, PathBuf};
use std::process::{ChildStderr, ChildStdout};
use std::sync::{Arc, Mutex};
use std::thread;

const RING_CAP: usize = 4000;

#[derive(Clone)]
pub struct LogHub {
  inner: Arc<Mutex<LogInner>>,
  app_data: PathBuf,
}

struct LogInner {
  lines: VecDeque<String>,
}

impl LogHub {
  pub fn new(app_data: &Path) -> Self {
    let logs = app_data.join("logs");
    let _ = fs::create_dir_all(&logs);
    Self {
      inner: Arc::new(Mutex::new(LogInner {
        lines: VecDeque::with_capacity(RING_CAP),
      })),
      app_data: app_data.to_path_buf(),
    }
  }

  pub fn logs_dir(&self) -> PathBuf {
    self.app_data.join("logs")
  }

  pub fn append(&self, source: &str, line: &str) {
    let trimmed = line.trim_end();
    if trimmed.is_empty() {
      return;
    }
    let prefixed = format!("[{source}] {trimmed}");
    log::info!("{prefixed}");
    if let Ok(mut guard) = self.inner.lock() {
      if guard.lines.len() >= RING_CAP {
        guard.lines.pop_front();
      }
      guard.lines.push_back(prefixed.clone());
    }
    let path = self.logs_dir().join("sidecars.log");
    if let Ok(mut f) = OpenOptions::new().create(true).append(true).open(&path) {
      let _ = writeln!(f, "{prefixed}");
    }
  }

  pub fn shell(&self, line: &str) {
    self.append("shell", line);
  }

  pub fn tail(&self, source_filter: Option<&str>, max_lines: usize) -> Vec<String> {
    let Ok(guard) = self.inner.lock() else {
      return Vec::new();
    };
    let iter = guard.lines.iter().rev().filter(|line| {
      match source_filter {
        None | Some("") | Some("all") => true,
        Some(src) => line.starts_with(&format!("[{src}]")),
      }
    });
    let mut out: Vec<String> = iter.take(max_lines).cloned().collect();
    out.reverse();
    out
  }

  pub fn clear_ring(&self) {
    if let Ok(mut guard) = self.inner.lock() {
      guard.lines.clear();
    }
  }

  pub fn pump_child_stdio(
    &self,
    source: &str,
    stdout: Option<ChildStdout>,
    stderr: Option<ChildStderr>,
  ) {
    let hub = self.clone();
    let src = source.to_string();
    if let Some(out) = stdout {
      let hub2 = hub.clone();
      let src2 = src.clone();
      thread::spawn(move || {
        let reader = BufReader::new(out);
        for line in reader.lines().flatten() {
          hub2.append(&src2, &line);
        }
      });
    }
    if let Some(err) = stderr {
      let hub2 = hub.clone();
      let src2 = src;
      thread::spawn(move || {
        let reader = BufReader::new(err);
        for line in reader.lines().flatten() {
          hub2.append(&src2, &line);
        }
      });
    }
  }
}

pub fn open_logs_dir(path: &Path) -> Result<(), String> {
  #[cfg(target_os = "windows")]
  {
    std::process::Command::new("explorer")
      .arg(path)
      .spawn()
      .map_err(|e| format!("open logs dir: {e}"))?;
    return Ok(());
  }
  #[cfg(target_os = "macos")]
  {
    std::process::Command::new("open")
      .arg(path)
      .spawn()
      .map_err(|e| format!("open logs dir: {e}"))?;
    return Ok(());
  }
  #[cfg(not(any(target_os = "windows", target_os = "macos")))]
  {
    std::process::Command::new("xdg-open")
      .arg(path)
      .spawn()
      .map_err(|e| format!("open logs dir: {e}"))?;
    Ok(())
  }
}
