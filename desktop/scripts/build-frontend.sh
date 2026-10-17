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

bunx vite build
