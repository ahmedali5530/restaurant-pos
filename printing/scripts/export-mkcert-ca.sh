#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CERTS_DIR="$(cd "$SCRIPT_DIR/.." && pwd)/certs"
CERT_FILE="$CERTS_DIR/localhost.pem"
HOSTS_FILE="$CERTS_DIR/tls-hosts.txt"
OUT_FILE="$CERTS_DIR/rootCA.pem"

if ! command -v mkcert >/dev/null 2>&1; then
  echo "ERROR: mkcert is not installed." >&2
  exit 1
fi

CA_ROOT="$(mkcert -CAROOT)"
SRC="$CA_ROOT/rootCA.pem"

if [[ ! -r "$SRC" ]]; then
  echo "ERROR: mkcert root CA not found at $SRC" >&2
  echo "Run: mkcert -install" >&2
  exit 1
fi

mkdir -p "$CERTS_DIR"
cp "$SRC" "$OUT_FILE"

echo "Copied mkcert root CA to:"
echo "  $OUT_FILE"
echo ""
echo "Install on other devices (tablets, other PCs) so https://<lan-ip>:3132 is trusted:"
echo "  Windows: double-click rootCA.pem -> Local Machine -> Trusted Root Certification Authorities"
echo "  Android: Settings -> Security -> Install certificate -> CA certificate"
echo "  macOS:   open rootCA.pem in Keychain Access -> Always Trust"
echo ""
echo "Each device only needs the root CA once. Server certs can be regenerated without re-copying."
