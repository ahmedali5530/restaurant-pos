'use strict';

const logger = require('../../lib/logger');
const { BaseGateway } = require('../base.gateway');
const { PaymentGateway, PaymentStatus, WebhookStatus } = require('../gateway.types');
const { loadPaymentTypeGatewayConfig } = require('../../lib/gateway-config.store');
const { buildMpesaWebhookCallbackUrl } = require('../../lib/intent.utils');
const {
  stkPush,
  stkPushQuery,
  parseStkCallback,
  mapStkResultCode,
  maskPhone,
} = require('../mpesa/daraja.client');

function getPaymentTypeId(payload) {
  const id = payload?.metadata?.paymentTypeId;
  if (!id) {
    throw new Error('metadata.paymentTypeId is required for M-Pesa');
  }
  return String(id);
}

function resolveKesAmount(amount, currency) {
  const cur = String(currency || '').toUpperCase();
  if (cur && cur !== 'KES') {
    throw new Error(`M-Pesa requires KES currency (received ${cur})`);
  }
  const kes = Math.round(Number(amount));
  if (!Number.isFinite(kes) || kes <= 0) {
    throw new Error('amount must be a positive number in whole KES');
  }
  return kes;
}

class MpesaGateway extends BaseGateway {
  constructor() {
    super(PaymentGateway.MPESA);
  }

  async createIntent(payload) {
    const paymentTypeId = getPaymentTypeId(payload);
    logger.info('mpesa', 'createIntent', {
      paymentTypeId,
      orderId: payload.orderId,
      amount: payload.amount,
      currency: payload.currency,
      phone: payload.customer?.phone ? logger.maskSecret(String(payload.customer.phone), 6) : null,
    });

    const { mpesa } = await loadPaymentTypeGatewayConfig(paymentTypeId);

    const phone = payload.customer?.phone;
    if (!phone) {
      throw new Error('customer.phone is required for M-Pesa STK push');
    }

    const amount = resolveKesAmount(payload.amount, payload.currency);
    const callbackUrl = buildMpesaWebhookCallbackUrl();
    logger.info('mpesa', 'STK push starting', { amount, callbackUrl, mode: mpesa.mode });

    const stk = await stkPush({
      credentials: mpesa,
      phone,
      amount,
      accountReference: payload.orderId,
      description: `Order ${payload.orderId}`,
      callbackUrl,
    });

    logger.info('mpesa', 'STK push accepted', {
      checkoutRequestId: stk.checkoutRequestId,
      merchantRequestId: stk.merchantRequestId,
      customerMessage: stk.customerMessage,
    });

    const now = Date.now();
    return {
      gateway: this.name,
      intentId: stk.checkoutRequestId,
      paymentUrl: null,
      clientToken: maskPhone(stk.phone),
      status: PaymentStatus.PENDING,
      expiresAt: new Date(now + 5 * 60 * 1000).toISOString(),
      gatewayPayload: {
        merchantRequestId: stk.merchantRequestId,
        checkoutRequestId: stk.checkoutRequestId,
        customerMessage: stk.customerMessage,
        phone: stk.phone,
        paymentTypeId,
      },
    };
  }

  async verify(payload) {
    const paymentTypeId = getPaymentTypeId(payload);
    const checkoutRequestId = payload.intentId;
    if (!checkoutRequestId) {
      throw new Error('intentId (CheckoutRequestID) is required for M-Pesa verify');
    }

    const { mpesa } = await loadPaymentTypeGatewayConfig(paymentTypeId);
    const query = await stkPushQuery({
      credentials: mpesa,
      checkoutRequestId,
    });

    const resultCode = Number(query.ResultCode);
    const status = mapStkResultCode(resultCode);

    return {
      gateway: this.name,
      status,
      verifiedAt: new Date().toISOString(),
      reference: query.MpesaReceiptNumber || null,
      gatewayPayload: {
        resultCode,
        resultDesc: query.ResultDesc,
        responseCode: query.ResponseCode,
        responseDescription: query.ResponseDescription,
        checkoutRequestId: query.CheckoutRequestID || checkoutRequestId,
        merchantRequestId: query.MerchantRequestID || null,
      },
    };
  }

  async handleWebhook(payload) {
    const parsed = parseStkCallback(payload.body || {});
    if (!parsed) {
      return {
        gateway: this.name,
        status: WebhookStatus.IGNORED,
        eventType: 'unknown',
        eventId: null,
        normalizedData: payload.body || {},
        receivedAt: new Date().toISOString(),
      };
    }

    const paymentStatus = mapStkResultCode(parsed.resultCode);

    return {
      gateway: this.name,
      status: WebhookStatus.RECEIVED,
      eventType: 'stk_callback',
      eventId: parsed.checkoutRequestId,
      normalizedData: {
        ...parsed,
        paymentStatus,
      },
      receivedAt: new Date().toISOString(),
    };
  }
}

module.exports = { MpesaGateway };
