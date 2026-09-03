'use strict';

const logger = require('../../lib/logger');

const SANDBOX_BASE = 'https://sandbox.safaricom.co.ke';
const LIVE_BASE = 'https://api.safaricom.co.ke';

const tokenCache = new Map();

function getBaseUrl(mode) {
  return mode === 'live' ? LIVE_BASE : SANDBOX_BASE;
}

function formatTimestamp(date = new Date()) {
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

function buildPassword(shortcode, passkey, timestamp) {
  return Buffer.from(`${shortcode}${passkey}${timestamp}`).toString('base64');
}

function normalizeMpesaPhone(phone) {
  const raw = String(phone || '').replace(/\s+/g, '').replace(/^\+/, '');
  if (!raw) {
    throw new Error('Customer phone is required for M-Pesa STK push');
  }

  if (/^254\d{9}$/.test(raw)) {
    return raw;
  }
  if (/^0\d{9}$/.test(raw)) {
    return `254${raw.slice(1)}`;
  }
  if (/^7\d{8}$/.test(raw)) {
    return `254${raw}`;
  }

  throw new Error('Invalid M-Pesa phone number. Use 2547XXXXXXXX or 07XXXXXXXX');
}

function maskPhone(phone) {
  if (!phone || phone.length < 8) return phone;
  return `${phone.slice(0, 6)}***${phone.slice(-2)}`;
}

function buildDarajaError(label, res, body, fallbackMessage) {
  const message =
    body?.errorMessage ||
    body?.error ||
    body?.ResponseDescription ||
    fallbackMessage ||
    `${label} failed (${res?.status || 'unknown'})`;
  const err = new Error(message);
  err.details = {
    step: label,
    httpStatus: res?.status,
    response: logger.sanitizeBody(body),
  };
  if (res?.status >= 400 && res?.status < 500) {
    err.statusCode = res.status;
  }
  return err;
}

async function darajaFetch(label, url, options, requestLog) {
  logger.info('daraja', `${label} request`, {
    url,
    ...requestLog,
  });


  const res = await fetch(url, options);
  const text = await res.text();
  let body = {};
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { raw: text?.slice(0, 500) };
  }

  logger.info('daraja', `${label} response`, {
    httpStatus: res.status,
    body: logger.sanitizeBody(body),
    options,
    url
  });

  return { res, body };
}

async function getAccessToken(credentials) {
  const cacheKey = `${credentials.mode}:${credentials.consumerKey}`;
  const cached = tokenCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.token;
  }

  const auth = Buffer.from(
    `${credentials.consumerKey}:${credentials.consumerSecret}`
  ).toString('base64');

  const url = `${getBaseUrl(credentials.mode)}/oauth/v1/generate?grant_type=client_credentials`;
  const { res, body } = await darajaFetch(
    'oauth',
    url,
    {
      method: 'GET',
      headers: {
        Authorization: `Basic ${auth}`,
      },
    },
    {
      mode: credentials.mode,
      consumerKey: logger.maskSecret(credentials.consumerKey),
    }
  );

  if (!res.ok) {
    throw buildDarajaError('Daraja OAuth', res, body);
  }

  const token = body.access_token;
  if (!token) {
    const err = new Error('Daraja OAuth did not return access_token');
    err.details = { step: 'oauth', response: logger.sanitizeBody(body) };
    throw err;
  }

  const expiresIn = Number(body.expires_in || 3500);
  tokenCache.set(cacheKey, {
    token,
    expiresAt: Date.now() + Math.max(expiresIn - 60, 60) * 1000,
  });

  return token;
}

