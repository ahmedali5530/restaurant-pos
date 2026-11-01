#!/usr/bin/env bash
# Production Vite build with localhost service URLs for the packaged desktop app.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

# Ensure sidecars/binaries exist (binaries required for externalBin; npm can be heavy — run full prepare in CI).
if [[ ! -d "$ROOT/desktop/src-tauri/binaries" ]] || [[ -z "$(ls -A "$ROOT/desktop/src-tauri/binaries" 2>/dev/null || true)" ]]; then
  bash "$ROOT/desktop/scripts/prepare-sidecars.sh" --skip-npm || bash "$ROOT/desktop/scripts/prepare-sidecars.sh"
fi
# Always refresh JS trees without reinstalling if resources already have node_modules
if [[ ! -d "$ROOT/desktop/src-tauri/resources/sidecars/gateway" ]]; then
  bash "$ROOT/desktop/scripts/prepare-sidecars.sh"
fi

export VITE_GATEWAY_AUTH=true
export VITE_GATEWAY_URL=http://127.0.0.1:3142
export VITE_DB_WEBDOCKET=ws://127.0.0.1:3142/rpc
export VITE_PRINT_SERVER_URL=http://127.0.0.1:3132
export VITE_PAYMENT_SERVER_URL=http://127.0.0.1:3134
export VITE_TRACKING_SERVER_URL=http://127.0.0.1:3138
export VITE_API_SERVER_URL=http://127.0.0.1:3140
export VITE_SYNC_SERVICE_URL=http://127.0.0.1:3136

# CI has no .env. Luxon throws on a missing format and that blanks the page.
# Installer settings override these after launch.
export VITE_DATE_FORMAT="${VITE_DATE_FORMAT:-yyyy-MM-dd}"
export VITE_TIME_FORMAT="${VITE_TIME_FORMAT:-HH:mm}"
export VITE_DATE_TIME_FORMAT="${VITE_DATE_TIME_FORMAT:-${VITE_DATE_FORMAT} ${VITE_TIME_FORMAT}}"
export VITE_DATE_HUMAN_FORMAT="${VITE_DATE_HUMAN_FORMAT:-ff}"
export VITE_DECIMAL_PLACES="${VITE_DECIMAL_PLACES:-2}"
export VITE_LOCALE="${VITE_LOCALE:-en-US}"
export VITE_CURRENCY="${VITE_CURRENCY:-USD}"
export VITE_APP_TIMEZONE="${VITE_APP_TIMEZONE:-UTC}"
export VITE_DEFAULT_LANGUAGE="${VITE_DEFAULT_LANGUAGE:-en}"
export VITE_DEFAULT_LOGIN_METHOD="${VITE_DEFAULT_LOGIN_METHOD:-pin}"

# Empty means every module. Set by the desktop workflow inputs for a client build.
echo "[posr-desktop] VITE_APP_MODULES=${VITE_APP_MODULES:-<all>}"
echo "[posr-desktop] VITE_APP_MODULES_EXCLUDE=${VITE_APP_MODULES_EXCLUDE:-<none>}"

bunx vite build

# Packaged desktop serves these files on port 5173 for other PCs on the LAN.
WEB_DIR="$ROOT/desktop/src-tauri/resources/web"
rm -rf "$WEB_DIR"
mkdir -p "$WEB_DIR"
cp -R "$ROOT/dist/." "$WEB_DIR/"
