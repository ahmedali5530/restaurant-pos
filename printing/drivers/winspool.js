'use strict';

const { execFile } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

/**
 * Windows owns USB printers with usbprint.sys. libusb then fails with
 * LIBUSB_ERROR_NOT_SUPPORTED. The receipt bytes still print if we hand them
 * to the existing printer queue as a RAW document.
 */

const FIND_PRINTER_SCRIPT = `
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$vid = [string]$env:POSR_USB_VID
$product = [string]$env:POSR_USB_PID
if ($vid -notmatch '^[0-9A-F]{4}$' -or $product -notmatch '^[0-9A-F]{4}$') {
  throw "Invalid USB id VID=$vid PID=$product"
}
$needle = "VID_$vid&PID_$product"
$ports = New-Object System.Collections.Generic.List[string]
$containerIds = New-Object System.Collections.Generic.List[string]
$usbRoot = "HKLM:\\SYSTEM\\CurrentControlSet\\Enum\\USB\\VID_$vid&PID_$product"
if (Test-Path $usbRoot) {
  Get-ChildItem $usbRoot | ForEach-Object {
    $cid = (Get-ItemProperty $_.PSPath -Name ContainerID -ErrorAction SilentlyContinue).ContainerID
    if ($cid) { [void]$containerIds.Add([string]$cid) }
    $params = Join-Path $_.PSPath 'Device Parameters'
    if (Test-Path $params) {
      $port = (Get-ItemProperty -Path $params -Name PortName -ErrorAction SilentlyContinue).PortName
      if ($port) { [void]$ports.Add([string]$port) }
    }
  }
}
$printRoot = 'HKLM:\\SYSTEM\\CurrentControlSet\\Enum\\USBPRINT'
if ((Test-Path $printRoot) -and $containerIds.Count -gt 0) {
  Get-ChildItem $printRoot -ErrorAction SilentlyContinue | ForEach-Object {
    Get-ChildItem $_.PSPath -ErrorAction SilentlyContinue | ForEach-Object {
      $cid = (Get-ItemProperty $_.PSPath -Name ContainerID -ErrorAction SilentlyContinue).ContainerID
      if (-not $cid -or -not $containerIds.Contains([string]$cid)) { return }
      $params = Join-Path $_.PSPath 'Device Parameters'
      if (Test-Path $params) {
        $port = (Get-ItemProperty -Path $params -Name PortName -ErrorAction SilentlyContinue).PortName
        if ($port) { [void]$ports.Add([string]$port) }
      }
    }
  }
}
$wanted = @($ports | Select-Object -Unique)
$printers = @(Get-CimInstance -ClassName Win32_Printer -ErrorAction SilentlyContinue)
$match = $null
foreach ($printer in $printers) {
  foreach ($port in $wanted) {
    if ([string]$printer.PortName -eq [string]$port) {
      $match = [string]$printer.Name
      break
    }
  }
  if ($match) { break }
}
if (-not $match) {
  $listed = @($printers | ForEach-Object { "$($_.Name) [$($_.PortName)]" }) -join '; '
  if (-not $listed) { $listed = '(none)' }
  throw "No Windows printer queue for $needle. Install it in Windows Settings, then match its USB port. Queues: $listed"
}
Write-Output $match
`;

const SEND_RAW_SCRIPT = `
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
Add-Type -TypeDefinition @"
using System;
using System.IO;
using System.Runtime.InteropServices;
public class PosrRawPrinter {
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Ansi)]
  public class DOCINFOA {
    [MarshalAs(UnmanagedType.LPStr)] public string pDocName;
    [MarshalAs(UnmanagedType.LPStr)] public string pOutputFile;
    [MarshalAs(UnmanagedType.LPStr)] public string pDataType;
  }
  [DllImport("winspool.drv", SetLastError = true, CharSet = CharSet.Auto)]
  public static extern bool OpenPrinter(string szPrinter, out IntPtr hPrinter, IntPtr pd);
  [DllImport("winspool.drv", SetLastError = true)]
  public static extern bool ClosePrinter(IntPtr hPrinter);
  [DllImport("winspool.drv", SetLastError = true, CharSet = CharSet.Ansi)]
  public static extern bool StartDocPrinter(IntPtr hPrinter, int level, DOCINFOA di);
  [DllImport("winspool.drv", SetLastError = true)]
  public static extern bool EndDocPrinter(IntPtr hPrinter);
  [DllImport("winspool.drv", SetLastError = true)]
  public static extern bool StartPagePrinter(IntPtr hPrinter);
  [DllImport("winspool.drv", SetLastError = true)]
  public static extern bool EndPagePrinter(IntPtr hPrinter);
  [DllImport("winspool.drv", SetLastError = true)]
  public static extern bool WritePrinter(IntPtr hPrinter, byte[] pBytes, int dwCount, out int dwWritten);
  public static void Send(string printerName, string filePath) {
    byte[] bytes = File.ReadAllBytes(filePath);
    IntPtr handle;
    if (!OpenPrinter(printerName, out handle, IntPtr.Zero))
      throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error(), "OpenPrinter failed for " + printerName);
    try {
      DOCINFOA info = new DOCINFOA();
      info.pDocName = "POSR";
      info.pDataType = "RAW";
      if (!StartDocPrinter(handle, 1, info))
        throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error(), "StartDocPrinter failed");
      try {
        if (!StartPagePrinter(handle))
          throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error(), "StartPagePrinter failed");
        try {
          int written;
          if (!WritePrinter(handle, bytes, bytes.Length, out written))
            throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error(), "WritePrinter failed");
          if (written != bytes.Length)
            throw new IOException("Printer accepted " + written + " of " + bytes.Length + " bytes");
        } finally { EndPagePrinter(handle); }
      } finally { EndDocPrinter(handle); }
    } finally { ClosePrinter(handle); }
  }
}
"@
if (-not (Test-Path -LiteralPath $env:POSR_PRINT_FILE)) { throw "Print file missing" }
[PosrRawPrinter]::Send($env:POSR_PRINTER_NAME, $env:POSR_PRINT_FILE)
`;

