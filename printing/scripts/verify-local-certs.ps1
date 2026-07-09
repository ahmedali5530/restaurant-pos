#Requires -Version 5.1
$ErrorActionPreference = 'Stop'

$CertsDir = Join-Path (Split-Path $PSScriptRoot -Parent) 'certs'
$CertFile = Join-Path $CertsDir 'localhost.pem'
$HostsFile = Join-Path $CertsDir 'tls-hosts.txt'

if (-not (Test-Path $CertFile)) {
    Write-Error "Certificate not found: $CertFile`nRun .\scripts\setup-local-certs.ps1 first."
}

Write-Host '=== mkcert CA ==='
if (Get-Command mkcert -ErrorAction SilentlyContinue) {
    $caRoot = & mkcert -CAROOT
    Write-Host "CA folder: $caRoot"
    Write-Host "Root CA:   $(Join-Path $caRoot 'rootCA.pem')"
} else {
    Write-Host 'mkcert not found on PATH.'
}

Write-Host ''
Write-Host '=== Caddy hosts (tls-hosts.txt) ==='
if (Test-Path $HostsFile) {
    Write-Host (Get-Content $HostsFile -Raw).Trim()
} else {
    Write-Host '(missing - defaults to localhost, 127.0.0.1)'
}

Write-Host ''
Write-Host '=== Certificate names (SAN) ==='
$cert = New-Object System.Security.Cryptography.X509Certificates.X509Certificate2($CertFile)
$found = $false
foreach ($ext in $cert.Extensions) {
    if ($ext.Oid.Value -eq '2.5.29.17') {
        $san = $ext.Format($false)
        Write-Host $san
        $found = $true
    }
}
if (-not $found) {
    Write-Host $cert.Subject
}

Write-Host '=== Windows trust check ==='
$rootCaPath = Join-Path $CertsDir 'rootCA.pem'
if (Test-Path $rootCaPath) {
    try {
        $rootCa = New-Object System.Security.Cryptography.X509Certificates.X509Certificate2($rootCaPath)
        $thumb = $rootCa.Thumbprint
        $stores = @(
            'Cert:\LocalMachine\Root',
            'Cert:\CurrentUser\Root'
        )
        $trusted = $false
        foreach ($storePath in $stores) {
            $match = Get-ChildItem $storePath -ErrorAction SilentlyContinue |
                Where-Object { $_.Thumbprint -eq $thumb }
            if ($match) {
                Write-Host "Trusted in: $storePath"
                $trusted = $true
            }
        }
        if (-not $trusted) {
            Write-Host 'mkcert root CA is NOT in Windows Trusted Root on this machine.'
            Write-Host 'Run as Administrator: .\scripts\install-mkcert-ca.ps1'
        }
    } catch {
        Write-Host 'Could not read rootCA.pem for trust check.'
    }
} else {
    Write-Host 'rootCA.pem not in certs/ - run .\scripts\export-mkcert-ca.ps1'
}

Write-Host ''
Write-Host '=== Why localhost works but LAN IP may not ==='
Write-Host @'
- https://localhost works on THIS PC because mkcert -install trusted the CA here.
- https://192.168.x.x on another device will warn until that device trusts the mkcert root CA.
  On Windows use install-mkcert-ca.ps1 with rootCA.pem (not localhost.pem).
- On THIS PC, LAN IP should work if that exact IP is listed in the SAN above.
  If not, re-run: .\scripts\setup-local-certs.ps1 <your-ip>
  then: docker compose -f docker-compose.standalone.yml up -d --build

Tip: If the POS browser runs on the same machine as Docker, use:
  VITE_PRINT_SERVER_URL=https://localhost:3132
'@
