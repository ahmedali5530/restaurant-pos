'use strict';

const LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };
const ACTIVE = LEVELS[process.env.PAYMENT_LOG_LEVEL || 'info'] ?? LEVELS.info;

function shouldLog(level) {
  return (LEVELS[level] ?? LEVELS.info) >= ACTIVE;
}

function write(level, tag, message, data) {
  if (!shouldLog(level)) return;
  const prefix = `[payment:${tag}]`;
  if (data !== undefined) {
    const line = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
    console[level](prefix, message, line);
  } else {
    console[level](prefix, message);
  }
}

function maskSecret(value, visible = 4) {
  if (value == null || value === '') return value;
  const text = String(value);
  if (text.length <= visible * 2) return '***';
  return `${text.slice(0, visible)}…${text.slice(-visible)}`;
}

function sanitizeBody(body) {
  if (!body || typeof body !== 'object') return body;
  const copy = Array.isArray(body) ? [...body] : { ...body };
  const secretKeys = [
    'Password',
    'password',
    'client_secret',
    'consumerSecret',
    'passkey',
    'integrity_salt',
    'secret_key',
    'access_token',
  ];
  for (const key of Object.keys(copy)) {
    if (secretKeys.some((k) => key.toLowerCase().includes(k.toLowerCase()))) {
      copy[key] = '***';
    } else if (typeof copy[key] === 'object' && copy[key] !== null) {
      copy[key] = sanitizeBody(copy[key]);
    }
  }
  return copy;
}

function sanitizeMpesaCredentials(credentials) {
  if (!credentials) return credentials;
  return {
    mode: credentials.mode,
    shortcode: credentials.shortcode,
    transactionType: credentials.transactionType,
    consumerKey: maskSecret(credentials.consumerKey),
    consumerSecret: maskSecret(credentials.consumerSecret),
    passkey: maskSecret(credentials.passkey),
  };
}

module.exports = {
  debug: (tag, message, data) => write('debug', tag, message, data),
  info: (tag, message, data) => write('info', tag, message, data),
  warn: (tag, message, data) => write('warn', tag, message, data),
  error: (tag, message, data) => write('error', tag, message, data),
  maskSecret,
  sanitizeBody,
  sanitizeMpesaCredentials,
};
