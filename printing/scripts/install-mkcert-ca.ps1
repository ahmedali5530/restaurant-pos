#Requires -Version 5.1
param(
    [string] $CaFile
)

$ErrorActionPreference = 'Stop'

. (Join-Path $PSScriptRoot 'cert-utils.ps1')

$CertsDir = Join-Path (Split-Path $PSScriptRoot -Parent) 'certs'
$CaFile = if ($CaFile) { $CaFile } else { Join-Path $CertsDir 'rootCA.pem' }

if (-not (Test-Path $CaFile)) {
    Write-Error @"
Root CA file not found: $CaFile

On the print-server PC run first:
  .\scripts\export-mkcert-ca.ps1

Copy printing\certs\rootCA.pem to this Windows machine, then run this script again.
"@
}

$fileName = [IO.Path]::GetFileName($CaFile).ToLower()
if ($fileName -eq 'localhost.pem' -or $fileName -eq 'localhost-key.pem') {
    Write-Error @"
Wrong file: $CaFile

Do NOT import localhost.pem into Trusted Root - that is the server certificate.
Use rootCA.pem from export-mkcert-ca.ps1 instead.
"@
}

if (-not (Test-IsMkcertRootCa -Path $CaFile)) {
    throw "File does not look like an mkcert root CA: $CaFile"
}

$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()
).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

Write-Host ''
Write-Host "Installing mkcert root CA: $CaFile"

if ($isAdmin) {
    $added = Install-RootCaCertificate -Path $CaFile -StoreLocation LocalMachine
    if ($added) {
        Write-Host 'Added to: Local Machine \ Trusted Root Certification Authorities'
    } else {
        Write-Host 'Already present in: Local Machine \ Trusted Root Certification Authorities'
    }
} else {
    Write-Warning 'Not running as Administrator.'
    Write-Warning 'Chrome/Edge on POS kiosks usually need Local Machine trust. Re-run as Administrator.'
    $added = Install-RootCaCertificate -Path $CaFile -StoreLocation CurrentUser
    if ($added) {
        Write-Host 'Added to: Current User \ Trusted Root Certification Authorities'
    } else {
        Write-Host 'Already present in: Current User \ Trusted Root Certification Authorities'
    }
}

$trust = Test-RootCaTrusted -RootPath $CaFile
if (-not $trust.Trusted) {
    throw 'Root CA install did not complete. Re-run PowerShell as Administrator.'
}

Write-Host "Verified trusted in: $($trust.Location) \ Root"
Write-Host ''
Write-Host 'Next steps:'
Write-Host '  1. Fully quit Chrome and Edge (system tray -> Exit), then reopen.'
Write-Host '  2. Run: .\scripts\diagnose-https.ps1 -Url https://<print-server-ip>:3132/health'
Write-Host '  3. On the print-server PC, restart Docker after any cert change:'
Write-Host '       docker compose -f docker-compose.standalone.yml up -d --build'
