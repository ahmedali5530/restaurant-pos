# POS Print Server

Node.js print server using **escpos** and adapter drivers. Accepts JSON over HTTP and prints to USB, Serial, Network, or Bluetooth printers.

## Run

```bash
npm install
npm start
# or from project root: npm run print-server
```

Server listens on `http://localhost:3132` (or `PRINT_PORT`).

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
# Linux / macOS
./scripts/setup-local-certs.sh
```

```powershell
# Windows (PowerShell)
.\scripts\setup-local-certs.ps1
```

If execution is blocked, run once in an elevated PowerShell:

```powershell
Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
```

This runs `mkcert -install` (may prompt for admin) and writes:

- `certs/localhost.pem`
- `certs/localhost-key.pem`

Certs cover `localhost`, `127.0.0.1`, and `::1`. PEM files are gitignored — each developer generates them locally.

If the container fails to start with a missing-cert error, re-run the script above.

### 3. Start the HTTPS container

```bash
docker compose -f docker-compose.standalone.yml up -d --build
```

```powershell
# Windows (PowerShell) — same command
docker compose -f docker-compose.standalone.yml up -d --build
```

- **URL:** `https://localhost:3132` (host port `3132` → HTTPS `443` in the container)
- **Health:** `curl https://localhost:3132/health`
- **Preview:** `https://localhost:3132/print/preview`

**Windows:** Do not add `/dev/bus/usb` device mapping — that path is Linux-only and will fail on Docker Desktop for Windows. Use **network** or **serial** printers from the container, or run the print server on the host with `npm start` for direct USB access.

**Linux USB printers** (optional): use the USB override compose file:

```bash
docker compose -f docker-compose.standalone.yml -f docker-compose.standalone.usb.yml up -d --build
```

Point the React app at this server when using standalone HTTPS (root `.env`):

```
VITE_PRINT_SERVER_URL=https://localhost:3132
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
  "data": { "printType": "temp|summary|kitchen|delivery|final|refund|deletion|table", ... },
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
| `final`   | Customer receipt from `order` |
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
