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

Response (scaffold mode for razorpay/jazzcash only):

```json
{
  "success": true,
  "data": {
    "gateway": "stripe",
    "intentId": "pi_xxx",
    "paymentUrl": null,
    "clientToken": "pi_xxx_secret_xxx",
    "status": "pending",
    "expiresAt": "2026-03-07T12:00:00.000Z",
    "gatewayPayload": {
      "publishableKey": "pk_test_xxx"
    }
  }
}
```

### `POST /payments/verify`

Verifies payment from gateway payload and returns normalized status.

Request:

```json
{
  "gateway": "paypal",
  "intentId": "ORDER_ID",
  "metadata": {
    "paymentTypeId": "payment_type:abc123",
    "orderId": "order-123"
  }
}
```

### `POST /payments/capture`

Captures an approved PayPal order (embedded PayPal buttons flow).

```json
{
  "gateway": "paypal",
  "intentId": "PAYPAL_ORDER_ID",
  "metadata": {
    "paymentTypeId": "payment_type:abc123"
  }
}
```

### `POST /webhooks/:gateway`

Webhook receiver for Stripe, PayPal, Razorpay, and JazzCash (fixed dashboard URL). Order-scoped webhooks use `POST /webhooks/:gateway/:orderKey` (M-Pesa, Telebirr).

## Supported Gateways

- `stripe`
- `paypal`
- `razorpay`
- `jazzcash`
- `mpesa` (Safaricom Daraja Lipa na M-Pesa STK Push)
- `telebirr` (Ethio Telecom Fabric C2B checkout with POS QR display)

Each gateway has its own driver under `src/gateways/drivers`.

## Stripe (Embedded Elements)

Stripe uses **real Stripe API** calls via PaymentIntents. Credentials are loaded from SurrealDB per payment type. The POS renders **Stripe Elements** in the pending payments panel using the publishable key and client secret returned from `create-intent`.

### Admin setup

1. Create a **Remote** payment type with gateway `stripe` and mode `sandbox` or `live`.
2. Fill gateway keys on the payment type:
   - **Publishable Key** → `pk_test_...` or `pk_live_...`
   - **Secret Key** → `sk_test_...` or `sk_live_...`
   - **Webhook Signing Secret** → `whsec_...` (from Stripe Dashboard → Webhooks)

### Create intent (Stripe)

- `gateway`: `stripe`
- `metadata.paymentTypeId`: Surreal `payment_type` record id

Response: `intentId` is the PaymentIntent id; `clientToken` is the client secret; `gatewayPayload.publishableKey` is safe for the browser.

### Verify

```json
{
  "gateway": "stripe",
  "intentId": "pi_xxx",
  "metadata": { "paymentTypeId": "payment_type:abc123" }
}
```

- `succeeded` → `paid`
- `requires_capture` → `authorized`
- `canceled` → `canceled`

### Webhook

Configure Stripe Dashboard webhook endpoint:

```
{PAYMENT_CALLBACK_BASE_URL}/webhooks/stripe
```

Listen for `payment_intent.succeeded` and `payment_intent.payment_failed`. Include `paymentTypeId` in PaymentIntent metadata (set automatically by the server).

### Sandbox test flow

