'use strict';

const Razorpay = require('razorpay');
const {
  validatePaymentVerification,
  validateWebhookSignature,
} = require('razorpay/dist/utils/razorpay-utils');
const { PaymentStatus } = require('../gateway.types');

function mapRazorpayCredentials(config, mode) {
  const keyId = config?.public_key;
  const keySecret = config?.secret_key;
  const webhookSecret = config?.webhook_secret;

  if (!keyId || !keySecret) {
    throw new Error(
      'Razorpay gateway config is incomplete. Set Key ID and Key Secret on the payment type.'
    );
  }

  return {
    keyId: String(keyId).trim(),
    keySecret: String(keySecret).trim(),
    webhookSecret: webhookSecret ? String(webhookSecret).trim() : null,
    mode: mode === 'live' ? 'live' : 'sandbox',
  };
}

function getRazorpayClient(credentials) {
  return new Razorpay({
    key_id: credentials.keyId,
    key_secret: credentials.keySecret,
  });
}

function toPaise(amount, currency) {
  const value = Number(amount);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error('amount must be a positive number');
  }
  const cur = String(currency || 'INR').toUpperCase();
  if (cur !== 'INR') {
    throw new Error(`Razorpay requires INR currency (received ${cur})`);
  }
  return Math.round(value * 100);
}

function mapPaymentStatus(status) {
  switch (String(status || '').toLowerCase()) {
    case 'captured':
      return PaymentStatus.PAID;
    case 'authorized':
      return PaymentStatus.AUTHORIZED;
    case 'failed':
      return PaymentStatus.FAILED;
    case 'refunded':
      return PaymentStatus.CANCELED;
    default:
      return PaymentStatus.PENDING;
  }
}

async function createOrder({ credentials, amount, currency, receipt, notes }) {
  const client = getRazorpayClient(credentials);
  const order = await client.orders.create({
    amount: toPaise(amount, currency),
    currency: String(currency || 'INR').toUpperCase(),
    receipt: String(receipt || `rcpt_${Date.now()}`),
    notes: notes || {},
  });

  return {
    id: order.id,
    amount: order.amount,
    currency: order.currency,
    status: order.status,
    receipt: order.receipt,
  };
}

async function fetchPayment(credentials, paymentId) {
  const client = getRazorpayClient(credentials);
  const payment = await client.payments.fetch(String(paymentId));
  return {
    id: payment.id,
    status: payment.status,
    paymentStatus: mapPaymentStatus(payment.status),
    orderId: payment.order_id || null,
    amount: payment.amount,
    currency: payment.currency,
    notes: payment.notes || {},
  };
}

function verifyPaymentSignature(credentials, { orderId, paymentId, signature }) {
  if (!orderId || !paymentId || !signature) {
    throw new Error('orderId, paymentId, and signature are required for Razorpay verification');
  }

  const valid = validatePaymentVerification(
    { order_id: String(orderId), payment_id: String(paymentId) },
    String(signature),
    credentials.keySecret
  );

  if (!valid) {
    throw new Error('Razorpay payment signature verification failed');
  }

  return true;
}

function verifyWebhookSignature(credentials, rawBody, signature) {
  if (!credentials.webhookSecret) {
    throw new Error('Razorpay webhook secret is not configured on the payment type');
  }
  if (!signature) {
    throw new Error('Missing X-Razorpay-Signature header');
  }

  const body = Buffer.isBuffer(rawBody) ? rawBody.toString('utf8') : String(rawBody || '');
  const valid = validateWebhookSignature(body, String(signature), credentials.webhookSecret);
  if (!valid) {
    throw new Error('Razorpay webhook signature verification failed');
  }

  return JSON.parse(body);
}

function parseRazorpayWebhookEvent(event) {
  const entity = event?.payload?.payment?.entity || event?.payload?.order?.entity || {};
  const notes = entity.notes || {};
  const orderId = notes.orderId || notes.order_id || entity.order_id || null;
  const eventType = event?.event || 'unknown';

  let paymentStatus = PaymentStatus.PENDING;
  if (eventType === 'payment.captured' || entity.status === 'captured') {
    paymentStatus = PaymentStatus.PAID;
  } else if (eventType === 'payment.authorized' || entity.status === 'authorized') {
    paymentStatus = PaymentStatus.AUTHORIZED;
  } else if (eventType === 'payment.failed' || entity.status === 'failed') {
    paymentStatus = PaymentStatus.FAILED;
  }

  return {
    eventType,
    eventId: event?.id || entity.id || null,
    orderId,
    intentId: entity.order_id || null,
    paymentId: entity.id || null,
    paymentStatus,
    reference: entity.id || null,
    notes,
    raw: entity,
  };
}

module.exports = {
  mapRazorpayCredentials,
  createOrder,
  fetchPayment,
  verifyPaymentSignature,
  verifyWebhookSignature,
  parseRazorpayWebhookEvent,
  mapPaymentStatus,
  toPaise,
};
