# Download Node + Surreal and stage sidecar trees for Tauri (Windows).
# Run from repo root:  powershell -File desktop/scripts/prepare-sidecars.ps1
param(
  [switch]$SkipNpm
)

$ErrorActionPreference = "Stop"
$Root = (Resolve-Path (Join-Path $PSScriptRoot "../..")).Path
$SrcTauri = Join-Path $Root "desktop/src-tauri"
$BinDir = Join-Path $SrcTauri "binaries"
$ResDir = Join-Path $SrcTauri "resources"
$Triple = if ($env:POSR_TARGET_TRIPLE) { $env:POSR_TARGET_TRIPLE } else { "x86_64-pc-windows-msvc" }
$NodeVer = if ($env:POSR_NODE_VERSION) { $env:POSR_NODE_VERSION } else { "v20.19.5" }
$SurrealVer = if ($env:POSR_SURREAL_VERSION) { $env:POSR_SURREAL_VERSION } else { "v3.0.5" }

New-Item -ItemType Directory -Force -Path $BinDir, (Join-Path $ResDir "sidecars"), (Join-Path $ResDir "migrations") | Out-Null

$nodeDest = Join-Path $BinDir "node-$Triple.exe"
$surrealDest = Join-Path $BinDir "surreal-$Triple.exe"

if (-not (Test-Path $nodeDest)) {
  $tmp = Join-Path $env:TEMP ("posr-node-" + [guid]::NewGuid())
  New-Item -ItemType Directory -Path $tmp | Out-Null
  $url = "https://nodejs.org/dist/$NodeVer/node-$NodeVer-win-x64.zip"
  $zip = Join-Path $tmp "node.zip"
  Write-Host "Downloading $url"
  Invoke-WebRequest -Uri $url -OutFile $zip
  Expand-Archive -Path $zip -DestinationPath $tmp
  Copy-Item (Join-Path $tmp "node-$NodeVer-win-x64/node.exe") $nodeDest
  Remove-Item -Recurse -Force $tmp
}

if (-not (Test-Path $surrealDest)) {
  $url = "https://github.com/surrealdb/surrealdb/releases/download/$SurrealVer/surreal-$SurrealVer.windows-amd64.exe"
  Write-Host "Downloading $url"
  Invoke-WebRequest -Uri $url -OutFile $surrealDest
}

$services = @("gateway", "printing", "payments", "tracking-api", "api", "sync-service")
foreach ($svc in $services) {
  $src = Join-Path $Root $svc
  $dest = Join-Path $ResDir "sidecars/$svc"
  if (-not (Test-Path $src)) { Write-Warning "missing $src"; continue }
  New-Item -ItemType Directory -Force -Path $dest | Out-Null
  robocopy $src $dest /MIR /XD node_modules .git coverage /NFL /NDL /NJH /NJS /nc /ns /np | Out-Null
  if (-not $SkipNpm) {
    Push-Location $dest
    npm install --omit=dev --no-fund --no-audit
    Pop-Location
  }
}

Copy-Item (Join-Path $Root "migrations/*.surql") (Join-Path $ResDir "migrations") -ErrorAction SilentlyContinue
Write-Host "Done (triple=$Triple)"
