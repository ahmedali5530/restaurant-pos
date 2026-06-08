'use strict';

const crypto = require('crypto');
const logger = require('../../lib/logger');

const SANDBOX_API_BASE =
  'https://developerportal.ethiotelebirr.et:38443/apiaccess/payment/gateway';
const SANDBOX_WEB_BASE =
  'https://developerportal.ethiotelebirr.et:38443/payment/web/paygate?';

const DEFAULT_LIVE_API_BASE =
  process.env.TELEBIRR_LIVE_BASE_URL ||
  'https://telebirrapp.ethiotelecom.et:38443/apiaccess/payment/gateway';
const DEFAULT_LIVE_WEB_BASE =
  process.env.TELEBIRR_LIVE_WEB_BASE_URL ||
  'https://telebirrapp.ethiotelecom.et:38443/payment/web/paygate?';

const SIGN_EXCLUDE = new Set(['sign', 'sign_type']);
const tokenCache = new Map();

function normalizePrivateKey(pem) {
  const text = String(pem || '').trim();
  if (!text) {
    throw new Error('RSA private key is required for Telebirr');
  }
  return text.includes('\\n') ? text.replace(/\\n/g, '\n') : text;
}

function getApiBaseUrl(credentials) {
  return credentials.mode === 'live' ? credentials.liveApiBaseUrl : credentials.sandboxApiBaseUrl;
}

function getWebBaseUrl(credentials) {
  if (credentials.webBaseUrlOverride) {
    const override = String(credentials.webBaseUrlOverride).trim();
    return override.endsWith('?') ? override : `${override}?`;
  }
  return credentials.mode === 'live' ? credentials.liveWebBaseUrl : credentials.sandboxWebBaseUrl;
}

function buildCredentialsFromMapped(mapped) {
  return {
    fabricAppId: mapped.fabricAppId,
    appSecret: mapped.appSecret,
    merchantAppId: mapped.merchantAppId,
    merchantCode: mapped.merchantCode,
    privateKey: normalizePrivateKey(mapped.privateKey),
    notifyPublicKey: mapped.notifyPublicKey || null,
    mode: mapped.mode === 'live' ? 'live' : 'sandbox',
    sandboxApiBaseUrl: SANDBOX_API_BASE,
    sandboxWebBaseUrl: SANDBOX_WEB_BASE,
    liveApiBaseUrl: mapped.liveApiBaseUrl || DEFAULT_LIVE_API_BASE,
    liveWebBaseUrl: mapped.liveWebBaseUrl || DEFAULT_LIVE_WEB_BASE,
    webBaseUrlOverride: mapped.webBaseUrlOverride || null,
  };
}

function generateNonceStr(length = 32) {
  const chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let out = '';
  for (let i = 0; i < length; i += 1) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
}

function generateTimestamp() {
  return String(Math.floor(Date.now() / 1000));
}

function flattenSignFields(requestObject) {
  const fieldMap = {};

  for (const [key, value] of Object.entries(requestObject || {})) {
    if (SIGN_EXCLUDE.has(key)) continue;
    if (value === null || value === undefined) continue;
    if (typeof value === 'object') continue;
    fieldMap[key] = String(value);
  }

  if (requestObject?.biz_content && typeof requestObject.biz_content === 'object') {
    for (const [key, value] of Object.entries(requestObject.biz_content)) {
      if (SIGN_EXCLUDE.has(key)) continue;
      if (value === null || value === undefined) continue;
      if (typeof value === 'object') continue;
      fieldMap[key] = String(value);
    }
  }

  const keys = Object.keys(fieldMap).sort();
  return keys.map((key) => `${key}=${fieldMap[key]}`).join('&');
}

function signString(text, privateKeyPem) {
  const key = normalizePrivateKey(privateKeyPem);
  const signature = crypto.sign('sha256', Buffer.from(text, 'utf8'), {
    key,
    padding: crypto.constants.RSA_PKCS1_PSS_PADDING,
    saltLength: crypto.constants.RSA_PSS_SALTLEN_DIGEST,
  });
  return signature.toString('base64');
}

function signRequestObject(requestObject, privateKeyPem) {
  const origin = flattenSignFields(requestObject);
  return signString(origin, privateKeyPem);
}

function signRawCheckoutParams(params, privateKeyPem) {
  const keys = Object.keys(params).sort();
  const origin = keys.map((key) => `${key}=${params[key]}`).join('&');
  return signString(origin, privateKeyPem);
}

