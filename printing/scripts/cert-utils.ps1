#Requires -Version 5.1
$ErrorActionPreference = 'Stop'

function Get-PemCertificate {
    param([Parameter(Mandatory = $true)][string] $Path)

    if ($Path.ToLower().EndsWith('.cer')) {
        return New-Object System.Security.Cryptography.X509Certificates.X509Certificate2($Path)
    }

    $text = Get-Content $Path -Raw
    if ($text -notmatch 'BEGIN CERTIFICATE') {
        throw "Not a PEM certificate: $Path"
    }

    $b64 = ($text -replace '-----BEGIN CERTIFICATE-----|-----END CERTIFICATE-----|\s', '')
    $bytes = [Convert]::FromBase64String($b64)
    $cert = New-Object System.Security.Cryptography.X509Certificates.X509Certificate2
    $cert.Import($bytes)
    return $cert
}

function Export-PemToDerCer {
    param(
        [Parameter(Mandatory = $true)][string] $PemPath,
        [Parameter(Mandatory = $true)][string] $CerPath
    )

    $cert = Get-PemCertificate $PemPath
    $der = $cert.Export([System.Security.Cryptography.X509Certificates.X509ContentType]::Cert)
    [IO.File]::WriteAllBytes($CerPath, $der)
}

function Test-IsMkcertRootCa {
    param([Parameter(Mandatory = $true)][string] $Path)

    try {
        $cert = Get-PemCertificate $Path
        return $cert.Subject -like '*mkcert*'
    } catch {
        return $false
    }
}

function Get-CertificateSanList {
    param([System.Security.Cryptography.X509Certificates.X509Certificate2] $Certificate)

    $names = New-Object System.Collections.Generic.List[string]
    foreach ($ext in $Certificate.Extensions) {
        if ($ext.Oid.Value -ne '2.5.29.17') { continue }
        $raw = $ext.Format($true)
        foreach ($line in ($raw -split "`n")) {
            if ($line -match 'DNS Name=(.+)$') { [void]$names.Add($matches[1].Trim()) }
            if ($line -match 'IP Address=([0-9a-fA-F:\.]+)$') { [void]$names.Add($matches[1].Trim()) }
        }
    }
    return $names
}

function Test-ServerCertSignedByRoot {
    param(
        [Parameter(Mandatory = $true)][string] $LeafPath,
        [Parameter(Mandatory = $true)][string] $RootPath
    )

    $leaf = Get-PemCertificate $LeafPath
    $root = Get-PemCertificate $RootPath
    return ($leaf.Issuer -eq $root.Subject)
}

function Install-RootCaCertificate {
    param(
        [Parameter(Mandatory = $true)][string] $Path,
        [ValidateSet('LocalMachine', 'CurrentUser')]
        [string] $StoreLocation = 'LocalMachine'
    )

    $cert = Get-PemCertificate $Path
    $store = New-Object System.Security.Cryptography.X509Certificates.X509Store('Root', $StoreLocation)
    $store.Open([System.Security.Cryptography.X509Certificates.OpenFlags]::ReadWrite)
    try {
        $existing = $store.Certificates.Find(
            [System.Security.Cryptography.X509Certificates.X509FindType]::FindByThumbprint,
            $cert.Thumbprint,
            $false
        )
        if ($existing.Count -gt 0) {
            return $false
        }
        $store.Add($cert)
        return $true
    } finally {
        $store.Close()
    }
}

function Test-RootCaTrusted {
    param([Parameter(Mandatory = $true)][string] $RootPath)

    $cert = Get-PemCertificate $RootPath
    foreach ($location in @('LocalMachine', 'CurrentUser')) {
        $store = New-Object System.Security.Cryptography.X509Certificates.X509Store('Root', $location)
        $store.Open([System.Security.Cryptography.X509Certificates.OpenFlags]::ReadOnly)
        try {
            $match = $store.Certificates.Find(
                [System.Security.Cryptography.X509Certificates.X509FindType]::FindByThumbprint,
                $cert.Thumbprint,
                $false
            )
            if ($match.Count -gt 0) {
                return @{ Trusted = $true; Location = $location }
            }
        } finally {
            $store.Close()
        }
    }
    return @{ Trusted = $false; Location = $null }
}

function Get-RemoteTlsCertificate {
    param(
        [Parameter(Mandatory = $true)][string] $HostName,
        [int] $Port = 443
    )

    $tcp = New-Object System.Net.Sockets.TcpClient
    $tcp.Connect($HostName, $Port)
    $ssl = $null
    try {
        $ssl = New-Object System.Net.Security.SslStream(
            $tcp.GetStream(),
            $false,
            ({ param($s, $c, $ch, $e) $true })
        )
        $ssl.AuthenticateAsClient($HostName)
        return New-Object System.Security.Cryptography.X509Certificates.X509Certificate2($ssl.RemoteCertificate)
    } finally {
        if ($ssl) { $ssl.Dispose() }
        $tcp.Close()
    }
}
