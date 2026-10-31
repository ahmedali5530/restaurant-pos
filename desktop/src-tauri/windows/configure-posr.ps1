# Configure POSR Desktop store / locale / AI / integration settings (Windows).
# Writes installer-settings.json into the Tauri app data directory.
param(
  [Parameter(Mandatory = $true)]
  [string]$AppDataDir
)

$ErrorActionPreference = "Stop"
New-Item -ItemType Directory -Force -Path $AppDataDir | Out-Null
$outPath = Join-Path $AppDataDir "installer-settings.json"
$roamingSettings = Join-Path $env:APPDATA "com.posr.desktop\installer-settings.json"
$localSettings = Join-Path $env:LOCALAPPDATA "com.posr.desktop\installer-settings.json"
$roamingDone = Join-Path $env:APPDATA "com.posr.desktop\.posr_setup_done"
if ((Test-Path $outPath) -or (Test-Path $roamingSettings) -or (Test-Path $localSettings) -or (Test-Path $roamingDone)) {
  Write-Host "POSR settings already exist, skipping setup."
  exit 0
}

function Write-InstallerSettings([string]$Json) {
  $utf8 = New-Object System.Text.UTF8Encoding $false
  foreach ($path in @($outPath, $roamingSettings, $localSettings)) {
    $dir = Split-Path -Parent $path
    if ($dir) {
      New-Item -ItemType Directory -Force -Path $dir | Out-Null
    }
    [System.IO.File]::WriteAllText($path, $Json, $utf8)
  }
}

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$form = New-Object System.Windows.Forms.Form
$form.Text = "POSR Desktop setup"
$form.StartPosition = "CenterScreen"
$form.FormBorderStyle = "FixedDialog"
$form.MaximizeBox = $false
$form.MinimizeBox = $false
$form.TopMost = $true
$form.AutoScroll = $true
$form.Add_Shown({
  param($sender)
  $sender.Activate() | Out-Null
})

function Add-Label($text, $y) {
  $l = New-Object System.Windows.Forms.Label
  $l.Text = $text
  $l.Location = New-Object System.Drawing.Point(20, $y)
  $l.Size = New-Object System.Drawing.Size(460, 20)
  $form.Controls.Add($l) | Out-Null
}

function Add-Text($y, $default = "") {
  $t = New-Object System.Windows.Forms.TextBox
  $t.Location = New-Object System.Drawing.Point(20, $y)
  $t.Size = New-Object System.Drawing.Size(460, 24)
  $t.Text = $default
  $form.Controls.Add($t) | Out-Null
  return $t
}

$y = 16
Add-Label "Central terminal address (blank = this PC)" $y; $y += 22; $centralHost = Add-Text $y; $y += 32
Add-Label "Store name" $y; $y += 22; $storeName = Add-Text $y "My Store"; $y += 32
Add-Label "Store address" $y; $y += 22; $storeAddr = Add-Text $y; $y += 32
Add-Label "Default language (en, es, ...)" $y; $y += 22; $lang = Add-Text $y "en"; $y += 32
Add-Label "Locale (e.g. en-US, en-PK)" $y; $y += 22; $locale = Add-Text $y "en-US"; $y += 32
Add-Label "Currency code (USD, PKR, ...)" $y; $y += 22; $currency = Add-Text $y "USD"; $y += 32
Add-Label "Decimal places" $y; $y += 22; $decimals = Add-Text $y "2"; $y += 32
Add-Label "Timezone (e.g. Asia/Karachi, UTC)" $y; $y += 22; $tz = Add-Text $y "UTC"; $y += 32
Add-Label "Date format" $y; $y += 22; $dateFmt = Add-Text $y "yyyy-MM-dd"; $y += 32
Add-Label "Time format" $y; $y += 22; $timeFmt = Add-Text $y "HH:mm"; $y += 36

Add-Label "AI (optional) - profile name" $y; $y += 22; $aiName = Add-Text $y; $y += 32
Add-Label "AI API URL" $y; $y += 22; $aiUrl = Add-Text $y; $y += 32
Add-Label "AI API key" $y; $y += 22; $aiKey = Add-Text $y; $y += 32
Add-Label "AI model" $y; $y += 22; $aiModel = Add-Text $y; $y += 36

Add-Label "Integration encryption key (blank = auto)" $y; $y += 22; $encKey = Add-Text $y; $y += 40

$ok = New-Object System.Windows.Forms.Button
$ok.Text = "Save"
$ok.Location = New-Object System.Drawing.Point(280, $y)
$ok.DialogResult = [System.Windows.Forms.DialogResult]::OK
$form.AcceptButton = $ok
$form.Controls.Add($ok)

$cancel = New-Object System.Windows.Forms.Button
$cancel.Text = "Skip"
$cancel.Location = New-Object System.Drawing.Point(380, $y)
$cancel.DialogResult = [System.Windows.Forms.DialogResult]::Cancel
$form.CancelButton = $cancel
$form.Controls.Add($cancel)

$clientHeight = [Math]::Min(680, $y + 48)
$form.ClientSize = New-Object System.Drawing.Size(500, $clientHeight)

$result = $form.ShowDialog()
if ($result -ne [System.Windows.Forms.DialogResult]::OK) {
  if (-not (Test-Path $outPath)) {
    $defaults = @{
      store = @{ store_name = "My Store"; store_address = "" }
      locale = @{
        default_language = "en"; locale = "en-US"; currency = "USD"
        currency_symbol = ""; decimal_places = 2; timezone = "UTC"
        date_format = "yyyy-MM-dd"; time_format = "HH:mm"
      }
      ai = @{ enabled = $false; default_profile = ""; profiles = @() }
      integrations = @{ token_encryption_key = ""; qbo_client_id = ""; qbo_client_secret = ""; qbo_redirect_uri = ""; qbo_env = "sandbox" }
      server = @{ host = "" }
      applied = $false
    }
    Write-InstallerSettings ($defaults | ConvertTo-Json -Depth 6)
  }
  exit 0
}

$dec = 2
[int]::TryParse($decimals.Text, [ref]$dec) | Out-Null
$profiles = @()
$aiEnabled = $false
if ($aiName.Text.Trim() -ne "" -and $aiKey.Text.Trim() -ne "") {
  $aiEnabled = $true
  $profiles += @{
    name = $aiName.Text.Trim()
    url = $aiUrl.Text.Trim()
    key = $aiKey.Text.Trim()
    model = $aiModel.Text.Trim()
    auth = "bearer"
  }
}

$payload = @{
  store = @{
    store_name = $storeName.Text.Trim()
    store_address = $storeAddr.Text.Trim()
  }
  locale = @{
    default_language = $lang.Text.Trim()
    locale = $locale.Text.Trim()
    currency = $currency.Text.Trim()
    currency_symbol = ""
    decimal_places = $dec
    timezone = $tz.Text.Trim()
    date_format = $dateFmt.Text.Trim()
    time_format = $timeFmt.Text.Trim()
  }
  ai = @{
    enabled = $aiEnabled
    default_profile = $(if ($profiles.Count -gt 0) { $profiles[0].name } else { "" })
    profiles = $profiles
  }
  integrations = @{
    token_encryption_key = $encKey.Text.Trim()
    qbo_client_id = ""
    qbo_client_secret = ""
    qbo_redirect_uri = ""
    qbo_env = "sandbox"
  }
  server = @{ host = $centralHost.Text.Trim() }
  applied = $false
}

Write-InstallerSettings ($payload | ConvertTo-Json -Depth 6)
Write-Host "Wrote $outPath"
