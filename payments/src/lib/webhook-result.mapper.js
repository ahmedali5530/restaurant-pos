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

function mapStoredWebhookToVerifyResponse(gateway, stored) {
  const name = String(gateway || '').toLowerCase();
  if (name === 'mpesa') {
    return mapMpesaWebhookToVerifyResponse(stored);
  }
  if (name === 'telebirr') {
    return mapTelebirrWebhookToVerifyResponse(stored);
  }
  return null;
}

module.exports = {
  mapStoredWebhookToVerifyResponse,
  mapMpesaWebhookToVerifyResponse,
  mapTelebirrWebhookToVerifyResponse,
};
