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

# Caddy site addresses must be comma-separated with a space: "a, b, c"
normalize_tls_hosts() {
  printf '%s' "$1" | awk -F',' '{
    out = ""
    for (i = 1; i <= NF; i++) {
      gsub(/^[ \t]+|[ \t]+$/, "", $i)
      if ($i != "") {
        if (out != "") out = out ", "
        out = out $i
      }
    }
    print out
  }'
}

if [ -f /certs/tls-hosts.txt ]; then
  TLS_HOSTS=$(normalize_tls_hosts "$(tr -d '\n\r' < /certs/tls-hosts.txt)")
elif [ -n "${PRINT_TLS_HOSTS:-}" ]; then
  TLS_HOSTS=$(normalize_tls_hosts "$PRINT_TLS_HOSTS")
else
  TLS_HOSTS="localhost, 127.0.0.1"
fi

cat > "$CADDYFILE" <<EOF
${TLS_HOSTS} {
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
echo "HTTPS hosts: ${TLS_HOSTS}"

exec caddy run --config "$CADDYFILE"
