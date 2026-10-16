# Windows equivalent of tauri.sh — run from repo with Bun + Rust on PATH.
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $Root

if (-not (Get-Command bun -ErrorAction SilentlyContinue)) {
  Write-Error "bun not found on PATH. Install from https://bun.sh and reopen the terminal."
}
if (-not (Get-Command cargo -ErrorAction SilentlyContinue)) {
  Write-Error "cargo not found on PATH. Install Rust from https://rustup.rs and reopen the terminal."
}

# Prefer nvm-windows / system Node for the print sidecar when unset.
if (-not $env:NODE_BINARY) {
  $node = Get-Command node -ErrorAction SilentlyContinue
  if ($node) {
    $env:NODE_BINARY = $node.Source
  }
}

if (-not $env:POSR_REPO_ROOT) {
  $env:POSR_REPO_ROOT = (Resolve-Path (Join-Path $Root "..")).Path
}

# Always enable tray on Windows (no AppIndicator requirement).
$tauriArgs = @($args)
if ($tauriArgs.Count -gt 0 -and ($tauriArgs[0] -eq "build" -or $tauriArgs[0] -eq "dev")) {
  $hasFeatures = $false
  foreach ($a in $tauriArgs) {
    if ($a -eq "--features" -or "$a".StartsWith("features=")) { $hasFeatures = $true }
  }
  if (-not $hasFeatures) {
    $rest = @()
    if ($tauriArgs.Count -gt 1) {
      $rest = $tauriArgs[1..($tauriArgs.Count - 1)]
    }
    $tauriArgs = @($tauriArgs[0], "--features", "tray") + $rest
  }
}

bunx tauri @tauriArgs
