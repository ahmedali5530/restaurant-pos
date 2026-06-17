'use strict';

const logger = require('../../lib/logger');
const { BaseGateway } = require('../base.gateway');
const { PaymentGateway, PaymentStatus, WebhookStatus } = require('../gateway.types');
const {
  mapStripeCredentials,
  createPaymentIntent,
  retrievePaymentIntent,
  constructWebhookEvent,
  parseStripeWebhookEvent,
} = require('../stripe/stripe.client');

function getPaymentTypeId(payload) {
  const id = payload?.metadata?.paymentTypeId;
  if (!id) {
    throw new Error('metadata.paymentTypeId is required for Stripe');
  }
  return String(id);
}

class StripeGateway extends BaseGateway {
  constructor() {
    super(PaymentGateway.STRIPE);
    this.requiresPaymentTypeId = true;
    this.requiresIntentIdOnVerify = true;
    this.requiresServerConfig = true;
  }

  mapCredentials(config, mode) {
    return mapStripeCredentials(config, mode);
  }

  extractOrderKeyFromWebhook(normalized) {
    const orderId = normalized?.orderId || normalized?.metadata?.orderId;
    if (!orderId) return null;
    const text = String(orderId).trim();
    return text.includes(':') ? text : `order:${text}`;
  }

  async createIntent(payload) {
    const paymentTypeId = getPaymentTypeId(payload);
    logger.info('stripe', 'createIntent', {
      paymentTypeId,
      orderId: payload.orderId,
      amount: payload.amount,
      currency: payload.currency,
    });

    const { loadPaymentTypeGatewayConfig } = require('../../lib/gateway-config.store');
    const { credentials } = await loadPaymentTypeGatewayConfig(paymentTypeId, this.name);

    const metadata = {
      orderId: String(payload.orderId),
      paymentTypeId,
      invoiceNumber: payload.metadata?.invoiceNumber
        ? String(payload.metadata.invoiceNumber)
        : undefined,
      source: payload.metadata?.source ? String(payload.metadata.source) : 'posr-react',
    };

    const intent = await createPaymentIntent({
      credentials,
      amount: payload.amount,
      currency: payload.currency,
      metadata,
      idempotencyKey: payload.idempotencyKey,
    });

    const now = Date.now();
    return {
      gateway: this.name,
      intentId: intent.id,
      paymentUrl: null,
      clientToken: intent.clientSecret,
      status: PaymentStatus.PENDING,
      expiresAt: new Date(now + 24 * 60 * 60 * 1000).toISOString(),
      gatewayPayload: {
        publishableKey: credentials.publicKey,
        mode: credentials.mode,
        paymentTypeId,
      },
    };
  }

  async verify(payload) {
    const paymentTypeId = getPaymentTypeId(payload);
    const intentId = payload.intentId;
    if (!intentId) {
      throw new Error('intentId is required for Stripe verify');
    }

    const { loadPaymentTypeGatewayConfig } = require('../../lib/gateway-config.store');
    const { credentials } = await loadPaymentTypeGatewayConfig(paymentTypeId, this.name);

    const intent = await retrievePaymentIntent(credentials, intentId);

    return {
      gateway: this.name,
      status: intent.paymentStatus,
      verifiedAt: new Date().toISOString(),
      reference: intent.reference,
      gatewayPayload: {
        intentId: intent.id,
        stripeStatus: intent.status,
        metadata: intent.metadata,
      },
    };
  }

  async handleWebhook(payload) {
    const paymentTypeId =
      payload.body?.data?.object?.metadata?.paymentTypeId ||
      payload.body?.metadata?.paymentTypeId;

    let credentials = null;
    if (paymentTypeId) {
      try {
        const { loadPaymentTypeGatewayConfig } = require('../../lib/gateway-config.store');
        const loaded = await loadPaymentTypeGatewayConfig(String(paymentTypeId), this.name);
        credentials = loaded.credentials;
      } catch (err) {
        logger.warn('stripe', 'webhook config lookup failed', { message: err.message });
      }
    }

    if (!credentials?.webhookSecret) {
      return {
        gateway: this.name,
        status: WebhookStatus.REJECTED,
        eventType: payload.eventType || 'unknown',
        eventId: payload.eventId || null,
        normalizedData: { error: 'Stripe webhook secret not configured' },
        receivedAt: new Date().toISOString(),
      };
    }

    let event;
    try {
      event = constructWebhookEvent(credentials, payload.rawBody, payload.signature);
    } catch (err) {
      logger.warn('stripe', 'webhook signature verification failed', { message: err.message });
      return {
        gateway: this.name,
        status: WebhookStatus.REJECTED,
        eventType: payload.eventType || 'unknown',
        eventId: payload.eventId || null,
        normalizedData: { error: err.message },
        receivedAt: new Date().toISOString(),
      };
    }

    const parsed = parseStripeWebhookEvent(event);

    if (
      event.type !== 'payment_intent.succeeded' &&
      event.type !== 'payment_intent.payment_failed'
    ) {
      return {
        gateway: this.name,
        status: WebhookStatus.IGNORED,
        eventType: event.type,
        eventId: event.id,
        normalizedData: parsed,
        receivedAt: new Date().toISOString(),
      };
    }

    return {
      gateway: this.name,
      status: WebhookStatus.RECEIVED,
      eventType: event.type,
      eventId: event.id,
      orderKey: this.extractOrderKeyFromWebhook(parsed),
      normalizedData: parsed,
      receivedAt: new Date().toISOString(),
    };
  }
}

module.exports = { StripeGateway, mapStripeCredentials };
