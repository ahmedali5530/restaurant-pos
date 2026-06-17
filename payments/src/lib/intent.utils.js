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
  const callbackBase = String(process.env.PAYMENT_CALLBACK_BASE_URL || '').trim();
  if (callbackBase) {
    return normalizeBaseUrl(callbackBase);
  }
  return getPaymentBaseUrl();
}

function normalizeOrderKey(orderId) {
  const text = String(orderId || '').trim();
  if (!text) {
    throw new Error('orderId is required for webhook callback URL');
  }
  return text.includes(':') ? text : `order:${text}`;
}

function buildGatewayWebhookCallbackUrl(gateway, orderId) {
  const orderKey = encodeURIComponent(normalizeOrderKey(orderId));
  return `${getPaymentCallbackBaseUrl()}/webhooks/${gateway}/${orderKey}`;
}

function buildMpesaWebhookCallbackUrl(orderId) {
  return buildGatewayWebhookCallbackUrl('mpesa', orderId);
}

function buildTelebirrWebhookCallbackUrl(orderId) {
  return buildGatewayWebhookCallbackUrl('telebirr', orderId);
}

function buildCheckoutUrl(gateway, token) {
  return `${getPaymentBaseUrl()}/payments/checkout/${gateway}/${token}`;
}

function buildStripeWebhookCallbackUrl() {
  return `${getPaymentCallbackBaseUrl()}/webhooks/stripe`;
}

function buildPaypalWebhookCallbackUrl() {
  return `${getPaymentCallbackBaseUrl()}/webhooks/paypal`;
}

function buildRazorpayWebhookCallbackUrl() {
  return `${getPaymentCallbackBaseUrl()}/webhooks/razorpay`;
}

function buildJazzcashWebhookCallbackUrl() {
  return `${getPaymentCallbackBaseUrl()}/webhooks/jazzcash`;
}

function buildJazzcashReturnUrl() {
  return `${getPaymentBaseUrl()}/payments/checkout/jazzcash/return`;
}

module.exports = {
  generateStrongToken,
  getPaymentBaseUrl,
  getPaymentCallbackBaseUrl,
  normalizeOrderKey,
  buildGatewayWebhookCallbackUrl,
  buildMpesaWebhookCallbackUrl,
  buildTelebirrWebhookCallbackUrl,
  buildStripeWebhookCallbackUrl,
  buildPaypalWebhookCallbackUrl,
  buildRazorpayWebhookCallbackUrl,
  buildJazzcashWebhookCallbackUrl,
  buildJazzcashReturnUrl,
  buildCheckoutUrl,
};
