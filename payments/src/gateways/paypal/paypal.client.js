'use strict';

const { PaymentStatus } = require('../gateway.types');

const SANDBOX_BASE = 'https://api-m.sandbox.paypal.com';
const LIVE_BASE = 'https://api-m.paypal.com';

const tokenCache = new Map();

function mapPaypalCredentials(config, mode) {
  const clientId = config?.client_id;
  const clientSecret = config?.client_secret;
  const webhookId = config?.webhook_secret;

  if (!clientId || !clientSecret) {
    throw new Error(
      'PayPal gateway config is incomplete. Set Client ID and Client Secret on the payment type.'
    );
  }

  return {
    clientId: String(clientId).trim(),
    clientSecret: String(clientSecret).trim(),
    webhookId: webhookId ? String(webhookId).trim() : null,
    mode: mode === 'live' ? 'live' : 'sandbox',
  };
}

function getApiBase(credentials) {
  return credentials.mode === 'live' ? LIVE_BASE : SANDBOX_BASE;
}

async function getAccessToken(credentials) {
  const cacheKey = `${credentials.mode}:${credentials.clientId}`;
  const cached = tokenCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now() + 30_000) {
    return cached.token;
  }

  const auth = Buffer.from(`${credentials.clientId}:${credentials.clientSecret}`).toString('base64');
  const res = await fetch(`${getApiBase(credentials)}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error_description || data.message || 'PayPal OAuth failed');
  }

  tokenCache.set(cacheKey, {
    token: data.access_token,
    expiresAt: Date.now() + Number(data.expires_in || 3600) * 1000,
  });

  return data.access_token;
}

async function paypalRequest(credentials, path, options = {}) {
  const token = await getAccessToken(credentials);
  const res = await fetch(`${getApiBase(credentials)}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });

  const text = await res.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }

  if (!res.ok) {
    const message =
      data.message ||
      data.error_description ||
      (Array.isArray(data.details) ? data.details.map((d) => d.issue).join(', ') : null) ||
      `PayPal API error (${res.status})`;
    throw new Error(message);
  }

  return data;
}

function formatPaypalAmount(amount, currency) {
  const value = Number(amount);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error('amount must be a positive number');
  }
  return {
    currency_code: String(currency || 'USD').toUpperCase(),
    value: value.toFixed(2),
  };
}

function mapPaypalOrderStatus(status) {
  switch (String(status || '').toUpperCase()) {
    case 'COMPLETED':
      return PaymentStatus.PAID;
    case 'APPROVED':
      return PaymentStatus.AUTHORIZED;
    case 'VOIDED':
      return PaymentStatus.CANCELED;
    case 'CREATED':
    case 'SAVED':
    case 'PAYER_ACTION_REQUIRED':
      return PaymentStatus.PENDING;
    default:
      return PaymentStatus.PENDING;
  }
}

function extractCaptureReference(order) {
  const capture = order?.purchase_units?.[0]?.payments?.captures?.[0];
  return capture?.id || order?.id || null;
}

async function createOrder({ credentials, amount, currency, orderId, metadata, idempotencyKey }) {
  const order = await paypalRequest(credentials, '/v2/checkout/orders', {
    method: 'POST',
    headers: idempotencyKey ? { 'PayPal-Request-Id': String(idempotencyKey) } : {},
    body: JSON.stringify({
      intent: 'CAPTURE',
      purchase_units: [
        {
          reference_id: String(orderId),
          custom_id: String(orderId),
          description: metadata?.invoiceNumber
            ? `Order ${metadata.invoiceNumber}`
            : `Order ${orderId}`,
          amount: formatPaypalAmount(amount, currency),
        },
      ],
      application_context: {
        brand_name: 'POS',
        user_action: 'PAY_NOW',
      },
    }),
  });

  return {
    id: order.id,
    status: order.status,
  };
}

async function getOrder(credentials, orderId) {
  const order = await paypalRequest(credentials, `/v2/checkout/orders/${encodeURIComponent(orderId)}`, {
    method: 'GET',
  });

  return {
    id: order.id,
    status: order.status,
    paymentStatus: mapPaypalOrderStatus(order.status),
    reference: extractCaptureReference(order),
    purchaseUnits: order.purchase_units || [],
    raw: order,
  };
}

async function captureOrder(credentials, orderId) {
  const result = await paypalRequest(
    credentials,
    `/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`,
    { method: 'POST', body: '{}' }
  );

  return {
    id: result.id,
    status: result.status,
    paymentStatus: mapPaypalOrderStatus(result.status),
    reference: extractCaptureReference(result),
    raw: result,
  };
}

function parsePaypalWebhookEvent(body) {
  const eventType = body?.event_type || 'unknown';
  const resource = body?.resource || {};
  const purchaseUnit = resource?.purchase_units?.[0] || resource;
  const orderId =
    purchaseUnit?.custom_id ||
    purchaseUnit?.reference_id ||
    resource?.custom_id ||
    resource?.supplementary_data?.related_ids?.order_id ||
    null;

  let paymentStatus = PaymentStatus.PENDING;
  if (eventType === 'PAYMENT.CAPTURE.COMPLETED' || eventType === 'CHECKOUT.ORDER.COMPLETED') {
    paymentStatus = PaymentStatus.PAID;
  } else if (eventType === 'CHECKOUT.ORDER.APPROVED') {
    paymentStatus = PaymentStatus.AUTHORIZED;
  } else if (eventType === 'PAYMENT.CAPTURE.DENIED') {
    paymentStatus = PaymentStatus.FAILED;
  }

  return {
    eventType,
    eventId: body?.id || null,
    orderId,
    intentId: resource?.id || body?.resource?.id || null,
    paymentStatus,
    reference: resource?.id || null,
    raw: body,
  };
}

async function verifyWebhook(credentials, headers, body) {
  if (!credentials.webhookId) {
    return false;
  }

  const transmissionId = headers['paypal-transmission-id'];
  const transmissionTime = headers['paypal-transmission-time'];
  const certUrl = headers['paypal-cert-url'];
  const authAlgo = headers['paypal-auth-algo'];
  const transmissionSig = headers['paypal-transmission-sig'];

  if (!transmissionId || !transmissionTime || !certUrl || !authAlgo || !transmissionSig) {
    return false;
  }

  try {
    const result = await paypalRequest(credentials, '/v1/notifications/verify-webhook-signature', {
      method: 'POST',
      body: JSON.stringify({
        auth_algo: authAlgo,
        cert_url: certUrl,
        transmission_id: transmissionId,
        transmission_sig: transmissionSig,
        transmission_time: transmissionTime,
        webhook_id: credentials.webhookId,
        webhook_event: body,
      }),
    });
    return result.verification_status === 'SUCCESS';
  } catch {
    return false;
  }
}

module.exports = {
  mapPaypalCredentials,
  createOrder,
  getOrder,
  captureOrder,
  mapPaypalOrderStatus,
  parsePaypalWebhookEvent,
  verifyWebhook,
};
