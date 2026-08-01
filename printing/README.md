# POS Print Server

Node.js print server using **escpos** and adapter drivers. Accepts JSON over HTTP and prints to USB, Serial, Network, or Bluetooth printers.

## Run

```bash
npm install
npm start
# or from project root: npm run print-server
```

Server listens on `http://localhost:3132` (or `PRINT_PORT`).

## Timezone

Receipt times (KOT, bills, refunds, summary) use:

1. `config.timezone` from the print request (POS app sends `VITE_APP_TIMEZONE` when present)
2. else `PRINT_TIMEZONE`
3. else `TZ`
4. else the container/host local timezone

For standalone deploys, set an IANA zone, e.g. `PRINT_TIMEZONE=Asia/Karachi`.

## Standalone HTTP (Docker)

Minimal HTTP print server (no TLS):

```bash
cd printing
# optional: export PRINT_TIMEZONE=Asia/Karachi
docker compose up -d --build
```

- **URL:** `http://localhost:3132`
- **Health:** `curl http://localhost:3132/health`
- Compose file: [`docker-compose.yml`](docker-compose.yml)

## Standalone HTTPS (Docker)

Run the print server alone over **trusted HTTPS** on localhost (no browser certificate warnings). TLS is handled by Caddy in front of the same Express app — `server.js` stays HTTP-only inside the container.

### 1. Install mkcert (one-time per machine)

