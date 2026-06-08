# POS Payment Server

Standalone Node.js service for payment gateway orchestration.

This service keeps third-party secrets on the server and exposes a small API for the browser app:
- create payment intent/link/token
- verify payment
- receive gateway webhooks

## Run

```bash
cd payments
npm install
npm start
```

Server listens on `http://localhost:3133` by default.

From project root:

```bash
npm run payment-server
```

## Environment

Copy `.env.example` to `.env` inside `payments`.

All gateway keys remain server-side. Do not add these secrets to frontend env files.

| Variable | Purpose |
|----------|---------|
| `PAYMENT_HOST` / `PAYMENT_PORT` | Bind address |
| `PAYMENT_BASE_URL` | Base URL for checkout links and default API URL |
| `PAYMENT_CALLBACK_BASE_URL` | Public base URL for gateway webhooks (M-Pesa STK `CallBackURL`). Optional; defaults to `PAYMENT_BASE_URL` |
| `PAYMENT_LOG_LEVEL` | `debug`, `info`, `warn`, `error` |
| `SURREAL_*` | SurrealDB connection for per–payment-type gateway config |

## API

### `GET /health`

Health endpoint.

### `POST /payments/create-intent`

Creates a normalized payment intent response for any supported gateway.

Request:

```json
{
  "gateway": "stripe",
  "amount": 1200,
  "currency": "USD",
  "orderId": "order-123",
  "customer": {
    "name": "Ahmed",
    "email": "ahmed@example.com"
  },
  "returnUrl": "https://example.com/payment/success",
  "cancelUrl": "https://example.com/payment/cancel",
  "metadata": {
    "source": "posr-react"
  }
}
```

Response (scaffold mode):

```json
{
  "success": true,
  "data": {
    "gateway": "stripe",
    "intentId": "stripe_intent_xxx",
    "paymentUrl": "https://mock-payments.local/stripe/pay/xxx",
    "clientToken": null,
    "status": "pending",
    "expiresAt": "2026-03-07T12:00:00.000Z",
    "gatewayPayload": {}
  }
}
```

### `POST /payments/verify`

Verifies payment from gateway payload and returns normalized status.

Request:

```json
{
  "gateway": "paypal",
  "paymentId": "PAY-123",
  "metadata": {
    "orderId": "order-123"
  }
}
```

### `POST /webhooks/:gateway`

Webhook receiver endpoint. Signature verification is scaffolded and should be implemented per gateway in production mode.

## Supported Gateways

- `stripe`
- `paypal`
- `razorpay`
- `jazzcash`
- `mpesa` (Safaricom Daraja Lipa na M-Pesa STK Push)
- `telebirr` (Ethio Telecom Fabric C2B checkout with POS QR display)

Each gateway has its own driver under `src/gateways/drivers`.

## M-Pesa (Daraja STK Push)

M-Pesa uses **real Safaricom Daraja API** calls. Credentials are loaded from SurrealDB per payment type (not from frontend env).

### Admin setup

1. Create a **Remote** payment type with gateway `mpesa` and mode `sandbox` or `live`.
2. Fill gateway keys on the payment type:
   - **Client ID** → Consumer Key
   - **Client Secret** → Consumer Secret
   - **Integrity Salt** → Lipa na M-Pesa Passkey
   - **Merchant ID** → Business ShortCode (Paybill/Till)
   - **Public Key** (optional) → STK `TransactionType` (`CustomerPayBillOnline` default, or `CustomerBuyGoodsOnline`)

### SurrealDB env (`payments/.env`)

```
SURREAL_URL=ws://localhost:8001/rpc
SURREAL_NS=posr
SURREAL_DB=posr
SURREAL_USER=root
SURREAL_PASS=root
```

### Create intent (M-Pesa)

- `gateway`: `mpesa`
- `currency`: `KES` (whole shillings only)
- `customer.phone`: required (`2547XXXXXXXX` or `07XXXXXXXX`)
- `metadata.paymentTypeId`: Surreal `payment_type` record id

```json
{
  "gateway": "mpesa",
  "amount": 100,
  "currency": "KES",
  "orderId": "order-123",
  "customer": { "phone": "254708374149" },
  "metadata": {
    "paymentTypeId": "payment_type:abc123",
    "orderId": "order-123"
  }
}
```

Response: `intentId` is Daraja `CheckoutRequestID`; `paymentUrl` is null; STK prompt is sent to the phone.

### Verify