async function stkPush({
  credentials,
  phone,
  amount,
  accountReference,
  description,
  callbackUrl,
}) {
  const normalizedPhone = normalizeMpesaPhone(phone);
  const timestamp = formatTimestamp();
  const password = buildPassword(credentials.shortcode, credentials.passkey, timestamp);
  const token = await getAccessToken(credentials);

  const payload = {
    BusinessShortCode: credentials.shortcode.length > 0 ? credentials.shortcode : undefined,
    Password: password.length > 0 ? password : undefined,
    Timestamp: timestamp,
    TransactionType: credentials.transactionType,
    Amount: amount,
    PartyA: normalizedPhone,
    PartyB: credentials.shortcode,
    PhoneNumber: normalizedPhone,
    CallBackURL: callbackUrl,
    AccountReference: String(accountReference).slice(0, 12),
    TransactionDesc: String(description || 'POS Payment').slice(0, 13),
  };

  console.log(payload)

  const url = `${getBaseUrl(credentials.mode)}/mpesa/stkpush/v1/processrequest`;
  const { res, body } = await darajaFetch(
    'stk_push',
    url,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    },
    {
      mode: credentials.mode,
      request: logger.sanitizeBody(payload),
    }
  );

  if (!res.ok) {
    throw buildDarajaError('Daraja STK push', res, body);
  }

  if (String(body.ResponseCode) !== '0') {
    const err = new Error(
      body.ResponseDescription || `Daraja STK push rejected (ResponseCode ${body.ResponseCode})`
    );
    err.details = {
      step: 'stk_push',
      responseCode: body.ResponseCode,
      response: logger.sanitizeBody(body),
    };
    throw err;
  }

  return {
    merchantRequestId: body.MerchantRequestID,
    checkoutRequestId: body.CheckoutRequestID,
    customerMessage: body.CustomerMessage,
    phone: normalizedPhone,
  };
}

async function stkPushQuery({ credentials, checkoutRequestId }) {
  const timestamp = formatTimestamp();
  const password = buildPassword(credentials.shortcode, credentials.passkey, timestamp);
  const token = await getAccessToken(credentials);

  const payload = {
    BusinessShortCode: credentials.shortcode,
    Password: password,
    Timestamp: timestamp,
    CheckoutRequestID: checkoutRequestId,
  };

  const url = `${getBaseUrl(credentials.mode)}/mpesa/stkpushquery/v1/query`;
  const { res, body } = await darajaFetch(
    'stk_query',
    url,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    },
    {
      mode: credentials.mode,
      checkoutRequestId,
      request: logger.sanitizeBody(payload),
    }
  );

  if (!res.ok) {
    throw buildDarajaError('Daraja STK query', res, body);
  }

  return body;
}

function extractCallbackMetadata(items) {
  const metadata = {};
  if (!Array.isArray(items)) {
    return metadata;
  }
  for (const item of items) {
    if (item && item.Name) {
      metadata[item.Name] = item.Value;
    }
  }
  return metadata;
}

function parseStkCallback(body) {
  const callback = body?.Body?.stkCallback;
  if (!callback) {
    return null;
  }

  const resultCode = Number(callback.ResultCode);
  const metadata = extractCallbackMetadata(callback.CallbackMetadata?.Item);

  return {
    merchantRequestId: callback.MerchantRequestID,
    checkoutRequestId: callback.CheckoutRequestID,
    resultCode,
    resultDesc: callback.ResultDesc,
    mpesaReceiptNumber: metadata.MpesaReceiptNumber || null,
    amount: metadata.Amount ?? null,
    phone: metadata.PhoneNumber || null,
    metadata,
  };
}

function mapStkResultCode(resultCode) {
  if (resultCode === 0) {
    return 'paid';
  }
  if (resultCode === 1032) {
    return 'canceled';
  }
  if (resultCode === 1037) {
    return 'pending';
  }
  if (Number.isFinite(resultCode) && resultCode > 0) {
    return 'failed';
  }
  return 'pending';
}

module.exports = {
  stkPush,
  stkPushQuery,
  parseStkCallback,
  mapStkResultCode,
  normalizeMpesaPhone,
  maskPhone,
  formatTimestamp,
  buildPassword,
};
