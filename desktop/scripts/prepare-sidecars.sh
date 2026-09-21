#!/usr/bin/env bash
# Download Node + Surreal binaries and stage sidecar trees for Tauri bundling.
# Usage (from repo root or desktop/):
#   bash desktop/scripts/prepare-sidecars.sh
#   bash desktop/scripts/prepare-sidecars.sh --skip-npm   # binaries only
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
SRC_TAURI="$ROOT/desktop/src-tauri"
BIN_DIR="$SRC_TAURI/binaries"
RES_DIR="$SRC_TAURI/resources"
SKIP_NPM=0
for arg in "$@"; do
  case "$arg" in
    --skip-npm) SKIP_NPM=1 ;;
  esac
done

TRIPLE="${POSR_TARGET_TRIPLE:-}"
if [[ -z "$TRIPLE" ]]; then
  case "$(uname -s)-$(uname -m)" in
    Linux-x86_64) TRIPLE="x86_64-unknown-linux-gnu" ;;
    Linux-aarch64) TRIPLE="aarch64-unknown-linux-gnu" ;;
    Darwin-arm64) TRIPLE="aarch64-apple-darwin" ;;
    Darwin-x86_64) TRIPLE="x86_64-apple-darwin" ;;
    MINGW*|MSYS*|CYGWIN*) TRIPLE="x86_64-pc-windows-msvc" ;;
    *) echo "Unsupported platform; set POSR_TARGET_TRIPLE"; exit 1 ;;
  esac
fi

NODE_VER="${POSR_NODE_VERSION:-v20.19.5}"
SURREAL_VER="${POSR_SURREAL_VERSION:-v3.0.5}"

mkdir -p "$BIN_DIR" "$RES_DIR/sidecars" "$RES_DIR/migrations"

node_dest="$BIN_DIR/node-$TRIPLE"
surreal_dest="$BIN_DIR/surreal-$TRIPLE"
if [[ "$TRIPLE" == *windows* ]]; then
  node_dest="$BIN_DIR/node-$TRIPLE.exe"
  surreal_dest="$BIN_DIR/surreal-$TRIPLE.exe"
fi

download() {
  local url="$1" out="$2"
  if [[ -f "$out" ]]; then
    echo "exists: $out"
    return 0
  fi
  echo "Downloading $url"
  curl -fsSL "$url" -o "$out.partial"
  mv "$out.partial" "$out"
  chmod +x "$out" 2>/dev/null || true
}

# --- Node ---
if [[ ! -f "$node_dest" ]]; then
  tmp="$(mktemp -d)"
  case "$TRIPLE" in
    *linux-gnu)
      arch="x64"; [[ "$TRIPLE" == aarch64* ]] && arch="arm64"
      url="https://nodejs.org/dist/${NODE_VER}/node-${NODE_VER}-linux-${arch}.tar.xz"
      curl -fsSL "$url" | tar -xJ -C "$tmp"
      cp "$tmp"/node-*/bin/node "$node_dest"
      chmod +x "$node_dest"
      ;;
    *apple-darwin)
      arch="x64"; [[ "$TRIPLE" == aarch64* ]] && arch="arm64"
      url="https://nodejs.org/dist/${NODE_VER}/node-${NODE_VER}-darwin-${arch}.tar.gz"
      curl -fsSL "$url" | tar -xz -C "$tmp"
      cp "$tmp"/node-*/bin/node "$node_dest"
      chmod +x "$node_dest"
      ;;
    *windows*)
      arch="x64"
      url="https://nodejs.org/dist/${NODE_VER}/node-${NODE_VER}-win-${arch}.zip"
      curl -fsSL "$url" -o "$tmp/node.zip"
      unzip -q "$tmp/node.zip" -d "$tmp"
      cp "$tmp"/node-*/node.exe "$node_dest"
      ;;
  esac
  rm -rf "$tmp"
  echo "Wrote $node_dest"
else
  echo "exists: $node_dest"
fi