function buildFabricError(label, res, body, fallbackMessage) {
  const message =
    body?.errorMsg ||
    body?.msg ||
    body?.message ||
    fallbackMessage ||
    `${label} failed (${res?.status || 'unknown'})`;
  const err = new Error(message);
  err.details = {
    step: label,
    httpStatus: res?.status,
    response: logger.sanitizeBody(body),
  };
  return err;
}

async function fabricFetch(label, url, options, requestLog) {
  logger.info('telebirr', `${label} request`, { url, ...requestLog });
  const res = await fetch(url, options);
  const text = await res.text();
  let body = {};
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { raw: text?.slice(0, 500) };
  }
  logger.info('telebirr', `${label} response`, {
    httpStatus: res.status,
    body: logger.sanitizeBody(body),
  });
  return { res, body };
}

async function applyFabricToken(credentials) {
  const creds = buildCredentialsFromMapped(credentials);
  const cacheKey = `${creds.mode}:${creds.fabricAppId}`;
  const cached = tokenCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.token;
  }

  const url = `${getApiBaseUrl(creds)}/payment/v1/token`;
  const { res, body } = await fabricFetch(
    'token',
    url,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-APP-Key': creds.fabricAppId,
        Accept: 'application/json',
      },
      body: JSON.stringify({ appSecret: creds.appSecret }),
    },
    { mode: creds.mode, fabricAppId: logger.maskSecret(creds.fabricAppId) }
  );

  if (!res.ok) {
    throw buildFabricError('Telebirr token', res, body);
  }

  const token = body.token;
  if (!token) {
    throw new Error('Telebirr token response did not include token');
  }

  let expiresAt = Date.now() + 55 * 60 * 1000;
  if (body.expirationDate && /^\d{14}$/.test(String(body.expirationDate))) {
    const exp = String(body.expirationDate);
    const iso = `${exp.slice(0, 4)}-${exp.slice(4, 6)}-${exp.slice(6, 8)}T${exp.slice(8, 10)}:${exp.slice(10, 12)}:${exp.slice(12, 14)}Z`;
    const parsed = Date.parse(iso);
    if (Number.isFinite(parsed)) {
      expiresAt = parsed - 5 * 60 * 1000;
    }
  }

  tokenCache.set(cacheKey, { token, expiresAt });
  return token;
}

function cleanTitle(title) {
  const cleaned = String(title || 'POS Payment')
    .replace(/[^a-zA-Z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 100);
  return cleaned || 'POS Payment';
}

function formatEtbAmount(amount) {
  const value = Number(amount);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error('amount must be a positive number');
  }
  return value.toFixed(2);
}

async function createPreOrder({
  credentials,
  merchOrderId,
  amount,
  title,
  notifyUrl,
  redirectUrl,
}) {
  const creds = buildCredentialsFromMapped(credentials);
  const token = await applyFabricToken(creds);
  const formattedAmount = formatEtbAmount(amount);

  const request = {
    timestamp: generateTimestamp(),
    nonce_str: generateNonceStr(),
    method: 'payment.preorder',
    version: '1.0',
    sign_type: 'SHA256WithRSA',
    biz_content: {
      notify_url: notifyUrl,
      redirect_url: redirectUrl || notifyUrl,
      appid: creds.merchantAppId,
      merch_code: creds.merchantCode,
      merch_order_id: String(merchOrderId),
      trade_type: 'Checkout',
      title: cleanTitle(title),
      total_amount: formattedAmount,
      trans_currency: 'ETB',
      timeout_express: '120m',
      business_type: 'BuyGoods',
      payee_identifier: creds.merchantCode,
      payee_identifier_type: '04',
      payee_type: '5000',
    },
  };

  request.sign = signRequestObject(request, creds.privateKey);

  const url = `${getApiBaseUrl(creds)}/payment/v1/merchant/preOrder`;
  const { res, body } = await fabricFetch(
    'preorder',
    url,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-APP-Key': creds.fabricAppId,
        Authorization: token,
        Accept: 'application/json',
      },
      body: JSON.stringify(request),
    },
    { mode: creds.mode, merchOrderId }
  );

  if (!res.ok) {
    throw buildFabricError('Telebirr preOrder', res, body);
  }

  if (body.result !== 'SUCCESS' || String(body.code) !== '0') {
    throw new Error(body.msg || body.errorMsg || 'Telebirr preOrder failed');
  }

  const prepayId = body.biz_content?.prepay_id;
  if (!prepayId) {
    throw new Error('Telebirr preOrder did not return prepay_id');
  }

  return {
    prepayId,
    merchOrderId: String(merchOrderId),
    raw: body,
  };
}

