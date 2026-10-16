'use strict';

/**
 * Thin client for the payment sidecar (`payments/`). The sidecar requires a
 * POS session token, so the gateway signs a short-lived service session for
 * itself — card secrets never leave the payment service.
 */

const { signSession } = require('../jwt');

const PAYMENT_URL = (process.env.PAYMENT_INTERNAL_URL || 'http://payment:3134').replace(/\/+$/, '');

let serviceToken = null;

async function getServiceToken() {
  const now = Date.now();
  if (serviceToken && serviceToken.expiresAt - now > 5 * 60 * 1000) return serviceToken.token;
  const signed = await signSession({ userId: 'system:self-order', login: 'self-order' });
  serviceToken = { token: signed.token, expiresAt: now + signed.expiresIn * 1000 };
  return serviceToken.token;
}

async function call(path, body, idempotencyKey) {
  const token = await getServiceToken();
  const response = await fetch(`${PAYMENT_URL}${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${token}`,
      ...(idempotencyKey ? { 'x-idempotency-key': idempotencyKey } : {}),
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20_000),
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok || json?.success === false || json?.ok === false) {
    const err = new Error(json?.error?.message || json?.error || json?.message || `Payment service error (${response.status})`);
    err.status = 502;
    throw err;
  }
  return json.data ?? json;
}

function createIntent({ gateway, amount, currency, orderId, paymentTypeId, checkoutId }) {
  return call(
    '/payments/create-intent',
    {
      gateway,
      amount,
      currency,
      orderId,
      metadata: { paymentTypeId, orderId, source: 'posr-self-order', checkoutId },
    },
    `self-order-${checkoutId}`,
  );
}

function verify({ gateway, intentId, orderId, paymentTypeId }) {
  return call('/payments/verify', {
    gateway,
    intentId,
    orderId,
    metadata: { paymentTypeId, orderId },
  });
}

function capture({ gateway, intentId, orderId, paymentTypeId }) {
  return call('/payments/capture', {
    gateway,
    intentId,
    orderId,
    metadata: { paymentTypeId, orderId },
  });
}

module.exports = { createIntent, verify, capture };