Poll with `intentId` (CheckoutRequestID) and the same `metadata.paymentTypeId`:

```json
{
  "gateway": "mpesa",
  "intentId": "ws_CO_...",
  "metadata": { "paymentTypeId": "payment_type:abc123" }
}
```

- `ResultCode` `0` → `paid`
- `1032` → `canceled`
- `1037` → `pending` (timeout; keep polling)

### STK callback

Daraja posts async results to `POST /webhooks/mpesa` (URL set as `CallBackURL` on STK push). The POS app uses poll verify; webhooks are logged/acknowledged.

**Callback URL vs API URL:** `PAYMENT_BASE_URL` is used for checkout links and local API access. When the payment server runs on `localhost` but Safaricom must reach your webhooks, set a separate public base URL:

```env
PAYMENT_BASE_URL=http://localhost:3134
PAYMENT_CALLBACK_BASE_URL=https://payments.example.com
```

STK `CallBackURL` becomes `{PAYMENT_CALLBACK_BASE_URL}/webhooks/mpesa`. If `PAYMENT_CALLBACK_BASE_URL` is empty, `PAYMENT_BASE_URL` is used.

### Sandbox

Register at [Safaricom Daraja](https://developer.safaricom.co.ke/) and use sandbox credentials. Test MSISDN: `254708374149`.

## Telebirr (Fabric C2B + QR)

Telebirr uses the **Ethio Telecom Fabric Payment Gateway**. Credentials are loaded from SurrealDB per payment type. The POS displays a **QR code** encoding the signed H5 checkout URL returned from `create-intent`.

### Admin setup

1. Create a **Remote** payment type with gateway `telebirr` and mode `sandbox` or `live`.
2. Fill gateway keys on the payment type:
   - **Client ID** → Fabric App ID
   - **Client Secret** → App Secret
   - **Public Key** → Merchant App ID
   - **Merchant ID** → Merchant Code (6-digit short code)
   - **Secret Key** → RSA Private Key (PEM)
   - **Integrity Salt** (optional) → Web checkout base URL override
   - **Webhook Secret** (optional) → Telebirr public key for notify signature verification

### Environment (optional live URL overrides)

```env
TELEBIRR_LIVE_BASE_URL=https://telebirrapp.ethiotelecom.et:38443/apiaccess/payment/gateway
TELEBIRR_LIVE_WEB_BASE_URL=https://telebirrapp.ethiotelecom.et:38443/payment/web/paygate?
PAYMENT_CALLBACK_BASE_URL=https://payments.example.com
```

Sandbox defaults to `developerportal.ethiotelebirr.et:38443`. Live defaults to `telebirrapp.ethiotelecom.et:38443` unless overridden.

### Create intent (Telebirr)

- `gateway`: `telebirr`
- `currency`: `ETB`
- `metadata.paymentTypeId`: Surreal `payment_type` record id

```json
{
  "gateway": "telebirr",
  "amount": 150.5,
  "currency": "ETB",
  "orderId": "order-123",
  "metadata": {
    "paymentTypeId": "payment_type:abc123",
    "orderId": "order-123"
  }
}
```

Response: `intentId` is the merchant order id; `paymentUrl` is the signed checkout URL to encode as QR; `clientToken` is the `prepay_id`.

### Verify

Poll with `intentId` (merchant order id) and the same `metadata.paymentTypeId`:

```json
{
  "gateway": "telebirr",
  "intentId": "17714632549580",
  "metadata": { "paymentTypeId": "payment_type:abc123" }
}
```

- `PAY_SUCCESS` / `COMPLETED` → `paid`
- `WAIT_PAY` / `PAYING` → `pending`
- `PAY_FAILED` → `failed`
- `ORDER_CLOSED` → `canceled`

### Notify webhook

Telebirr posts async results to `POST /webhooks/telebirr`. Set `PAYMENT_CALLBACK_BASE_URL` to a publicly reachable host when running locally.

### Sandbox test flow

1. Register at the [Ethio Telecom developer portal](https://developer.ethiotelecom.et/) and obtain Fabric credentials + RSA key pair.
2. Configure a Remote payment type with gateway `telebirr`, mode `sandbox`, and all required keys.
3. Start the payment server: `npm run payment-server`.
4. In POS, select the Telebirr payment type and enter an amount — a QR code appears in the pending payments panel.
5. Scan the QR with the Telebirr app (sandbox) and complete payment.
6. The POS polls automatically; tap **Verify** if polling times out.