function usbIdHex(value) {
  return (Number(value) & 0xffff).toString(16).toUpperCase().padStart(4, '0');
}

function isLibusbUnsupported(err) {
  const msg = err && err.message ? err.message : String(err || '');
  return /LIBUSB_ERROR_NOT_SUPPORTED|NOT_SUPPORTED/i.test(msg);
}

function runPowershell(script, env, timeout) {
  return new Promise((resolve, reject) => {
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script],
      {
        windowsHide: true,
        timeout: timeout || 20000,
        env: { ...process.env, ...env },
        maxBuffer: 8 * 1024 * 1024,
      },
      (err, stdout, stderr) => {
        if (err) {
          const detail = String(stderr || stdout || err.message || '').trim();
          reject(new Error(detail || err.message));
          return;
        }
        resolve(String(stdout || '').trim());
      }
    );
  });
}

function printerNameFromOutput(stdout) {
  const name = String(stdout || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)[0];
  return name || '';
}

function resolvePrinterName(vid, pid, run) {
  const vendor = usbIdHex(vid);
  const product = usbIdHex(pid);
  return run(FIND_PRINTER_SCRIPT, { POSR_USB_VID: vendor, POSR_USB_PID: product }, 20000).then(
    (stdout) => {
      const name = printerNameFromOutput(stdout);
      if (!name) {
        throw new Error(`Windows did not return a printer queue for VID ${vendor} PID ${product}`);
      }
      return name;
    }
  );
}

function sendRaw(printerName, buffer, run) {
  const file = path.join(
    os.tmpdir(),
    `posr-print-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}.bin`
  );
  fs.writeFileSync(file, buffer);
  return run(
    SEND_RAW_SCRIPT,
    { POSR_PRINTER_NAME: printerName, POSR_PRINT_FILE: file },
    60000
  ).finally(() => {
    try {
      fs.unlinkSync(file);
    } catch (_) {
      // temp file is only the receipt bytes
    }
  });
}

/**
 * escpos-compatible device that buffers writes and submits one RAW job on close.
 * @param {{ vid: number, pid: number }} config
 * @param {{ run?: Function }} [io]
 */
function createWinSpoolDevice(config, io) {
  const run = (io && io.run) || runPowershell;
  const chunks = [];
  let printerName = '';
  let opened = false;

  return {
    open(callback) {
      resolvePrinterName(config.vid, config.pid, run)
        .then((name) => {
          printerName = name;
          opened = true;
          console.log(`[print] Windows printer queue "${name}" for VID ${usbIdHex(config.vid)} PID ${usbIdHex(config.pid)}`);
          callback && callback(null);
        })
        .catch((err) => {
          const vendor = usbIdHex(config.vid);
          const product = usbIdHex(config.pid);
          const detail = err && err.message ? err.message : String(err);
          callback &&
            callback(
              new Error(
                `USB printer VID ${vendor} PID ${product} is using the Windows printer driver. ${detail}`
              )
            );
        });
      return this;
    },
    write(data, callback) {
      if (!opened) {
        callback && callback(new Error('Windows printer is not open'));
        return this;
      }
      chunks.push(Buffer.from(data));
      callback && callback(null);
      return this;
    },
    close(callback) {
      const payload = Buffer.concat(chunks);
      chunks.length = 0;
      if (!printerName || payload.length === 0) {
        callback && callback(null);
        return this;
      }
      sendRaw(printerName, payload, run)
        .then(() => callback && callback(null))
        .catch((err) => callback && callback(err));
      return this;
    },
  };
}

module.exports = {
  createWinSpoolDevice,
  isLibusbUnsupported,
  usbIdHex,
  printerNameFromOutput,
  resolvePrinterName,
  sendRaw,
};
