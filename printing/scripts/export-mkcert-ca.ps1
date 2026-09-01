#Requires -Version 5.1
$ErrorActionPreference = 'Stop'

. (Join-Path $PSScriptRoot 'cert-utils.ps1')

$CertsDir = Join-Path (Split-Path $PSScriptRoot -Parent) 'certs'
$OutPem = Join-Path $CertsDir 'rootCA.pem'
$OutCer = Join-Path $CertsDir 'rootCA.cer'
$LeafPem = Join-Path $CertsDir 'localhost.pem'

if (-not (Get-Command mkcert -ErrorAction SilentlyContinue)) {
    Write-Error 'mkcert is not installed on this PC.'
}

$caRoot = & mkcert -CAROOT
$src = Join-Path $caRoot 'rootCA.pem'

if (-not (Test-Path $src)) {
    throw "mkcert root CA not found at $src. Run: mkcert -install"
}

New-Item -ItemType Directory -Force -Path $CertsDir | Out-Null
Copy-Item -Path $src -Destination $OutPem -Force
Export-PemToDerCer -PemPath $OutPem -CerPath $OutCer

Write-Host 'Copied mkcert root CA to:'
Write-Host "  $OutPem"
Write-Host "  $OutCer"
Write-Host ''

if (Test-Path $LeafPem) {
    if (Test-ServerCertSignedByRoot -LeafPath $LeafPem -RootPath $OutPem) {
        Write-Host 'OK: localhost.pem is signed by this root CA.'
    } else {
        Write-Warning 'localhost.pem is NOT signed by this root CA.'
        Write-Warning 'Re-run setup-local-certs.ps1 on this PC, then export again.'
    }
} else {
    Write-Warning 'localhost.pem not found. Run setup-local-certs.ps1 before starting Docker.'
}

Write-Host ''
Write-Host 'On each client Windows PC (where Chrome/Edge runs):'
Write-Host '  1. Copy only rootCA.pem to that PC'
Write-Host '  2. Admin PowerShell: .\scripts\install-mkcert-ca.ps1'
Write-Host '  3. Run: .\scripts\diagnose-https.ps1 -Url https://<server-ip>:3132/health'
