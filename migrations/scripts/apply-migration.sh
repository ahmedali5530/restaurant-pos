#!/usr/bin/env bash
# Apply a .surql migration against the local SurrealDB 3.x container.
#
# Why: the host `surreal` binary is often 2.x and returns HTTP 400 against a 3.x
# server. Always use the CLI bundled in the surrealdb container.
#
# Usage:
#   ./migrations/scripts/apply-migration.sh migrations/2026_07_17_inventory_lifecycle.surql
#   ./migrations/scripts/apply-migration.sh migrations/2026_07_17_inventory_ledger.surql
#
# Env overrides:
#   SURREAL_CONTAINER   default: posr-react-surrealdb-1
#   SURREAL_NS          default: posr
#   SURREAL_DB          default: posr
#   SURREAL_USER        default: root
#   SURREAL_PASS        default: root

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
FILE="${1:-}"

if [[ -z "$FILE" ]]; then
  echo "Usage: $0 <path-to-migration.surql>" >&2
  exit 1
fi

if [[ ! -f "$FILE" ]]; then
  if [[ -f "$ROOT_DIR/$FILE" ]]; then
    FILE="$ROOT_DIR/$FILE"
  else
    echo "Migration file not found: $FILE" >&2
    exit 1
  fi
fi

CONTAINER="${SURREAL_CONTAINER:-posr-react-surrealdb-1}"
NS="${SURREAL_NS:-posr}"
DB="${SURREAL_DB:-posr}"
USER="${SURREAL_USER:-root}"
PASS="${SURREAL_PASS:-root}"

if ! docker ps --format '{{.Names}}' | grep -qx "$CONTAINER"; then
  echo "SurrealDB container '$CONTAINER' is not running." >&2
  echo "Start it with: docker compose up -d surrealdb" >&2
  exit 1
fi

VERSION="$(docker exec "$CONTAINER" /surreal version 2>/dev/null | head -1 || true)"
echo "Applying $(basename "$FILE") via $CONTAINER ($VERSION)"
echo "  ns=$NS db=$DB"

# --multi: allow multi-line statements (newlines do not end a statement; use ;)
# Host surreal 2.x is incompatible with server 3.x — always use the container CLI.
docker exec -i "$CONTAINER" /surreal sql \
  --endpoint http://127.0.0.1:8000 \
  --username "$USER" \
  --password "$PASS" \
  --namespace "$NS" \
  --database "$DB" \
  --pretty \
  --multi \
  --hide-welcome < "$FILE"

echo "Done: $(basename "$FILE")"
