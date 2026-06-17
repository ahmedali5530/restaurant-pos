'use strict';

const logger = require('../../lib/logger');
const { BaseGateway } = require('../base.gateway');
const { PaymentGateway, PaymentStatus, WebhookStatus } = require('../gateway.types');
const {
  buildJazzcashReturnUrl,
  getPaymentBaseUrl,
} = require('../../lib/intent.utils');
const {
  saveCheckoutSession,
  getReturnResult,
  getCheckoutSession,
} = require('../../lib/jazzcash-checkout.store');
const {
  mapJazzcashCredentials,
  createPageRedirectRequest,
  verifyReturnHash,
  parseJazzcashReturn,
  statusInquiry,
  generateTxnRefNo,
} = require('../jazzcash/jazzcash.client');

function getPaymentTypeId(payload) {
  const id = payload?.metadata?.paymentTypeId;
  if (!id) {
    throw new Error('metadata.paymentTypeId is required for JazzCash');
  }
  return String(id);
}

class JazzcashGateway extends BaseGateway {
  constructor() {
    super(PaymentGateway.JAZZCASH);
    this.requiresPaymentTypeId = true;
    this.requiresIntentIdOnVerify = true;
    this.requiresServerConfig = true;
  }

  mapCredentials(config, mode) {
    return mapJazzcashCredentials(config, mode);
  }

  extractOrderKeyFromWebhook(normalized) {
    const orderId = normalized?.orderId;
    if (!orderId) return null;
    const text = String(orderId).trim();
    return text.includes(':') ? text : `order:${text}`;
  }

  async createIntent(payload) {
    const paymentTypeId = getPaymentTypeId(payload);
    logger.info('jazzcash', 'createIntent', {
      paymentTypeId,
      orderId: payload.orderId,
      amount: payload.amount,
      currency: payload.currency,
    });

    const { loadPaymentTypeGatewayConfig } = require('../../lib/gateway-config.store');
    const { credentials } = await loadPaymentTypeGatewayConfig(paymentTypeId, this.name);

    const txnRefNo = generateTxnRefNo(payload.orderId);
    const returnUrl = buildJazzcashReturnUrl();
    const redirect = createPageRedirectRequest({
      credentials,
      amount: payload.amount,
      currency: payload.currency || 'PKR',
      orderId: payload.orderId,
      txnRefNo,
      returnUrl,
      description: payload.metadata?.invoiceNumber
        ? `Order ${payload.metadata.invoiceNumber}`
        : `Order ${payload.orderId}`,
    });

    saveCheckoutSession(txnRefNo, {
      actionUrl: redirect.actionUrl,
      fields: redirect.fields,
      orderId: String(payload.orderId),
      paymentTypeId,
      integritySalt: credentials.integritySalt,
    });

    const paymentUrl = `${getPaymentBaseUrl()}/payments/checkout/jazzcash/${encodeURIComponent(txnRefNo)}`;
    const now = Date.now();

    return {
      gateway: this.name,
      intentId: txnRefNo,
      paymentUrl,
      clientToken: null,
      status: PaymentStatus.PENDING,
      expiresAt: new Date(now + 60 * 60 * 1000).toISOString(),
      gatewayPayload: {
        txnRefNo,
        paymentTypeId,
        mode: credentials.mode,
      },
    };
  }

  async verify(payload) {
    const paymentTypeId = getPaymentTypeId(payload);
    const txnRefNo = payload.intentId;
    if (!txnRefNo) {
      throw new Error('intentId (pp_TxnRefNo) is required for JazzCash verify');
    }

    const storedReturn = getReturnResult(txnRefNo);
    if (storedReturn) {
      return {
        gateway: this.name,
        status: storedReturn.paymentStatus,
        verifiedAt: new Date().toISOString(),
        reference: storedReturn.reference,
        gatewayPayload: {
          responseCode: storedReturn.responseCode,
          txnRefNo,
          responseMessage: storedReturn.responseMessage,
        },
      };
    }

    const { loadPaymentTypeGatewayConfig } = require('../../lib/gateway-config.store');
    const { credentials } = await loadPaymentTypeGatewayConfig(paymentTypeId, this.name);

    try {
      const inquiry = await statusInquiry(credentials, txnRefNo);
      return {
        gateway: this.name,
        status: inquiry.paymentStatus,
        verifiedAt: new Date().toISOString(),
        reference: inquiry.reference,
        gatewayPayload: {
          responseCode: inquiry.responseCode,
          txnRefNo,
          responseMessage: inquiry.responseMessage,
        },
      };
    } catch (err) {
      logger.warn('jazzcash', 'status inquiry failed', { txnRefNo, message: err.message });
      return {
        gateway: this.name,
        status: PaymentStatus.PENDING,
        verifiedAt: new Date().toISOString(),
        reference: null,
        gatewayPayload: {
          txnRefNo,
          message: err.message,
        },
      };
    }
  }

  async handleWebhook(payload) {
    let body = payload.body || {};
    if (body.raw && typeof body.raw === 'string' && body.raw.includes('=')) {
      body = Object.fromEntries(new URLSearchParams(body.raw));
    }
    const fields = typeof body === 'object' && !Array.isArray(body) ? body : {};

    const parsed = parseJazzcashReturn(fields);
    const paymentTypeId = fields.paymentTypeId || fields.metadata?.paymentTypeId;
    const txnRefNo = parsed.txnRefNo;

    let signatureValid = true;
    let integritySalt = null;

    if (paymentTypeId) {
      try {
        const { loadPaymentTypeGatewayConfig } = require('../../lib/gateway-config.store');
        const { credentials } = await loadPaymentTypeGatewayConfig(
          String(paymentTypeId),
          this.name
        );
        integritySalt = credentials.integritySalt;
      } catch (err) {
        logger.warn('jazzcash', 'webhook config lookup failed', { message: err.message });
      }
    } else if (txnRefNo) {
      const session = getCheckoutSession(txnRefNo);
      integritySalt = session?.integritySalt || null;
    }

    if (integritySalt && fields.pp_SecureHash) {
      signatureValid = verifyReturnHash(fields, integritySalt);
    } else if (fields.pp_SecureHash) {
      signatureValid = false;
    }

    if (!signatureValid) {
      return {
        gateway: this.name,
        status: WebhookStatus.REJECTED,
        eventType: 'ipn',
        eventId: parsed.txnRefNo,
        normalizedData: { ...parsed, signatureValid: false },
        receivedAt: new Date().toISOString(),
      };
    }

    if (parsed.paymentStatus === PaymentStatus.PENDING) {
      return {
        gateway: this.name,
        status: WebhookStatus.IGNORED,
        eventType: 'ipn',
        eventId: parsed.txnRefNo,
        normalizedData: parsed,
        receivedAt: new Date().toISOString(),
      };
    }

    return {
      gateway: this.name,
      status: WebhookStatus.RECEIVED,
      eventType: 'ipn',
      eventId: parsed.txnRefNo,
      orderKey: this.extractOrderKeyFromWebhook(parsed),
      normalizedData: parsed,
      receivedAt: new Date().toISOString(),
    };
  }
}

module.exports = { JazzcashGateway, mapJazzcashCredentials };
