#!/bin/sh
set -eu

TLS_CERT="${TLS_CERT:-/certs/localhost.pem}"
TLS_KEY="${TLS_KEY:-/certs/localhost-key.pem}"
PRINT_PORT="${PRINT_PORT:-3132}"
PRINT_HOST="${PRINT_HOST:-127.0.0.1}"

if [ ! -r "$TLS_CERT" ] || [ ! -r "$TLS_KEY" ]; then
  echo "ERROR: TLS certificate files not found or not readable." >&2
  echo "  Expected: $TLS_CERT and $TLS_KEY" >&2
  echo "  Run on the host:" >&2
  echo "    Linux/macOS: ./scripts/setup-local-certs.sh" >&2
  echo "    Windows:     .\\scripts\\setup-local-certs.ps1" >&2
  exit 1
fi

CADDYFILE=/etc/caddy/Caddyfile
mkdir -p /etc/caddy

# Bind :443 only — host/IP site addresses break for raw IP access
cat > "$CADDYFILE" <<EOF
:443 {
  tls $TLS_CERT $TLS_KEY
  reverse_proxy ${PRINT_HOST}:${PRINT_PORT}
}
EOF

node server.js &
NODE_PID=$!

cleanup() {
  kill "$NODE_PID" 2>/dev/null || true
  wait "$NODE_PID" 2>/dev/null || true
}
trap cleanup INT TERM EXIT

echo "Print server listening on http://${PRINT_HOST}:${PRINT_PORT}"
echo "HTTPS listening on :443 (cert SANs from mkcert / tls-hosts.txt)"

exec caddy run --config "$CADDYFILE"
