#!/usr/bin/env bash
# Dev / build wrappers that load optional local WebKit sysroot (see env.sh).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
# shellcheck disable=SC1091
[[ -f "$ROOT/env.sh" ]] && source "$ROOT/env.sh"
source "${HOME}/.cargo/env" 2>/dev/null || true
export PATH="${HOME}/.cargo/bin:${HOME}/.nvm/versions/node/v20.19.5/bin:${PATH}"
cd "$ROOT"

# Tray needs libayatana-appindicator on Linux; tauri-cli aborts if the feature
# is enabled without it. Auto-enable when safe.
args=("$@")
want_tray=0
case "$(uname -s)" in
  Darwin|MINGW*|MSYS*|CYGWIN*) want_tray=1 ;;
  Linux)
    if pkg-config --exists ayatana-appindicator3-0.1 2>/dev/null \
      || pkg-config --exists appindicator3-0.1 2>/dev/null; then
      want_tray=1
    fi
    ;;
esac

if [[ "$want_tray" -eq 1 ]]; then
  # Insert --features tray after subcommand (build/dev) when not already set.
  if [[ "${#args[@]}" -gt 0 ]] && [[ "${args[0]}" == "build" || "${args[0]}" == "dev" ]]; then
    has_features=0
    for a in "${args[@]}"; do
      [[ "$a" == "--features" || "$a" == features=* ]] && has_features=1
    done
    if [[ "$has_features" -eq 0 ]]; then
      args=("${args[0]}" --features tray "${args[@]:1}")
    fi
  fi
else
  echo "[posr-desktop] AppIndicator not found — building without tray (install libayatana-appindicator3-dev for tray)" >&2
fi

# Linux release: merge tauri.linux.conf.json (deb/AppImage targets; no RPM).
if [[ "${args[0]:-}" == "build" ]] && [[ "$(uname -s)" == "Linux" ]]; then
  has_config=0
  for a in "${args[@]}"; do
    [[ "$a" == "--config" || "$a" == --config=* ]] && has_config=1
  done
  if [[ "$has_config" -eq 0 ]]; then
    args+=(--config src-tauri/tauri.linux.conf.json)
  fi
fi

exec bunx tauri "${args[@]}"
