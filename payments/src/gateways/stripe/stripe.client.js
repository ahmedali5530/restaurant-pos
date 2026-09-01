'use strict';

const Stripe = require('stripe');
const { PaymentStatus } = require('../gateway.types');

const ZERO_DECIMAL_CURRENCIES = new Set([
  'bif',
  'clp',
  'djf',
  'gnf',
  'jpy',
  'kmf',
  'krw',
  'mga',
  'pyg',
  'rwf',
  'ugx',
  'vnd',
  'vuv',
  'xaf',
  'xof',
  'xpf',
]);

function mapStripeCredentials(config, mode) {
  const secretKey = config?.secret_key;
  const publicKey = config?.public_key;
  const webhookSecret = config?.webhook_secret;

  if (!secretKey) {
    throw new Error(
      'Stripe gateway config is incomplete. Set Publishable Key and Secret Key on the payment type.'
    );
  }

  return {
    secretKey: String(secretKey).trim(),
    publicKey: publicKey ? String(publicKey).trim() : null,
    webhookSecret: webhookSecret ? String(webhookSecret).trim() : null,
    mode: mode === 'live' ? 'live' : 'sandbox',
  };
}

function getStripeClient(credentials) {
  return new Stripe(credentials.secretKey);
}

function toStripeAmount(amount, currency) {
  const value = Number(amount);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error('amount must be a positive number');
  }
  const cur = String(currency || 'USD').toLowerCase();
  if (ZERO_DECIMAL_CURRENCIES.has(cur)) {
    return Math.round(value);
  }
  return Math.round(value * 100);
}

function mapStripeIntentStatus(status) {
  switch (status) {
    case 'succeeded':
      return PaymentStatus.PAID;
    case 'requires_capture':
      return PaymentStatus.AUTHORIZED;
    case 'canceled':
      return PaymentStatus.CANCELED;
    case 'requires_payment_method':
    case 'requires_confirmation':
    case 'requires_action':
    case 'processing':
      return PaymentStatus.PENDING;
    default:
      return PaymentStatus.PENDING;
  }
}

async function createPaymentIntent({ credentials, amount, currency, metadata, idempotencyKey }) {
  const stripe = getStripeClient(credentials);
  const intent = await stripe.paymentIntents.create(
    {
      amount: toStripeAmount(amount, currency),
      currency: String(currency || 'USD').toLowerCase(),
      automatic_payment_methods: { enabled: true },
      metadata: metadata || {},
    },
    idempotencyKey ? { idempotencyKey: String(idempotencyKey) } : undefined
  );

  return {
    id: intent.id,
    clientSecret: intent.client_secret,
    status: intent.status,
    amount: intent.amount,
    currency: intent.currency,
  };
}

async function retrievePaymentIntent(credentials, intentId) {
  const stripe = getStripeClient(credentials);
  const intent = await stripe.paymentIntents.retrieve(String(intentId));
  const chargeId =
    typeof intent.latest_charge === 'string'
      ? intent.latest_charge
      : intent.latest_charge?.id || null;

  return {
    id: intent.id,
    status: intent.status,
    paymentStatus: mapStripeIntentStatus(intent.status),
    reference: chargeId || intent.id,
    metadata: intent.metadata || {},
  };
}

function constructWebhookEvent(credentials, rawBody, signature) {
  if (!credentials.webhookSecret) {
    throw new Error('Stripe webhook secret is not configured on the payment type');
  }
  if (!signature) {
    throw new Error('Missing stripe-signature header');
  }

  const stripe = getStripeClient(credentials);
  const body = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(String(rawBody || ''), 'utf8');
  return stripe.webhooks.constructEvent(body, signature, credentials.webhookSecret);
}

function parseStripeWebhookEvent(event) {
  const object = event?.data?.object || {};
  const metadata = object.metadata || {};
  const orderId = metadata.orderId || metadata.order_id || null;
  const paymentStatus =
    event.type === 'payment_intent.succeeded'
      ? PaymentStatus.PAID
      : event.type === 'payment_intent.payment_failed'
        ? PaymentStatus.FAILED
        : mapStripeIntentStatus(object.status);

  return {
    eventType: event.type,
    eventId: event.id,
    orderId,
    intentId: object.id || null,
    paymentStatus,
    reference:
      typeof object.latest_charge === 'string'
        ? object.latest_charge
        : object.latest_charge?.id || object.id || null,
    metadata,
    raw: object,
  };
}

module.exports = {
  mapStripeCredentials,
  createPaymentIntent,
  retrievePaymentIntent,
  constructWebhookEvent,
  parseStripeWebhookEvent,
  mapStripeIntentStatus,
  toStripeAmount,
};
