#Requires -Version 5.1
$ErrorActionPreference = 'Stop'

$CertsDir = Join-Path (Split-Path $PSScriptRoot -Parent) 'certs'

if (-not (Get-Command mkcert -ErrorAction SilentlyContinue)) {
    Write-Error @"
mkcert is not installed or not on PATH.

Install options:
  winget install FiloSottile.mkcert
  choco install mkcert

Or download from https://github.com/FiloSottile/mkcert/releases
"@
    exit 1
}

New-Item -ItemType Directory -Force -Path $CertsDir | Out-Null

Write-Host 'Installing local CA (may prompt for administrator approval)...'
& mkcert -install
if ($LASTEXITCODE -ne 0) {
    throw 'mkcert -install failed. Try running PowerShell as Administrator.'
}

Push-Location $CertsDir
try {
    & mkcert -cert-file localhost.pem -key-file localhost-key.pem localhost 127.0.0.1 ::1
    if ($LASTEXITCODE -ne 0) {
        throw 'mkcert certificate generation failed.'
    }
}
finally {
    Pop-Location
}

Write-Host ''
Write-Host 'Certificates written to:'
Write-Host "  $(Join-Path $CertsDir 'localhost.pem')"
Write-Host "  $(Join-Path $CertsDir 'localhost-key.pem')"
Write-Host ''
Write-Host 'Start the server:'
Write-Host '  docker compose -f docker-compose.standalone.yml up -d --build'
