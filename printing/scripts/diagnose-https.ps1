#Requires -Version 5.1
param(
    [string] $Url = 'https://localhost:3132/health'
)

$ErrorActionPreference = 'Continue'

. (Join-Path $PSScriptRoot 'cert-utils.ps1')

$CertsDir = Join-Path (Split-Path $PSScriptRoot -Parent) 'certs'
$LeafPem = Join-Path $CertsDir 'localhost.pem'
$RootPem = Join-Path $CertsDir 'rootCA.pem'
$HostsFile = Join-Path $CertsDir 'tls-hosts.txt'

$uri = [Uri]$Url
$hostName = $uri.Host
$port = if ($uri.Port -gt 0) { $uri.Port } else { 443 }

Write-Host "=== HTTPS diagnose: $Url ==="
Write-Host ''

$issues = New-Object System.Collections.Generic.List[string]

Write-Host '--- Local files (print server folder) ---'
if (Test-Path $LeafPem) {
    Write-Host "OK  localhost.pem exists"
} else {
    $issues.Add('Missing localhost.pem - run setup-local-certs.ps1 on the print-server PC.')
    Write-Host "FAIL localhost.pem missing"
}

if (Test-Path $RootPem) {
    Write-Host "OK  rootCA.pem exists"
} else {
    $issues.Add('Missing rootCA.pem - run export-mkcert-ca.ps1 on the print-server PC.')
    Write-Host "FAIL rootCA.pem missing"
}

if (Test-Path $HostsFile) {
    Write-Host "OK  tls-hosts.txt: $((Get-Content $HostsFile -Raw).Trim())"
} else {
    Write-Host "WARN tls-hosts.txt missing"
}

if ((Test-Path $LeafPem) -and (Test-Path $RootPem)) {
    if (Test-ServerCertSignedByRoot -LeafPath $LeafPem -RootPath $RootPem) {
        Write-Host 'OK  localhost.pem signed by rootCA.pem'
    } else {
        $issues.Add('localhost.pem and rootCA.pem do not match. On print-server PC run setup-local-certs.ps1 then export-mkcert-ca.ps1 again.')
        Write-Host 'FAIL localhost.pem is not signed by rootCA.pem'
    }

    $leaf = Get-PemCertificate $LeafPem
    $sans = Get-CertificateSanList $leaf
    Write-Host "OK  server cert names: $($sans -join ', ')"

    $hostOk = $false
    foreach ($name in $sans) {
        if ($name -eq $hostName) { $hostOk = $true }
    }
    if ($hostOk) {
        Write-Host "OK  URL host '$hostName' is in the server certificate"
    } else {
        $issues.Add("URL host '$hostName' is not in the certificate. Re-run: .\scripts\setup-local-certs.ps1 $hostName then restart Docker.")
        Write-Host "FAIL URL host '$hostName' is NOT in the server certificate"
    }
}

Write-Host ''
Write-Host '--- Root CA trust on THIS Windows PC ---'
if (Test-Path $RootPem) {
    $trust = Test-RootCaTrusted -RootPath $RootPem
    if ($trust.Trusted) {
        Write-Host "OK  root CA trusted in $($trust.Location) \ Root"
    } else {
        $issues.Add('root CA is not trusted on this PC. Admin PowerShell: .\scripts\install-mkcert-ca.ps1')
        Write-Host 'FAIL root CA is not in Windows Trusted Root on this PC'
    }
} else {
    Write-Host 'SKIP root CA trust check (rootCA.pem not in certs folder on this PC)'
    Write-Host '     Copy rootCA.pem from the print-server PC and run install-mkcert-ca.ps1 here.'
}

Write-Host ''
Write-Host '--- Live TLS check ---'
try {
    $remote = Get-RemoteTlsCertificate -HostName $hostName -Port $port
    Write-Host "OK  server presented cert: $($remote.Subject)"
    $remoteSans = Get-CertificateSanList $remote
    Write-Host "OK  live cert names: $($remoteSans -join ', ')"

    if (Test-Path $RootPem) {
        $root = Get-PemCertificate $RootPem
        if ($remote.Issuer -eq $root.Subject) {
            Write-Host 'OK  live cert issuer matches rootCA.pem'
        } else {
            $issues.Add('Live server cert was not signed by your rootCA.pem. Re-export from the print-server PC and restart Docker.')
            Write-Host 'FAIL live cert issuer does not match rootCA.pem'
            Write-Host "     issuer:  $($remote.Issuer)"
            Write-Host "     expected:$($root.Subject)"
        }
    }
} catch {
    $issues.Add("Cannot connect to ${hostName}:${port} - is Docker running? docker compose -f docker-compose.standalone.yml up -d --build")
    Write-Host "FAIL cannot connect to ${hostName}:${port}"
    Write-Host "     $($_.Exception.Message)"
}

Write-Host ''
Write-Host '--- Browser test ---'
try {
    $resp = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 10
    Write-Host "OK  HTTPS request succeeded ($($resp.StatusCode))"
} catch {
    if ($_.Exception.Message -match 'SSL|certificate|trust|secure channel') {
        $issues.Add('HTTPS request failed SSL validation. Fix issues above, quit Chrome/Edge completely, reopen.')
        Write-Host 'FAIL HTTPS SSL validation failed'
    } else {
        $issues.Add("HTTPS request failed: $($_.Exception.Message)")
        Write-Host "FAIL HTTPS request failed: $($_.Exception.Message)"
    }
}

Write-Host ''
if ($issues.Count -eq 0) {
    Write-Host 'All checks passed. If Chrome still warns, fully exit Chrome/Edge and try InPrivate.'
} else {
    Write-Host 'Issues found:'
    $i = 1
    foreach ($issue in $issues) {
        Write-Host "  $i. $issue"
        $i++
    }
    Write-Host ''
    Write-Host 'Typical fix order on print-server PC:'
    Write-Host '  1. .\scripts\setup-local-certs.ps1 <your-lan-ip>'
    Write-Host '  2. .\scripts\export-mkcert-ca.ps1'
    Write-Host '  3. docker compose -f docker-compose.standalone.yml up -d --build'
    Write-Host 'On each client PC where the browser runs:'
    Write-Host '  4. copy rootCA.pem, then Admin: .\scripts\install-mkcert-ca.ps1'
    Write-Host '  5. .\scripts\diagnose-https.ps1 -Url https://<server-ip>:3132/health'
}
