'use strict';

const crypto = require('crypto');
const { PaymentStatus } = require('../gateway.types');

const SANDBOX_FORM_URL =
  'https://sandbox.jazzcash.com.pk/CustomerPortal/transactionmanagement/merchantform/';
const LIVE_FORM_URL =
  'https://payments.jazzcash.com.pk/CustomerPortal/transactionmanagement/merchantform/';

const SANDBOX_STATUS_URL =
  'https://sandbox.jazzcash.com.pk/ApplicationAPI/API/2.0/Purchase/DoMWalletTransaction';
const LIVE_STATUS_URL =
  'https://payments.jazzcash.com.pk/ApplicationAPI/API/2.0/Purchase/DoMWalletTransaction';

function mapJazzcashCredentials(config, mode) {
  const merchantId = config?.merchant_id;
  const password = config?.client_secret;
  const integritySalt = config?.integrity_salt;
  const txnType = (config?.public_key || '').trim() || 'CARD';

  if (!merchantId || !password || !integritySalt) {
    throw new Error(
      'JazzCash gateway config is incomplete. Set Merchant ID, Password, and Integrity Salt on the payment type.'
    );
  }

  return {
    merchantId: String(merchantId).trim(),
    password: String(password).trim(),
    integritySalt: String(integritySalt).trim(),
    txnType: txnType.toUpperCase() === 'MWALLET' ? 'MWALLET' : 'CARD',
    mode: mode === 'live' ? 'live' : 'sandbox',
  };
}

function getFormUrl(credentials) {
  return credentials.mode === 'live' ? LIVE_FORM_URL : SANDBOX_FORM_URL;
}

function getStatusUrl(credentials) {
  return credentials.mode === 'live' ? LIVE_STATUS_URL : SANDBOX_STATUS_URL;
}

function formatTxnDateTime(date = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return (
    String(date.getFullYear()) +
    pad(date.getMonth() + 1) +
    pad(date.getDate()) +
    pad(date.getHours()) +
    pad(date.getMinutes()) +
    pad(date.getSeconds())
  );
}

function toPaisa(amount, currency) {
  const value = Number(amount);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error('amount must be a positive number');
  }
  const cur = String(currency || 'PKR').toUpperCase();
  if (cur !== 'PKR') {
    throw new Error(`JazzCash requires PKR currency (received ${cur})`);
  }
  return String(Math.round(value * 100));
}

function buildSecureHash(fields, integritySalt) {
  const sortedKeys = Object.keys(fields)
    .filter((key) => key !== 'pp_SecureHash' && fields[key] !== '' && fields[key] != null)
    .sort();

  const values = sortedKeys.map((key) => String(fields[key])).join('&');
  const toHash = `${integritySalt}&${values}`;

  return crypto.createHmac('sha256', integritySalt).update(toHash).digest('hex').toUpperCase();
}

function generateTxnRefNo(orderId) {
  const base = String(orderId || 'order')
    .replace(/[^a-zA-Z0-9]/g, '')
    .slice(-8);
  return `T${Date.now()}${base}`.slice(0, 20);
}

function createPageRedirectRequest({
  credentials,
  amount,
  currency,
  orderId,
  txnRefNo,
  returnUrl,
  description,
}) {
  const now = new Date();
  const expiry = new Date(now.getTime() + 60 * 60 * 1000);
  const fields = {
    pp_Version: '2.0',
    pp_TxnType: credentials.txnType,
    pp_Language: 'EN',
    pp_MerchantID: credentials.merchantId,
    pp_SubMerchantID: '',
    pp_Password: credentials.password,
    pp_BankID: 'TBANK',
    pp_ProductID: 'RETL',
    pp_TxnRefNo: txnRefNo,
    pp_Amount: toPaisa(amount, currency),
    pp_TxnCurrency: 'PKR',
    pp_TxnDateTime: formatTxnDateTime(now),
    pp_BillReference: String(orderId),
    pp_Description: description || `Order ${orderId}`,
    pp_TxnExpiryDateTime: formatTxnDateTime(expiry),
    pp_ReturnURL: returnUrl,
    ppmpf_1: '',
    ppmpf_2: '',
    ppmpf_3: '',
    ppmpf_4: '',
    ppmpf_5: '',
    pp_SecureHash: '',
  };

  fields.pp_SecureHash = buildSecureHash(fields, credentials.integritySalt);

  return {
    fields,
    actionUrl: getFormUrl(credentials),
    txnRefNo,
  };
}

function verifyReturnHash(responseFields, integritySalt) {
  const received = responseFields?.pp_SecureHash || responseFields?.pp_securehash;
  if (!received) {
    return false;
  }

  const copy = { ...responseFields };
  delete copy.pp_SecureHash;
  delete copy.pp_securehash;

  const expected = buildSecureHash(copy, integritySalt);
  return String(received).toUpperCase() === expected;
}

function mapResponseCode(code) {
  const normalized = String(code || '').trim();
  if (normalized === '000' || normalized === '121') {
    return PaymentStatus.PAID;
  }
  if (normalized === '124' || normalized === '210') {
    return PaymentStatus.PENDING;
  }
  if (normalized === '999' || normalized === '') {
    return PaymentStatus.PENDING;
  }
  return PaymentStatus.FAILED;
}

function parseJazzcashReturn(responseFields) {
  const responseCode = responseFields?.pp_ResponseCode || responseFields?.pp_responsecode || '';
  const orderId = responseFields?.pp_BillReference || responseFields?.pp_billreference || null;
  const txnRefNo = responseFields?.pp_TxnRefNo || responseFields?.pp_txnrefno || null;

  return {
    responseCode,
    paymentStatus: mapResponseCode(responseCode),
    orderId,
    txnRefNo,
    reference: responseFields?.pp_RetreivalReferenceNo || responseFields?.pp_TxnRefNo || null,
    responseMessage: responseFields?.pp_ResponseMessage || null,
    raw: responseFields,
  };
}

async function statusInquiry(credentials, txnRefNo) {
  const fields = {
    pp_Version: '2.0',
    pp_TxnType: 'INQUIRY',
    pp_MerchantID: credentials.merchantId,
    pp_Password: credentials.password,
    pp_TxnRefNo: txnRefNo,
    pp_SecureHash: '',
  };
  fields.pp_SecureHash = buildSecureHash(fields, credentials.integritySalt);

  const res = await fetch(getStatusUrl(credentials), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(fields),
  });

  const text = await res.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }

  if (!res.ok) {
    throw new Error(data.pp_ResponseMessage || data.message || `JazzCash inquiry failed (${res.status})`);
  }

  return parseJazzcashReturn(data);
}

module.exports = {
  mapJazzcashCredentials,
  createPageRedirectRequest,
  buildSecureHash,
  verifyReturnHash,
  mapResponseCode,
  parseJazzcashReturn,
  statusInquiry,
  getFormUrl,
  generateTxnRefNo,
  formatTxnDateTime,
};
