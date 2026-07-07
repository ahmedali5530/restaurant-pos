#Requires -Version 5.1
param(
    [string[]] $LocalIp
)

$ErrorActionPreference = 'Stop'

function Show-Usage {
    @"
Usage:
  .\scripts\setup-local-certs.ps1 [-LocalIp] <ip> [<ip> ...]

Examples:
  .\scripts\setup-local-certs.ps1
  .\scripts\setup-local-certs.ps1 -LocalIp 192.168.1.50
  .\scripts\setup-local-certs.ps1 192.168.1.50

Note: -cert-file is the output PEM filename, not an IP address.
IPs are passed as separate mkcert arguments after the flags.
"@
}

if ($LocalIp -contains '-h' -or $LocalIp -contains '--help') {
    Show-Usage
    exit 0
}

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

$hosts = [System.Collections.Generic.List[string]]::new()
foreach ($entry in @('localhost', '127.0.0.1', '::1') + $LocalIp) {
    if ($entry -and -not $hosts.Contains($entry)) {
        [void]$hosts.Add($entry)
    }
}

New-Item -ItemType Directory -Force -Path $CertsDir | Out-Null

Write-Host 'Installing local CA (may prompt for administrator approval)...'
& mkcert -install
if ($LASTEXITCODE -ne 0) {
    throw 'mkcert -install failed. Try running PowerShell as Administrator.'
}

$certFile = Join-Path $CertsDir 'localhost.pem'
$keyFile = Join-Path $CertsDir 'localhost-key.pem'

Write-Host "Generating certificate for: $($hosts -join ', ')"

$mkcertArgs = @(
    '-cert-file', $certFile,
    '-key-file', $keyFile
) + $hosts

& mkcert @mkcertArgs
if ($LASTEXITCODE -ne 0) {
    throw @"
mkcert certificate generation failed.

Correct syntax example:
  mkcert -cert-file localhost.pem -key-file localhost-key.pem localhost 127.0.0.1 192.168.1.50

Wrong (IP is not a filename):
  mkcert -cert-file 192.168.1.50 ...
"@
}

$caddyHosts = $hosts | Where-Object { $_ -ne '::1' }
Set-Content -Path (Join-Path $CertsDir 'tls-hosts.txt') -Value ($caddyHosts -join ',') -NoNewline

Write-Host ''
Write-Host 'Certificates written to:'
Write-Host "  $certFile"
Write-Host "  $keyFile"
Write-Host "  $(Join-Path $CertsDir 'tls-hosts.txt')"
Write-Host ''
Write-Host "HTTPS hosts: $((Get-Content (Join-Path $CertsDir 'tls-hosts.txt') -Raw).Trim())"
Write-Host ''
Write-Host 'Start the server:'
Write-Host '  docker compose -f docker-compose.standalone.yml up -d --build'
