'use strict';

const crypto = require('crypto');

function generateStrongToken(size = 32) {
  return crypto.randomBytes(size).toString('hex');
}

function normalizeBaseUrl(value) {
  return String(value || '').replace(/\/$/, '');
}

function getPaymentBaseUrl() {
  const base =
    process.env.PAYMENT_BASE_URL ||
    process.env.VITE_PAYMENT_SERVER_URL ||
    `http://localhost:${process.env.PAYMENT_PORT || 3133}`;

  return normalizeBaseUrl(base);
}

/**
 * Public URL gateways use for webhooks/callbacks (e.g. M-Pesa STK CallBackURL).
 * Set PAYMENT_CALLBACK_BASE_URL when the API runs on localhost but callbacks must
 * hit a reachable domain or IP (ngrok, LAN IP, production host).
 */
function getPaymentCallbackBaseUrl() {
  if (process.env.PAYMENT_CALLBACK_BASE_URL) {
    return normalizeBaseUrl(process.env.PAYMENT_CALLBACK_BASE_URL);
  }
  return getPaymentBaseUrl();
}

function buildMpesaWebhookCallbackUrl() {
  return `${getPaymentCallbackBaseUrl()}/webhooks/mpesa`;
}

function buildCheckoutUrl(gateway, token) {
  return `${getPaymentBaseUrl()}/payments/checkout/${gateway}/${token}`;
}

module.exports = {
  generateStrongToken,
  getPaymentBaseUrl,
  getPaymentCallbackBaseUrl,
  buildMpesaWebhookCallbackUrl,
  buildCheckoutUrl,
};
