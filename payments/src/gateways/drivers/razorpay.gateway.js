'use strict';

const logger = require('../../lib/logger');
const { BaseGateway } = require('../base.gateway');
const { PaymentGateway, PaymentStatus, WebhookStatus } = require('../gateway.types');
const {
  mapRazorpayCredentials,
  createOrder,
  fetchPayment,
  verifyPaymentSignature,
  verifyWebhookSignature,
  parseRazorpayWebhookEvent,
  mapPaymentStatus,
} = require('../razorpay/razorpay.client');

function getPaymentTypeId(payload) {
  const id = payload?.metadata?.paymentTypeId;
  if (!id) {
    throw new Error('metadata.paymentTypeId is required for Razorpay');
  }
  return String(id);
}

class RazorpayGateway extends BaseGateway {
  constructor() {
    super(PaymentGateway.RAZORPAY);
    this.requiresPaymentTypeId = true;
    this.requiresIntentIdOnVerify = true;
    this.requiresServerConfig = true;
  }

  mapCredentials(config, mode) {
    return mapRazorpayCredentials(config, mode);
  }

  extractOrderKeyFromWebhook(normalized) {
    const orderId = normalized?.orderId || normalized?.notes?.orderId;
    if (!orderId) return null;
    const text = String(orderId).trim();
    return text.includes(':') ? text : `order:${text}`;
  }

  async createIntent(payload) {
    const paymentTypeId = getPaymentTypeId(payload);
    logger.info('razorpay', 'createIntent', {
      paymentTypeId,
      orderId: payload.orderId,
      amount: payload.amount,
      currency: payload.currency,
    });

    const { loadPaymentTypeGatewayConfig } = require('../../lib/gateway-config.store');
    const { credentials } = await loadPaymentTypeGatewayConfig(paymentTypeId, this.name);

    const notes = {
      orderId: String(payload.orderId),
      paymentTypeId,
      invoiceNumber: payload.metadata?.invoiceNumber
        ? String(payload.metadata.invoiceNumber)
        : undefined,
      source: payload.metadata?.source ? String(payload.metadata.source) : 'posr-react',
    };

    const order = await createOrder({
      credentials,
      amount: payload.amount,
      currency: payload.currency || 'INR',
      receipt: `order_${payload.orderId}_${Date.now()}`,
      notes,
    });

    const now = Date.now();
    return {
      gateway: this.name,
      intentId: order.id,
      paymentUrl: null,
      clientToken: null,
      status: PaymentStatus.PENDING,
      expiresAt: new Date(now + 20 * 60 * 1000).toISOString(),
      gatewayPayload: {
        keyId: credentials.keyId,
        amount: order.amount,
        currency: order.currency,
        paymentTypeId,
        mode: credentials.mode,
      },
    };
  }

  async verify(payload) {
    const paymentTypeId = getPaymentTypeId(payload);
    const orderId = payload.intentId;
    const paymentId = payload.paymentId;
    const signature = payload.payload?.signature;

    if (!orderId) {
      throw new Error('intentId (Razorpay order id) is required for verify');
    }
    if (!paymentId) {
      throw new Error('paymentId is required for Razorpay verify');
    }
    if (!signature) {
      throw new Error('payload.signature is required for Razorpay verify');
    }

    const { loadPaymentTypeGatewayConfig } = require('../../lib/gateway-config.store');
    const { credentials } = await loadPaymentTypeGatewayConfig(paymentTypeId, this.name);

    verifyPaymentSignature(credentials, {
      orderId,
      paymentId,
      signature,
    });

    const payment = await fetchPayment(credentials, paymentId);

    return {
      gateway: this.name,
      status: payment.paymentStatus,
      verifiedAt: new Date().toISOString(),
      reference: payment.id,
      gatewayPayload: {
        orderId: payment.orderId,
        paymentId: payment.id,
        razorpayStatus: payment.status,
        notes: payment.notes,
      },
    };
  }

  async handleWebhook(payload) {
    const paymentTypeId =
      payload.body?.payload?.payment?.entity?.notes?.paymentTypeId ||
      payload.body?.payload?.order?.entity?.notes?.paymentTypeId;

    let credentials = null;
    if (paymentTypeId) {
      try {
        const { loadPaymentTypeGatewayConfig } = require('../../lib/gateway-config.store');
        const loaded = await loadPaymentTypeGatewayConfig(String(paymentTypeId), this.name);
        credentials = loaded.credentials;
      } catch (err) {
        logger.warn('razorpay', 'webhook config lookup failed', { message: err.message });
      }
    }

    if (!credentials?.webhookSecret) {
      return {
        gateway: this.name,
        status: WebhookStatus.REJECTED,
        eventType: payload.eventType || 'unknown',
        eventId: payload.eventId || null,
        normalizedData: { error: 'Razorpay webhook secret not configured' },
        receivedAt: new Date().toISOString(),
      };
    }

    let event;
    try {
      const signature =
        payload.signature ||
        payload.headers?.['x-razorpay-signature'] ||
        payload.headers?.['X-Razorpay-Signature'];
      event = verifyWebhookSignature(credentials, payload.rawBody, signature);
    } catch (err) {
      logger.warn('razorpay', 'webhook signature verification failed', { message: err.message });
      return {
        gateway: this.name,
        status: WebhookStatus.REJECTED,
        eventType: payload.eventType || 'unknown',
        eventId: payload.eventId || null,
        normalizedData: { error: err.message },
        receivedAt: new Date().toISOString(),
      };
    }

    const parsed = parseRazorpayWebhookEvent(event);
    const handledEvents = new Set([
      'payment.captured',
      'payment.authorized',
      'payment.failed',
    ]);

    if (!handledEvents.has(parsed.eventType)) {
      return {
        gateway: this.name,
        status: WebhookStatus.IGNORED,
        eventType: parsed.eventType,
        eventId: parsed.eventId,
        normalizedData: parsed,
        receivedAt: new Date().toISOString(),
      };
    }

    return {
      gateway: this.name,
      status: WebhookStatus.RECEIVED,
      eventType: parsed.eventType,
      eventId: parsed.eventId,
      orderKey: this.extractOrderKeyFromWebhook(parsed),
      normalizedData: parsed,
      receivedAt: new Date().toISOString(),
    };
  }
}

module.exports = { RazorpayGateway, mapRazorpayCredentials, mapPaymentStatus };
