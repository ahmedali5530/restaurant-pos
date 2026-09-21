#!/usr/bin/env bash
# Dev / build wrappers that load optional local WebKit sysroot (see env.sh).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
# shellcheck disable=SC1091
[[ -f "$ROOT/env.sh" ]] && source "$ROOT/env.sh"
source "${HOME}/.cargo/env" 2>/dev/null || true
export PATH="${HOME}/.cargo/bin:${HOME}/.nvm/versions/node/v20.19.5/bin:${PATH}"
cd "$ROOT"
exec bunx tauri "$@"