function buildSignedCheckoutUrl({ credentials, prepayId }) {
  const creds = buildCredentialsFromMapped(credentials);
  const params = {
    appid: creds.merchantAppId,
    merch_code: creds.merchantCode,
    nonce_str: generateNonceStr(),
    prepay_id: String(prepayId),
    timestamp: generateTimestamp(),
  };

  const sign = signRawCheckoutParams(params, creds.privateKey);
  const parts = Object.entries(params).map(([key, value]) => `${key}=${encodeURIComponent(value)}`);
  parts.push(`sign=${encodeURIComponent(sign)}`);
  parts.push(`sign_type=${encodeURIComponent('SHA256WithRSA')}`);

  const webBase = getWebBaseUrl(creds);
  return `${webBase}${parts.join('&')}&version=1.0&trade_type=Checkout`;
}

async function queryOrder({ credentials, merchOrderId }) {
  const creds = buildCredentialsFromMapped(credentials);
  const token = await applyFabricToken(creds);

  const request = {
    timestamp: generateTimestamp(),
    nonce_str: generateNonceStr(),
    method: 'payment.queryorder',
    version: '1.0',
    sign_type: 'SHA256WithRSA',
    biz_content: {
      appid: creds.merchantAppId,
      merch_code: creds.merchantCode,
      merch_order_id: String(merchOrderId),
    },
  };

  request.sign = signRequestObject(request, creds.privateKey);

  const url = `${getApiBaseUrl(creds)}/payment/v1/merchant/queryOrder`;
  const { res, body } = await fabricFetch(
    'query_order',
    url,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-APP-Key': creds.fabricAppId,
        Authorization: token,
        Accept: 'application/json',
      },
      body: JSON.stringify(request),
    },
    { mode: creds.mode, merchOrderId }
  );

  if (!res.ok) {
    throw buildFabricError('Telebirr queryOrder', res, body);
  }

  if (body.result !== 'SUCCESS' || String(body.code) !== '0') {
    throw new Error(body.msg || body.errorMsg || 'Telebirr queryOrder failed');
  }

  return body.biz_content || {};
}

function mapOrderStatus(orderStatus) {
  const status = String(orderStatus || '').toUpperCase();
  if (status === 'PAY_SUCCESS' || status === 'COMPLETED') {
    return 'paid';
  }
  if (status === 'PAY_FAILED' || status === 'FAILURE' || status === 'FAILED') {
    return 'failed';
  }
  if (status === 'ORDER_CLOSED' || status === 'EXPIRED' || status === 'CLOSED') {
    return 'canceled';
  }
  return 'pending';
}

function parseNotification(body) {
  if (!body || typeof body !== 'object') {
    return null;
  }
  const merchOrderId = body.merch_order_id || body.merchOrderId;
  if (!merchOrderId) {
    return null;
  }
  return {
    merchOrderId: String(merchOrderId),
    paymentOrderId: body.payment_order_id || body.paymentOrderId || null,
    transId: body.trans_id || body.transId || null,
    tradeStatus: body.trade_status || body.tradeStatus || body.order_status || null,
    paymentStatus: mapOrderStatus(body.trade_status || body.order_status),
    raw: body,
  };
}

function verifyNotificationSignature(payload, publicKeyPem) {
  if (!publicKeyPem) {
    return true;
  }
  const sign = payload?.sign;
  if (!sign) {
    return false;
  }

  const clone = { ...payload };
  delete clone.sign;
  delete clone.sign_type;

  const keys = Object.keys(clone).sort();
  const origin = keys.map((key) => `${key}=${clone[key]}`).join('&');

  try {
    const key = String(publicKeyPem).includes('\\n')
      ? String(publicKeyPem).replace(/\\n/g, '\n')
      : String(publicKeyPem);
    return crypto.verify(
      'sha256',
      Buffer.from(origin, 'utf8'),
      {
        key,
        padding: crypto.constants.RSA_PKCS1_PSS_PADDING,
        saltLength: crypto.constants.RSA_PSS_SALTLEN_DIGEST,
      },
      Buffer.from(String(sign), 'base64')
    );
  } catch {
    return false;
  }
}

module.exports = {
  applyFabricToken,
  createPreOrder,
  queryOrder,
  buildSignedCheckoutUrl,
  mapOrderStatus,
  parseNotification,
  verifyNotificationSignature,
  signRequestObject,
  buildCredentialsFromMapped,
};