1. Use [Stripe test keys](https://dashboard.stripe.com/test/apikeys).
2. In POS, select Stripe payment type and enter amount — card form appears in pending panel.
3. Pay with test card `4242424242424242`, any future expiry, any CVC.

## PayPal (Embedded Buttons)

PayPal uses **PayPal Orders v2 REST API**. The server creates the order; the POS renders **PayPal Buttons** with the returned order id. Capture runs server-side after buyer approval.

### Admin setup

1. Create a **Remote** payment type with gateway `paypal` and mode `sandbox` or `live`.
2. Fill gateway keys:
   - **Client ID** → REST app Client ID
   - **Client Secret** → REST app Secret
   - **Webhook ID** (optional) → from PayPal Developer Dashboard → Webhooks

### Create intent (PayPal)

- `gateway`: `paypal`
- `metadata.paymentTypeId`: Surreal `payment_type` record id

Response: `intentId` is the PayPal order id; `gatewayPayload.clientId` is safe for the browser.

### Capture + verify

After buyer approves in the embedded button, the frontend calls `POST /payments/capture`, then verify if needed.

### Webhook

Configure PayPal webhook endpoint:

```
{PAYMENT_CALLBACK_BASE_URL}/webhooks/paypal
```

Subscribe to `PAYMENT.CAPTURE.COMPLETED`, `CHECKOUT.ORDER.APPROVED`, `CHECKOUT.ORDER.COMPLETED`.

### Sandbox test flow

1. Create a sandbox app at [PayPal Developer](https://developer.paypal.com/).
2. Use sandbox buyer account to approve payment in the POS PayPal button panel.

## Razorpay (Embedded Checkout)

Razorpay uses **Orders API** + **Checkout.js**. The server creates the order; the POS opens the Razorpay modal and verifies the payment signature server-side.

### Admin setup

1. Create a **Remote** payment type with gateway `razorpay` and mode `sandbox` or `live`.
2. Fill gateway keys:
   - **Key ID** → `rzp_test_...` or `rzp_live_...`
   - **Key Secret** → Razorpay API secret
   - **Webhook Secret** → from Razorpay Dashboard → Webhooks

### Create intent (Razorpay)

- `gateway`: `razorpay`
- `currency`: `INR`
- `metadata.paymentTypeId`: Surreal `payment_type` record id

Response: `intentId` is the Razorpay order id; `gatewayPayload.keyId` is safe for the browser.

### Verify

```json
{
  "gateway": "razorpay",
  "intentId": "order_xxx",
  "paymentId": "pay_xxx",
  "metadata": { "paymentTypeId": "payment_type:abc123" },
  "payload": { "signature": "..." }
}
```

- `captured` → `paid`
- `authorized` → `authorized`

### Webhook

Configure Razorpay webhook endpoint:

```
{PAYMENT_CALLBACK_BASE_URL}/webhooks/razorpay
```

Subscribe to `payment.captured`, `payment.authorized`, `payment.failed`.

### Sandbox test flow

1. Use [Razorpay test keys](https://dashboard.razorpay.com/app/keys).
2. In POS, select Razorpay payment type — tap **Pay with Razorpay** in the pending panel.
3. Complete payment with test card/UPI in the Razorpay modal.

## JazzCash (Hosted Page Redirect)

JazzCash uses **Page Redirection v2.0** with HMAC-signed form posts. The payment server builds the signed request and hosts an auto-submit checkout page; the POS polls until payment completes.

### Admin setup

1. Create a **Remote** payment type with gateway `jazzcash` and mode `sandbox` or `live`.
2. Fill gateway keys:
   - **Merchant ID** → JazzCash Merchant ID
   - **Password** → JazzCash system password
   - **Integrity Salt** → shared secret for `pp_SecureHash`
   - **Transaction Type** (optional) → `CARD` (default) or `MWALLET`

### Create intent (JazzCash)

- `gateway`: `jazzcash`
- `currency`: `PKR`
- `metadata.paymentTypeId`: Surreal `payment_type` record id

Response: `intentId` is `pp_TxnRefNo`; `paymentUrl` opens the server-hosted redirect page.

### Return URL

JazzCash redirects to:

```
{PAYMENT_BASE_URL}/payments/checkout/jazzcash/return
```

Successful returns are stored for POS polling and manual verify.

### Webhook / IPN

Configure JazzCash IPN/callback URL:

```
{PAYMENT_CALLBACK_BASE_URL}/webhooks/jazzcash
```

### Sandbox test flow

1. Register at [JazzCash Sandbox](https://sandbox.jazzcash.com.pk/) and obtain merchant credentials.
2. In POS, select JazzCash — hosted page opens in a new tab.
3. Complete sandbox payment; POS polls automatically (or tap **Verify**).

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
