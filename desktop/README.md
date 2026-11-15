# POSR Desktop (Tauri 2 — offline store)

Native shell around the Vite React app that **starts the full Docker-parity stack locally** (no external Docker required for day-to-day POS):

| Service | Port |
|---------|------|
| SurrealDB | `127.0.0.1:8000` |
| Gateway | `3142` |
| Print | `3132` |
| Payment | `3134` |
| Tracking | `3138` |
| API | `3140` |
| Sync | `3136` |

When the app starts its own SurrealDB, it runs `migrations/scripts/run-prod-migrations.cjs` (the same runner as Docker Compose `migrate`): an empty database gets `latest.surql`, then only pending migrations are applied. Demo data is not seeded. If Surreal is already running on port 8000, migrations are skipped. `POSR_SKIP_MIGRATIONS=1` skips them too. The database setup screen remains for an extra `.surql` import when automatic setup did not finish.

## Ops UX (logs, tray, installer config)

- **No console windows** for Surreal/Node on Windows (`CREATE_NO_WINDOW` + piped stdio).
- **Unified logs** under app data `logs/sidecars.log` + in-app viewer at `/desktop-logs` (also tray → Open logs folder).
- **System tray** shows Surreal / Gateway / Print / Payment / Tracking / API / Sync status (Windows/macOS by default; Linux needs `libayatana-appindicator3-dev` — build auto-enables `--features tray` when pkg-config finds it).
- **Installer settings** (`installer-settings.json` in app data): store name, locale, currency, decimals, timezone, optional AI profiles, integration encryption key.
  - Windows: NSIS post-install runs `configure-posr.ps1` (WinForms wizard).
  - Linux: `posr-desktop-configure` (zenity) shipped in app resources; `.deb` runs `linux/postinst.sh` after install when a display is available.
  - macOS: `macos/configure-posr.sh` (osascript).
- Sidecar binaries are named `posr-node` / `posr-surreal` (not `node` / `surreal`) so `.deb` install does not overwrite `/usr/bin/node`.
- Linux packages build **deb + AppImage** only (RPM skipped — often hangs without full rpm tooling).
- Service URLs stay `127.0.0.1` (baked at frontend build). Locale/currency use a **runtime config bridge** on desktop.
- Code signing / SmartScreen is still out of scope; prefer Windows 10/11 for support.

## Prerequisites

1. **Rust** ([rustup](https://rustup.rs/)) + platform WebView deps  
2. **Bun** + **Node** (dev) / prepare script downloads bundled Node for release  
3. Print native deps once: `cd printing && npm install` (and `npm install` in `gateway`, `payments`, `tracking-api`, `api`, `sync-service` for local sidecars)  
4. Copy env for JWT/Surreal defaults (optional — desktop generates secrets into app data if missing):

```bash
cp .env.example .env.local   # or copy from your main checkout
```

5. Download/stage binaries (Surreal 3.0.5 + Node 20):

```bash
bun run desktop:prepare:bin    # binaries only
# release packaging (copies services + npm install --omit=dev):
bun run desktop:prepare
```

Linux: if GitHub downloads fail, the prepare script can pull Surreal from the `surrealdb/surrealdb:v3.0.5` Docker image.

## Dev (no Docker)

Stop compose services that bind the same ports (`surrealdb`, `gateway`, `printer`, …) **or** set `POSR_USE_EXTERNAL_SERVICES=1` to reuse them.

```bash
# free ports if needed
docker stop posr-react-app-1 posr-react-printer-1 posr-react-gateway-1 \
  posr-react-surrealdb-1 posr-react-payment-1 posr-react-tracking-1 \
  posr-react-api-1 posr-react-sync-1 2>/dev/null || true

export POSR_REPO_ROOT="$(pwd)"
bun run desktop:dev
```

On first run the schema is applied automatically. Optional demo data can be imported later from settings (`migrations/demo-data.surql`).

### USB printing (host Node)

| OS | Note |
|----|------|
| Linux | Device nodes are often `root:lp`. Add your user to `lp` or use udev; Docker printer as root avoids this. |
| Windows | Install WinUSB via [Zadig](https://zadig.akeo.ie/) for the receipt printer (see `printing/README.md`). |

## Production build

```bash
bun run desktop:prepare          # binaries + sidecar trees with node_modules
bun run desktop:build            # Linux .deb (default; skips RPM)
bun run desktop:build:linux      # Linux deb + AppImage
bun run desktop:build:windows    # on Windows → NSIS setup.exe
```

`beforeBuildCommand` runs `desktop/scripts/build-frontend.sh`, which builds Vite with localhost `VITE_*` URLs.

Artifacts: `desktop/src-tauri/target/release/bundle/`  
App data (DB + `desktop-config.json`): platform app-data dir for `com.posr.desktop`.

### Env overrides

- `POSR_REPO_ROOT` — repo root for resolving services in dev  
- `POSR_APP_DATA` — override Surreal data / config directory  
- `NODE_BINARY` / `SURREAL_BINARY` — force binary paths  
- `POSR_USE_EXTERNAL_SERVICES=1` — do not spawn sidecars (use Docker/existing)  
- `POSR_SKIP_MIGRATIONS=1` — do not run schema migrations after Surreal starts  
- `GATEWAY_ALLOWED_ORIGINS` — CORS allow-list for all Node sidecars  

## Windows

Build NSIS **on Windows** (MSVC + WebView2). See `tauri.ps1` / `tauri.windows.conf.json`. Run `desktop/scripts/prepare-sidecars.ps1` before `bun run desktop:build:windows`.

### GitHub Actions (manual)

On branch `feature/tauri-mvp` (or any branch with this workflow):

1. GitHub → **Actions** → **Desktop Windows build** → **Run workflow**
2. Pick the branch; optionally enable **Upload installer to a GitHub draft release** and set a tag
3. When finished, download **`posr-desktop-windows-nsis`** from the run’s Artifacts (share the `*-setup.exe` with QA)

## Out of scope (later)

- Code signing / notarization  
- Bundled payment webhook public URL  
- Mobile / Terminal-only SKU  
