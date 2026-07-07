#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CERTS_DIR="$(cd "$SCRIPT_DIR/.." && pwd)/certs"

if ! command -v mkcert >/dev/null 2>&1; then
  echo "ERROR: mkcert is not installed." >&2
  echo "Install from https://github.com/FiloSottile/mkcert" >&2
  exit 1
fi

mkdir -p "$CERTS_DIR"

echo "Installing local CA (may prompt for sudo)..."
mkcert -install

cd "$CERTS_DIR"
mkcert -cert-file localhost.pem -key-file localhost-key.pem localhost 127.0.0.1 ::1

echo ""
echo "Certificates written to:"
echo "  $CERTS_DIR/localhost.pem"
echo "  $CERTS_DIR/localhost-key.pem"
echo ""
echo "Start the server:"
echo "  docker compose -f docker-compose.standalone.yml up -d --build"