[mkcert](https://github.com/FiloSottile/mkcert) creates certificates trusted by your OS and browser after you install its local CA.

```bash
# Debian/Ubuntu
sudo apt install libnss3-tools
curl -JLO "https://dl.filippo.io/mkcert/latest?for=linux/amd64"
chmod +x mkcert-v*-linux-amd64
sudo mv mkcert-v*-linux-amd64 /usr/local/bin/mkcert

# macOS (Homebrew)
brew install mkcert
```

```powershell
# Windows (PowerShell)
winget install FiloSottile.mkcert
# or: choco install mkcert
```

### 2. Generate local certificates

From the `printing` directory:

```bash
# Linux / macOS — localhost only
./scripts/setup-local-certs.sh

# Include LAN IP (e.g. POS on another device on the same network)
./scripts/setup-local-certs.sh 192.168.1.50
```

```powershell
# Windows (PowerShell) — localhost only
.\scripts\setup-local-certs.ps1

# Include LAN IP
.\scripts\setup-local-certs.ps1 -LocalIp 192.168.1.50
# or
.\scripts\setup-local-certs.ps1 192.168.1.50
```

**mkcert syntax:** `-cert-file` and `-key-file` are **output filenames**, not IP addresses. Put IPs at the end:

```powershell
# Correct
mkcert -cert-file localhost.pem -key-file localhost-key.pem localhost 127.0.0.1 192.168.1.50

# Wrong — 192.168.1.50 is not a valid cert filename here
mkcert -cert-file 192.168.1.50 -key-file localhost-key.pem localhost
```

Find your Windows LAN IP:

```powershell
Get-NetIPAddress -AddressFamily IPv4 |
  Where-Object { $_.InterfaceAlias -notmatch 'Loopback' -and $_.IPAddress -notlike '169.254*' } |
  Select-Object IPAddress, InterfaceAlias
```

If execution is blocked, run once in an elevated PowerShell:

```powershell
Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
```

This runs `mkcert -install` (may prompt for admin) and writes:

- `certs/localhost.pem`
- `certs/localhost-key.pem`
- `certs/tls-hosts.txt` — hosts Caddy serves (used by the container entrypoint)

Default certs cover `localhost`, `127.0.0.1`, and `::1`. Add your LAN IP when other machines on the network need HTTPS. PEM files are gitignored — each developer generates them locally.

**LAN access:** `localhost` is trusted on the machine where you ran `mkcert -install`. A **LAN IP will still show "Not secure"** on any other device (tablet, phone, another PC) until that device trusts the mkcert root CA too.

```powershell
# On the print-server PC — copy CA for other devices
.\scripts\export-mkcert-ca.ps1

# Check cert includes your IP
.\scripts\verify-local-certs.ps1
```

Install the mkcert **root CA** on each client (not `localhost.pem`).

```powershell
# Print-server PC — export CA
.\scripts\export-mkcert-ca.ps1

# Copy printing\certs\rootCA.pem to the client Windows machine, then (Admin PowerShell):
cd printing
.\scripts\install-mkcert-ca.ps1
```

Use **`rootCA.pem`** with `install-mkcert-ca.ps1` (do not use `certutil -encode` on PEM files — that corrupts them and Windows reports "invalid certificate"). `rootCA.cer` is optional DER format for GUI import only.

| Device | Install root CA |
|--------|-----------------|
| Windows | **Admin PowerShell:** `.\scripts\install-mkcert-ca.ps1` using **`rootCA.pem`** |
| Android | Settings → Security → Encryption & credentials → Install a certificate → **CA certificate** |
| macOS / iOS | macOS: Keychain Access → import → Always Trust. iOS: AirDrop/email + install profile |

After installing the root CA, **fully quit and reopen Chrome**, then open `https://192.168.x.x:3132/health`.

**Same PC only?** If the POS browser and Docker print server run on the **same Windows PC**, skip LAN IP entirely:

```
VITE_PRINT_SERVER_URL=https://localhost:3132
```

Use the LAN IP only when the browser runs on a **different** machine than the print server.

### Troubleshooting: Chrome / Edge still show invalid certificate

Run the diagnostic on the **PC where the browser runs**:

```powershell
.\scripts\diagnose-https.ps1 -Url https://192.168.68.115:3132/health
```

It checks: cert files, name/IP in certificate, root CA trust, live TLS from Docker, and HTTPS request.

**Correct order (two machines):**

| Step | Where | Command |
|------|--------|---------|
| 1 | Print-server PC | `.\scripts\setup-local-certs.ps1 <lan-ip>` |
| 2 | Print-server PC | `.\scripts\export-mkcert-ca.ps1` |
| 3 | Print-server PC | `docker compose -f docker-compose.standalone.yml up -d --build` |
| 4 | Client PC (browser) | Copy `certs\rootCA.pem` only |
| 5 | Client PC | Admin: `.\scripts\install-mkcert-ca.ps1` |
| 6 | Client PC | `.\scripts\diagnose-https.ps1 -Url https://<lan-ip>:3132/health` |

**Common mistakes:**
- Running `install-mkcert-ca.ps1` on the server but browsing on a **different** PC without copying `rootCA.pem` there
- Using LAN IP in browser but forgetting to include that IP in `setup-local-certs.ps1`
- Not restarting Docker after regenerating certs
- Installing `localhost.pem` instead of `rootCA.pem`
- `rootCA.pem` and `localhost.pem` from different mkcert installs (diagnose reports "not signed by rootCA.pem")

**Same PC for browser and Docker?** Use `https://localhost:3132` - no LAN IP or client CA install needed.

If the container fails to start with a missing-cert error, re-run the setup script above.

### 3. Start the HTTPS container

```bash
docker compose -f docker-compose.standalone.yml up -d --build
```

```powershell
# Windows (PowerShell) — same command
docker compose -f docker-compose.standalone.yml up -d --build
```

Set `PRINT_TIMEZONE` (or `TZ`) the same way as the HTTP compose so KOT/bill times match the venue when the client omits `config.timezone`.

- **URL (same machine):** `https://localhost:3132`
- **URL (LAN IP):** `https://192.168.1.50:3132` (after including that IP when generating certs)
- **Health:** `curl https://localhost:3132/health`
- **Preview:** `https://localhost:3132/print/preview`

**Windows:** Do not add `/dev/bus/usb` device mapping — that path is Linux-only and will fail on Docker Desktop for Windows. Use **network** or **serial** printers from the container, or run the print server on the host with `npm start` for direct USB access.

### Windows USB printers (`Can not find printer`)

USB via `escpos-usb` / `node-usb` works differently on Windows than on Linux:

1. **Run the print server on the host** (`cd printing && npm start`), not in Docker. Docker Desktop on Windows cannot pass through USB the same way Linux does.
2. **Set VID and PID** on the printer in POS settings (Device Manager → printer → Details → Hardware Ids, e.g. `USB\VID_04B8&PID_0E15` → VID `04b8`, PID `0e15`). Hex values like `04b8` / `0e15` are accepted.
3. **Install WinUSB with [Zadig](https://zadig.akeo.ie/)** for that USB device (Options → List All Devices → select the printer → WinUSB → Replace Driver). Without this, libusb cannot open the device (`LIBUSB_ERROR_NOT_SUPPORTED` / not found). Note: WinUSB replaces the Windows printer driver for that device — use this PC for the POS print server, not for normal Windows “Devices and Printers” printing to the same USB printer.
4. Alternative: install [UsbDK](https://github.com/daynix/UsbDk) and enable the UsbDK backend in your host Node process if you prefer that over WinUSB.

**Linux USB printers** (optional): use the USB override compose file:

```bash
docker compose -f docker-compose.standalone.yml -f docker-compose.standalone.usb.yml up -d --build
```

Point the React app at this server when using standalone HTTPS (root `.env`):

```
# same machine
VITE_PRINT_SERVER_URL=https://localhost:3132

# LAN IP (after cert includes that IP)
VITE_PRINT_SERVER_URL=https://192.168.1.50:3132
```

The root [`docker-compose.yml`](../docker-compose.yml) and [`Dockerfile`](Dockerfile) (HTTP dev service) are unchanged.

## Preview (no printer needed)

- **GET http://localhost:3132/print/preview** — Tool page: choose print type, paste JSON (same shape as `/print`), click Preview. Opens the receipt layout in a new tab.
- **POST http://localhost:3132/print/preview** — Same request body as `POST /print` (printers are ignored). Returns HTML that mimics the thermal receipt (temp, final, delivery, kitchen, summary).

Use this to check layout and content before printing.

## POST /print

**Body:**
```json
{
  "printers": [ ... ],
  "data": { "printType": "temp|summary|kitchen|delivery|final|refund|deletion|table|pulse", ... },
  "config": {
    "bottomMargin": "1",
    "companyName": "Your Co",
    "leftMargin": "1",
    "logo": "",
    "rightMargin": "1",
    "showCompanyName": false,
    "showItemName": true,
    "showItemPrice": true,
    "showItemQuantity": true,
    "showItemTotal": false,
    "showVatNumber": true,
    "topMargin": "1",
    "vatName": "NTN",
    "vatNumber": "12356789"
  }
}
```

**Printers** (one or more):
```json
[
  { "type": "usb" },
  { "type": "usb", "vid": 0x04b8, "pid": 0x0e28 },
  { "type": "serial", "path": "/dev/ttyUSB0", "baudRate": 9600 },
  { "type": "network", "ip": "192.168.1.100", "port": 9100 },
  { "type": "bluetooth", "address": "01:23:45:67:89:AB", "channel": 1 }
]
```

**config** (optional) — applies to temp, final, delivery, kitchen, summary:
- **Margins:** `topMargin`, `bottomMargin`, `leftMargin`, `rightMargin` (string or number, lines/units)
- **Branding:** `companyName`, `logo` (base64 or `data:image/png;base64,...`), `showCompanyName`
- **Currency:** `currencySymbol` (default `$`) for amounts on temp, final, delivery
- **Item columns:** `showItemName`, `showItemPrice`, `showItemQuantity`, `showItemTotal` — for summary / custom use
- **VAT:** `showVatNumber`, `vatName`, `vatNumber`

**temp** (Pre-Sale Bill, matches `presale.bill.tsx`): **CommonBillParts** only — Invoice#, date, table, user; items `Name xQty` / `$lineTotal`; **Items (n)**, **Tax (name rate%)**, **Discount**, **Service charges (X or X%)**, **extras**, **Tip** / **Tip %**; **Total**. No payments or Change.

**final** (matches `final.bill.tsx` + `_common.bill.tsx`): CommonBillParts + **payments** (each `payment_type.name` / amount) + **Change** (`sum(payments) - total`). `data.duplicate: true` → title "Duplicate Final Bill".

**delivery**: CommonBillParts + **Delivery Charges** (when `order.delivery.delivery_charges` or `order.delivery_charges`) + address/phone/notes + payments + Change.

## Drivers (escpos adapters)

| type       | config |
|-----------|--------|
| `usb`     | `vid?`, `pid?` |
| `serial`  | `path?` (default `/dev/ttyUSB0`), `baudRate?`, `dataBits?`, `stopBits?`, `parity?` |
| `network` | `ip`, `port?` (default 9100) |
| `bluetooth` | `address` (MAC), `channel?` (default 1). Requires `npm install escpos-bluetooth` and `libbluetooth-dev` (Linux). |

## Print builders

**temp, final, delivery, kitchen** — expect `data: { printType, order }` where `order` is an `Order` from `src/api/model/order.ts` (invoice_number, split, created_at, table, items, tax_amount, discount_amount, service_charge_amount, tip_amount, payments, customer, delivery, order_type, tags, …). Items are mapped from `order.items` (Dish name, quantity, price, comments); deleted/refunded/suspended items are omitted.

| printType | purpose |
|-----------|---------|
| `temp`    | Quick slip from `order` (items, totals) |
| `final`   | Customer receipt from `order` (also sends cash drawer pulse) |
| `pulse`   | Cash drawer pulse only (no receipt); uses same printers as `final` |
| `delivery`| Delivery slip from `order` (delivery/customer address, phone, items, totals) |
| `kitchen` | Kitchen ticket from `order` (table, items with comments, time, priority) |
| `table`   | Generic table-only print; pass prebuilt `rows` with escpos `tableCustom` cells |

**summary** — same props as `Summary` (summary.tsx): `{ orders: { data: Order[] }, date: string }`. All totals (exclusive, gross, refunds, service charges, discounts, taxes, net, amount due, amount collected, extras, rounding, voids, tips, covers, categories, dishes, payment types, taxes list, discounts list, extras) are computed from `orders.data` in the print server to match the Summary logic.

**table** — generic table-only builder for reusable structured slips:

```json
{
  "data": {
    "printType": "table",
    "rows": [
      [
        { "text": "Item", "align": "LEFT", "width": 0.6, "style": "B" },
        { "text": "Total", "align": "RIGHT", "width": 0.4, "style": "B" }
      ],
      [
        { "text": "Burger x2", "align": "LEFT", "width": 0.6 },
        { "text": "$20", "align": "RIGHT", "width": 0.4 }
      ]
    ],
    "size": [1, 1],
    "feed": 1,
    "cut": true
  }
}
```

Shorthand for a single row is also supported:

```json
{
  "data": {
    "printType": "table",
    "rows": [
      { "text": "Name", "align": "LEFT", "width": 0.5, "style": "B" },
      { "text": "Value", "align": "RIGHT", "width": 0.5, "style": "B" }
    ]
  }
}
```

## Bluetooth

To enable Bluetooth: install `escpos-bluetooth` in this folder and the system libs (e.g. `libbluetooth-dev` on Debian/Ubuntu). If the adapter is not available, the bluetooth driver throws a clear error.

```bash
# Debian/Ubuntu
sudo apt-get install libbluetooth-dev
cd printing && npm install escpos-bluetooth
```
