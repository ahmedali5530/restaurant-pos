'use strict';

const logger = require('../../lib/logger');
const { BaseGateway } = require('../base.gateway');
const { PaymentGateway, PaymentStatus, WebhookStatus } = require('../gateway.types');
const {
  mapPaypalCredentials,
  createOrder,
  getOrder,
  captureOrder,
  parsePaypalWebhookEvent,
  verifyWebhook,
} = require('../paypal/paypal.client');

function getPaymentTypeId(payload) {
  const id = payload?.metadata?.paymentTypeId;
  if (!id) {
    throw new Error('metadata.paymentTypeId is required for PayPal');
  }
  return String(id);
}

class PaypalGateway extends BaseGateway {
  constructor() {
    super(PaymentGateway.PAYPAL);
    this.requiresPaymentTypeId = true;
    this.requiresIntentIdOnVerify = true;
    this.requiresServerConfig = true;
  }

  mapCredentials(config, mode) {
    return mapPaypalCredentials(config, mode);
  }

  extractOrderKeyFromWebhook(normalized) {
    const orderId = normalized?.orderId;
    if (!orderId) return null;
    const text = String(orderId).trim();
    return text.includes(':') ? text : `order:${text}`;
  }

  async createIntent(payload) {
    const paymentTypeId = getPaymentTypeId(payload);
    logger.info('paypal', 'createIntent', {
      paymentTypeId,
      orderId: payload.orderId,
      amount: payload.amount,
      currency: payload.currency,
    });

    const { loadPaymentTypeGatewayConfig } = require('../../lib/gateway-config.store');
    const { credentials } = await loadPaymentTypeGatewayConfig(paymentTypeId, this.name);

    const order = await createOrder({
      credentials,
      amount: payload.amount,
      currency: payload.currency,
      orderId: payload.orderId,
      metadata: payload.metadata || {},
      idempotencyKey: payload.idempotencyKey,
    });

    const now = Date.now();
    return {
      gateway: this.name,
      intentId: order.id,
      paymentUrl: null,
      clientToken: null,
      status: PaymentStatus.PENDING,
      expiresAt: new Date(now + 3 * 60 * 60 * 1000).toISOString(),
      gatewayPayload: {
        clientId: credentials.clientId,
        mode: credentials.mode,
        paymentTypeId,
      },
    };
  }

  async verify(payload) {
    const paymentTypeId = getPaymentTypeId(payload);
    const intentId = payload.intentId;
    if (!intentId) {
      throw new Error('intentId is required for PayPal verify');
    }

    const { loadPaymentTypeGatewayConfig } = require('../../lib/gateway-config.store');
    const { credentials } = await loadPaymentTypeGatewayConfig(paymentTypeId, this.name);

    const order = await getOrder(credentials, intentId);

    return {
      gateway: this.name,
      status: order.paymentStatus,
      verifiedAt: new Date().toISOString(),
      reference: order.reference,
      gatewayPayload: {
        orderId: order.id,
        paypalStatus: order.status,
      },
    };
  }

  async capture(payload) {
    const paymentTypeId = getPaymentTypeId(payload);
    const intentId = payload.intentId;
    if (!intentId) {
      throw new Error('intentId is required for PayPal capture');
    }

    const { loadPaymentTypeGatewayConfig } = require('../../lib/gateway-config.store');
    const { credentials } = await loadPaymentTypeGatewayConfig(paymentTypeId, this.name);

    const captured = await captureOrder(credentials, intentId);

    return {
      gateway: this.name,
      status: captured.paymentStatus,
      verifiedAt: new Date().toISOString(),
      reference: captured.reference,
      gatewayPayload: {
        orderId: captured.id,
        paypalStatus: captured.status,
      },
    };
  }

  async handleWebhook(payload) {
    const body = payload.body || {};
    const parsed = parsePaypalWebhookEvent(body);

    const paymentTypeId = body?.metadata?.paymentTypeId;
    // SECURITY: fail-closed. The previous default of `true` meant that any
    // webhook POST without a `metadata.paymentTypeId` (or with a mis-configured
    // payment_type) would sail through as RECEIVED and be persisted to the
    // `payment_webhook` table — which the POS then polls and trusts as "paid".
    // An attacker who only knew an orderKey (predictable: `order:<invoice>`)
    // could forge a webhook. We now require explicit verification.
    let signatureValid = false;
    let verificationSkipped = false;

    if (paymentTypeId) {
      try {
        const { loadPaymentTypeGatewayConfig } = require('../../lib/gateway-config.store');
        const { credentials } = await loadPaymentTypeGatewayConfig(
          String(paymentTypeId),
          this.name
        );
        if (credentials.webhookId) {
          const headers = Object.fromEntries(
            Object.entries(payload.headers || {}).map(([k, v]) => [k.toLowerCase(), v])
          );
          signatureValid = await verifyWebhook(credentials, headers, body);
        } else {
          // payment_type exists but has no webhookId configured — cannot verify.
          verificationSkipped = true;
          logger.warn(
            'paypal',
            'webhook signature NOT verified — payment_type has no webhookId configured',
            { paymentTypeId }
          );
        }
      } catch (err) {
        verificationSkipped = true;
        logger.warn('paypal', 'webhook config lookup failed — signature NOT verified', {
          message: err.message,
        });
      }
    } else {
      // No paymentTypeId in metadata at all — cannot look up credentials.
      verificationSkipped = true;
      logger.warn('paypal', 'webhook received without metadata.paymentTypeId — signature NOT verified');
    }

    // Allow local development / sandbox testing without signature verification
    // ONLY when explicitly opted in. This mirrors the JazzCash pattern.
    if (!signatureValid && process.env.PAYPAL_ALLOW_UNSIGNED_WEBHOOKS === 'true') {
      signatureValid = true;
      logger.warn(
        'paypal',
        'PAYPAL_ALLOW_UNSIGNED_WEBHOOKS=true — accepting unverified webhook (dev/test only)'
      );
    }

    if (!signatureValid) {
      return {
        gateway: this.name,
        status: WebhookStatus.REJECTED,
        eventType: parsed.eventType,
        eventId: parsed.eventId,
        normalizedData: {
          ...parsed,
          signatureValid: false,
          signatureVerificationSkipped: verificationSkipped,
        },
        receivedAt: new Date().toISOString(),
      };
    }

    const handledEvents = new Set([
      'CHECKOUT.ORDER.APPROVED',
      'CHECKOUT.ORDER.COMPLETED',
      'PAYMENT.CAPTURE.COMPLETED',
      'PAYMENT.CAPTURE.DENIED',
    ]);

    if (!handledEvents.has(parsed.eventType)) {
      return {
        gateway: this.name,
        status: WebhookStatus.IGNORED,
        eventType: parsed.eventType,
        eventId: parsed.eventId,
        normalizedData: { ...parsed, signatureValid: true },
        receivedAt: new Date().toISOString(),
      };
    }

    return {
      gateway: this.name,
      status: WebhookStatus.RECEIVED,
      eventType: parsed.eventType,
      eventId: parsed.eventId,
      orderKey: this.extractOrderKeyFromWebhook(parsed),
      normalizedData: { ...parsed, signatureValid: true },
      receivedAt: new Date().toISOString(),
    };
  }
}

module.exports = { PaypalGateway, mapPaypalCredentials };
