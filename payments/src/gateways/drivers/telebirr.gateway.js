'use strict';

const logger = require('../../lib/logger');
const { BaseGateway } = require('../base.gateway');
const { PaymentGateway, PaymentStatus, WebhookStatus } = require('../gateway.types');
const {
  buildTelebirrWebhookCallbackUrl,
  getPaymentBaseUrl,
} = require('../../lib/intent.utils');
const {
  createPreOrder,
  queryOrder,
  buildSignedCheckoutUrl,
  mapOrderStatus,
  parseNotification,
  verifyNotificationSignature,
} = require('../telebirr/fabric.client');

function getPaymentTypeId(payload) {
  const id = payload?.metadata?.paymentTypeId;
  if (!id) {
    throw new Error('metadata.paymentTypeId is required for Telebirr');
  }
  return String(id);
}

function mapTelebirrCredentials(config, mode) {
  const fabricAppId = config?.client_id;
  const appSecret = config?.client_secret;
  const merchantAppId = config?.public_key;
  const merchantCode = config?.merchant_id;
  const privateKey = config?.secret_key;

  if (!fabricAppId || !appSecret || !merchantAppId || !merchantCode || !privateKey) {
    throw new Error(
      'Telebirr gateway config is incomplete. Set Fabric App ID, App Secret, Merchant App ID, Merchant Code, and RSA Private Key on the payment type.'
    );
  }

  return {
    fabricAppId: String(fabricAppId).trim(),
    appSecret: String(appSecret).trim(),
    merchantAppId: String(merchantAppId).trim(),
    merchantCode: String(merchantCode).trim(),
    privateKey: String(privateKey).trim(),
    webBaseUrlOverride: (config?.integrity_salt || '').trim() || null,
    notifyPublicKey: (config?.webhook_secret || '').trim() || null,
    mode: mode === 'live' ? 'live' : 'sandbox',
  };
}

function resolveEtbAmount(amount, currency) {
  const cur = String(currency || '').toUpperCase();
  if (cur && cur !== 'ETB') {
    throw new Error(`Telebirr requires ETB currency (received ${cur})`);
  }
  const etb = Number(amount);
  if (!Number.isFinite(etb) || etb <= 0) {
    throw new Error('amount must be a positive number in ETB');
  }
  return etb;
}

function generateMerchOrderId(orderId) {
  const base = String(orderId || 'order')
    .replace(/[^a-zA-Z0-9]/g, '')
    .slice(-12);
  return `${Date.now()}${base}`.slice(0, 32);
}

class TelebirrGateway extends BaseGateway {
  constructor() {
    super(PaymentGateway.TELEBIRR);
    this.requiresPaymentTypeId = true;
    this.requiresIntentIdOnVerify = true;
    this.requiresServerConfig = true;
  }

  mapCredentials(config, mode) {
    return mapTelebirrCredentials(config, mode);
  }

  async createIntent(payload) {
    const paymentTypeId = getPaymentTypeId(payload);
    logger.info('telebirr', 'createIntent', {
      paymentTypeId,
      orderId: payload.orderId,
      amount: payload.amount,
      currency: payload.currency,
    });

    const { loadPaymentTypeGatewayConfig } = require('../../lib/gateway-config.store');
    const { credentials } = await loadPaymentTypeGatewayConfig(paymentTypeId, this.name);

    const amount = resolveEtbAmount(payload.amount, payload.currency);
    const merchOrderId = generateMerchOrderId(payload.orderId);
    const notifyUrl = buildTelebirrWebhookCallbackUrl(payload.orderId);
    const redirectUrl = payload.returnUrl || `${getPaymentBaseUrl()}/payments/checkout/telebirr/complete`;

    const order = await createPreOrder({
      credentials,
      merchOrderId,
      amount,
      title: `Order ${payload.orderId}`,
      notifyUrl,
      redirectUrl,
    });

    const paymentUrl = buildSignedCheckoutUrl({
      credentials,
      prepayId: order.prepayId,
    });

    logger.info('telebirr', 'preOrder created', {
      merchOrderId: order.merchOrderId,
      prepayId: order.prepayId,
      mode: credentials.mode,
    });

    const now = Date.now();
    return {
      gateway: this.name,
      intentId: order.merchOrderId,
      paymentUrl,
      clientToken: order.prepayId,
      status: PaymentStatus.PENDING,
      expiresAt: new Date(now + 15 * 60 * 1000).toISOString(),
      gatewayPayload: {
        merchOrderId: order.merchOrderId,
        prepayId: order.prepayId,
        paymentTypeId,
        notifyUrl,
      },
    };
  }

  async verify(payload) {
    const paymentTypeId = getPaymentTypeId(payload);
    const merchOrderId = payload.intentId;
    if (!merchOrderId) {
      throw new Error('intentId (merch_order_id) is required for Telebirr verify');
    }

    const { loadPaymentTypeGatewayConfig } = require('../../lib/gateway-config.store');
    const { credentials } = await loadPaymentTypeGatewayConfig(paymentTypeId, this.name);

    const result = await queryOrder({
      credentials,
      merchOrderId,
    });

    const status = mapOrderStatus(result.order_status || result.trade_status);

    return {
      gateway: this.name,
      status,
      verifiedAt: new Date().toISOString(),
      reference: result.trans_id || result.payment_order_id || null,
      gatewayPayload: {
        merchOrderId,
        orderStatus: result.order_status || result.trade_status || null,
        paymentOrderId: result.payment_order_id || null,
        transId: result.trans_id || null,
        totalAmount: result.total_amount || null,
      },
    };
  }

  async handleWebhook(payload) {
    const body = payload.body || {};
    const parsed = parseNotification(body);

    if (!parsed) {
      return {
        gateway: this.name,
        status: WebhookStatus.IGNORED,
        eventType: 'unknown',
        eventId: null,
        normalizedData: body,
        receivedAt: new Date().toISOString(),
      };
    }

    const paymentTypeId = body.paymentTypeId || body.metadata?.paymentTypeId;
    let signatureValid = true;

    if (paymentTypeId) {
      try {
        const { loadPaymentTypeGatewayConfig } = require('../../lib/gateway-config.store');
        const { credentials } = await loadPaymentTypeGatewayConfig(
          String(paymentTypeId),
          this.name
        );
        signatureValid = verifyNotificationSignature(body, credentials.notifyPublicKey);
      } catch (err) {
        logger.warn('telebirr', 'webhook config lookup failed', { message: err.message });
      }
    }

    if (!signatureValid) {
      return {
        gateway: this.name,
        status: WebhookStatus.REJECTED,
        eventType: 'notify',
        eventId: parsed.merchOrderId,
        normalizedData: { ...parsed, signatureValid: false },
        receivedAt: new Date().toISOString(),
      };
    }

    return {
      gateway: this.name,
      status: WebhookStatus.RECEIVED,
      eventType: 'notify',
      eventId: parsed.merchOrderId,
      normalizedData: {
        ...parsed,
        signatureValid,
      },
      receivedAt: new Date().toISOString(),
    };
  }
}

module.exports = { TelebirrGateway, mapTelebirrCredentials };
