'use strict';

const { parseStkCallback, mapStkResultCode } = require('../gateways/mpesa/daraja.client');
const { parseNotification } = require('../gateways/telebirr/fabric.client');

function mapMpesaWebhookToVerifyResponse(stored) {
  const raw = stored?.raw || stored?.normalized?.normalizedData || stored;
  const parsed = parseStkCallback(raw);
  if (!parsed) {
    return null;
  }

  const status = mapStkResultCode(parsed.resultCode);

  return {
    gateway: 'mpesa',
    status,
    verifiedAt: new Date().toISOString(),
    reference: parsed.mpesaReceiptNumber || null,
    gatewayPayload: {
      resultCode: parsed.resultCode,
      resultDesc: parsed.resultDesc,
      checkoutRequestId: parsed.checkoutRequestId,
      merchantRequestId: parsed.merchantRequestId,
      mpesaReceiptNumber: parsed.mpesaReceiptNumber,
      amount: parsed.amount,
      phone: parsed.phone,
    },
  };
}

function mapTelebirrWebhookToVerifyResponse(stored) {
  const raw = stored?.raw || stored?.normalized?.normalizedData?.raw || stored;
  const parsed = parseNotification(raw);
  if (!parsed) {
    return null;
  }

  return {
    gateway: 'telebirr',
    status: parsed.paymentStatus,
    verifiedAt: new Date().toISOString(),
    reference: parsed.transId || parsed.paymentOrderId || null,
    gatewayPayload: {
      merchOrderId: parsed.merchOrderId,
      paymentOrderId: parsed.paymentOrderId,
      transId: parsed.transId,
      tradeStatus: parsed.tradeStatus,
    },
  };
}

function mapStripeWebhookToVerifyResponse(stored) {
  const normalized =
    stored?.normalized?.normalizedData ||
    stored?.normalized ||
    stored?.raw ||
    stored;
  if (!normalized) {
    return null;
  }

  const paymentStatus = normalized.paymentStatus;
  if (!paymentStatus) {
    return null;
  }

  return {
    gateway: 'stripe',
    status: paymentStatus,
    verifiedAt: new Date().toISOString(),
    reference: normalized.reference || normalized.intentId || null,
    gatewayPayload: {
      eventType: normalized.eventType,
      intentId: normalized.intentId,
      orderId: normalized.orderId,
    },
  };
}

function mapPaypalWebhookToVerifyResponse(stored) {
  const normalized =
    stored?.normalized?.normalizedData ||
    stored?.normalized ||
    stored?.raw ||
    stored;
  if (!normalized) {
    return null;
  }

  const paymentStatus = normalized.paymentStatus;
  if (!paymentStatus) {
    return null;
  }

  return {
    gateway: 'paypal',
    status: paymentStatus,
    verifiedAt: new Date().toISOString(),
    reference: normalized.reference || normalized.intentId || null,
    gatewayPayload: {
      eventType: normalized.eventType,
      intentId: normalized.intentId,
      orderId: normalized.orderId,
    },
  };
}

function mapJazzcashWebhookToVerifyResponse(stored) {
  const normalized =
    stored?.normalized?.normalizedData ||
    stored?.normalized ||
    stored?.raw ||
    stored;
  if (!normalized) {
    return null;
  }

  const paymentStatus = normalized.paymentStatus;
  if (!paymentStatus) {
    return null;
  }

  return {
    gateway: 'jazzcash',
    status: paymentStatus,
    verifiedAt: new Date().toISOString(),
    reference: normalized.reference || normalized.txnRefNo || null,
    gatewayPayload: {
      responseCode: normalized.responseCode,
      txnRefNo: normalized.txnRefNo,
      orderId: normalized.orderId,
    },
  };
}

function mapRazorpayWebhookToVerifyResponse(stored) {
  const normalized =
    stored?.normalized?.normalizedData ||
    stored?.normalized ||
    stored?.raw ||
    stored;
  if (!normalized) {
    return null;
  }

  const paymentStatus = normalized.paymentStatus;
  if (!paymentStatus) {
    return null;
  }

  return {
    gateway: 'razorpay',
    status: paymentStatus,
    verifiedAt: new Date().toISOString(),
    reference: normalized.reference || normalized.paymentId || null,
    gatewayPayload: {
      eventType: normalized.eventType,
      intentId: normalized.intentId,
      paymentId: normalized.paymentId,
      orderId: normalized.orderId,
    },
  };
}

function mapStoredWebhookToVerifyResponse(gateway, stored) {
  const name = String(gateway || '').toLowerCase();
  if (name === 'mpesa') {
    return mapMpesaWebhookToVerifyResponse(stored);
  }
  if (name === 'telebirr') {
    return mapTelebirrWebhookToVerifyResponse(stored);
  }
  if (name === 'stripe') {
    return mapStripeWebhookToVerifyResponse(stored);
  }
  if (name === 'paypal') {
    return mapPaypalWebhookToVerifyResponse(stored);
  }
  if (name === 'razorpay') {
    return mapRazorpayWebhookToVerifyResponse(stored);
  }
  if (name === 'jazzcash') {
    return mapJazzcashWebhookToVerifyResponse(stored);
  }
  return null;
}

module.exports = {
  mapStoredWebhookToVerifyResponse,
  mapMpesaWebhookToVerifyResponse,
  mapTelebirrWebhookToVerifyResponse,
  mapStripeWebhookToVerifyResponse,
  mapPaypalWebhookToVerifyResponse,
  mapRazorpayWebhookToVerifyResponse,
  mapJazzcashWebhookToVerifyResponse,
};