# --- Surreal ---
if [[ ! -f "$surreal_dest" ]]; then
  fetched=0
  case "$TRIPLE" in
    x86_64-unknown-linux-gnu)
      url="https://github.com/surrealdb/surrealdb/releases/download/${SURREAL_VER}/surreal-${SURREAL_VER}.linux-amd64.tgz"
      ;;
    aarch64-unknown-linux-gnu)
      url="https://github.com/surrealdb/surrealdb/releases/download/${SURREAL_VER}/surreal-${SURREAL_VER}.linux-arm64.tgz"
      ;;
    aarch64-apple-darwin)
      url="https://github.com/surrealdb/surrealdb/releases/download/${SURREAL_VER}/surreal-${SURREAL_VER}.darwin-arm64.tgz"
      ;;
    x86_64-apple-darwin)
      url="https://github.com/surrealdb/surrealdb/releases/download/${SURREAL_VER}/surreal-${SURREAL_VER}.darwin-amd64.tgz"
      ;;
    x86_64-pc-windows-msvc)
      url="https://github.com/surrealdb/surrealdb/releases/download/${SURREAL_VER}/surreal-${SURREAL_VER}.windows-amd64.exe"
      if curl -fsSL "$url" -o "$surreal_dest"; then
        echo "Wrote $surreal_dest"
        fetched=1
      fi
      url=""
      ;;
    *) echo "No Surreal download mapping for $TRIPLE"; exit 1 ;;
  esac
  if [[ -n "${url:-}" && "$fetched" -eq 0 ]]; then
    tmp="$(mktemp -d)"
    if curl -fsSL "$url" | tar -xz -C "$tmp"; then
      found="$(find "$tmp" -type f -name 'surreal*' | head -1)"
      cp "$found" "$surreal_dest"
      chmod +x "$surreal_dest"
      echo "Wrote $surreal_dest"
      fetched=1
    else
      echo "WARN: GitHub download failed for Surreal; trying Docker image fallback"
    fi
    rm -rf "$tmp"
  fi
  if [[ "$fetched" -eq 0 && "$TRIPLE" == "x86_64-unknown-linux-gnu" ]] && command -v docker >/dev/null; then
    img="surrealdb/surrealdb:${SURREAL_VER#v}"
    cid="$(docker create "$img")"
    docker cp "$cid:/surreal" "$surreal_dest"
    docker rm "$cid" >/dev/null
    chmod +x "$surreal_dest"
    echo "Wrote $surreal_dest (from $img)"
    fetched=1
  fi
  if [[ "$fetched" -eq 0 ]]; then
    echo "ERROR: could not obtain Surreal binary for $TRIPLE"
    exit 1
  fi
else
  echo "exists: $surreal_dest"
fi

# Tauri externalBin expects binaries/<name> without triple at runtime naming —
# we keep triple-suffixed files as required by Tauri CLI.
echo "Binaries ready under $BIN_DIR"

# --- Stage sidecar sources (+ npm install for release packaging) ---
SERVICES=(gateway printing payments tracking-api api sync-service)
for svc in "${SERVICES[@]}"; do
  src="$ROOT/$svc"
  dest="$RES_DIR/sidecars/$svc"
  if [[ ! -d "$src" ]]; then
    echo "WARN: missing $src"
    continue
  fi
  mkdir -p "$dest"
  # Replace any prior symlink/dev link with a real tree for packaging
  if [[ -L "$dest" ]]; then
    rm -f "$dest"
    mkdir -p "$dest"
  fi
  # Copy JS sources; exclude heavy/dev junk when refreshing
  rsync -a --delete \
    --exclude 'node_modules' \
    --exclude '.git' \
    --exclude 'coverage' \
    --exclude '*.log' \
    "$src/" "$dest/"
  if [[ "$SKIP_NPM" -eq 0 ]]; then
    echo "npm install --omit=dev in $dest"
    (cd "$dest" && npm install --omit=dev --no-fund --no-audit)
  fi
done

# Sample migrations (not auto-applied)
rsync -a --include='*/' --include='*.surql' --exclude='*' \
  "$ROOT/migrations/" "$RES_DIR/migrations/" || true
# Keep demos + latest at top level for discoverability
for f in latest.surql demo-data.surql; do
  if [[ -f "$ROOT/migrations/$f" ]]; then
    cp -f "$ROOT/migrations/$f" "$RES_DIR/migrations/$f"
  fi
done

echo "Sidecar resources staged under $RES_DIR"
echo "Done (triple=$TRIPLE)"
