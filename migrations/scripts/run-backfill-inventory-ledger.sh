#!/usr/bin/env bash
# Run inventory ledger backfill using payments/ node_modules (surrealdb + ws).
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
PAYMENTS_DIR="$ROOT_DIR/payments"
SCRIPT="$ROOT_DIR/migrations/scripts/backfill-inventory-ledger.cjs"

if [[ ! -d "$PAYMENTS_DIR/node_modules/surrealdb" ]]; then
  echo "Missing payments/node_modules/surrealdb. Run: (cd payments && npm install)" >&2
  exit 1
fi

export SURREAL_URL="${SURREAL_URL:-ws://localhost:8000/rpc}"
export SURREAL_NS="${SURREAL_NS:-posr}"
export SURREAL_DB="${SURREAL_DB:-posr}"
export SURREAL_USER="${SURREAL_USER:-root}"
export SURREAL_PASS="${SURREAL_PASS:-root}"
export NODE_PATH="$PAYMENTS_DIR/node_modules${NODE_PATH:+:$NODE_PATH}"

cd "$PAYMENTS_DIR"
exec node "$SCRIPT" "$@"
