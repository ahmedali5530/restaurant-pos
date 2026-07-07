#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CERTS_DIR="$(cd "$SCRIPT_DIR/.." && pwd)/certs"

usage() {
  cat <<'EOF'
Usage:
  ./scripts/setup-local-certs.sh [local-ip ...]

Examples:
  ./scripts/setup-local-certs.sh
  ./scripts/setup-local-certs.sh 192.168.1.50
  LOCAL_IP=192.168.1.50 ./scripts/setup-local-certs.sh

IPs are passed to mkcert as hostnames/SANs (not as -cert-file values).
EOF
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  usage
  exit 0
fi

if ! command -v mkcert >/dev/null 2>&1; then
  echo "ERROR: mkcert is not installed." >&2
  echo "Install from https://github.com/FiloSottile/mkcert" >&2
  exit 1
fi

HOSTS=(localhost 127.0.0.1 ::1)

if [[ -n "${LOCAL_IP:-}" ]]; then
  HOSTS+=("$LOCAL_IP")
fi

for arg in "$@"; do
  HOSTS+=("$arg")
done

# De-duplicate while preserving order
declare -A seen=()
UNIQUE_HOSTS=()
for host in "${HOSTS[@]}"; do
  if [[ -z "${seen[$host]:-}" ]]; then
    seen[$host]=1
    UNIQUE_HOSTS+=("$host")
  fi
done

mkdir -p "$CERTS_DIR"

echo "Installing local CA (may prompt for sudo)..."
mkcert -install

cd "$CERTS_DIR"
echo "Generating certificate for: ${UNIQUE_HOSTS[*]}"
mkcert -cert-file localhost.pem -key-file localhost-key.pem "${UNIQUE_HOSTS[@]}"

# Caddy site block (skip IPv6 literal for the site address list)
CADDY_HOSTS=()
for host in "${UNIQUE_HOSTS[@]}"; do
  if [[ "$host" != "::1" ]]; then
    CADDY_HOSTS+=("$host")
  fi
done
printf '%s\n' "$(IFS=,; echo "${CADDY_HOSTS[*]}")" > tls-hosts.txt

echo ""
echo "Certificates written to:"
echo "  $CERTS_DIR/localhost.pem"
echo "  $CERTS_DIR/localhost-key.pem"
echo "  $CERTS_DIR/tls-hosts.txt"
echo ""
echo "HTTPS hosts: $(cat tls-hosts.txt)"
echo ""
echo "Start the server:"
echo "  docker compose -f docker-compose.standalone.yml up -d --build"
