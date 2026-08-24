'use strict';

/**
 * Shared POS session JWT verification for payment / print / tracking sidecars.
 * Must use the same GATEWAY_JWT_SECRET as the gateway service.
 */

const crypto = require('crypto');
const { jwtVerify } = require('jose');

function getSecretKey() {
  const secret = process.env.GATEWAY_JWT_SECRET || process.env.POS_SESSION_SECRET;
  if (!secret) {
    return null;
  }
  return crypto.createSecretKey(Buffer.from(secret, 'utf8'));
}

function authRequired() {
  const flag = process.env.GATEWAY_AUTH_REQUIRED;
  if (flag === undefined || flag === '') {
    // Default on when a secret is configured
    return Boolean(getSecretKey());
  }
  return flag === '1' || flag === 'true' || flag === 'yes';
}

function extractBearer(req) {
  const header = req.get?.('authorization') || req.headers?.authorization || '';
  const match = String(header).match(/^Bearer\s+(.+)$/i);
  if (match) return match[1].trim();
  if (req.query?.token) return String(req.query.token);
  return null;
}

function createSessionAuthMiddleware(options = {}) {
  const optional = Boolean(options.optional);

  return async function sessionAuthMiddleware(req, res, next) {
    // CORS preflight must not require a JWT (browsers never send Authorization on OPTIONS).
    if (req.method === 'OPTIONS') {
      return next();
    }

    if (!authRequired()) {
      return next();
    }

    const key = getSecretKey();
    if (!key) {
      return res.status(503).json({
        ok: false,
        error: 'Session auth misconfigured (GATEWAY_JWT_SECRET missing)',
      });
    }

    const token = extractBearer(req);
    if (!token) {
      if (optional) return next();
      return res.status(401).json({ ok: false, error: 'Unauthorized' });
    }

    try {
      const { payload } = await jwtVerify(token, key, {
        issuer: 'posr-gateway',
        algorithms: ['HS256'],
      });
      if (payload.typ !== 'pos_session') {
        return res.status(401).json({ ok: false, error: 'Invalid token type' });
      }
      req.posSession = payload;
      return next();
    } catch {
      return res.status(401).json({ ok: false, error: 'Invalid or expired session' });
    }
  };
}

function originHostAliases(origin) {
  try {
    const url = new URL(origin);
    const hosts = new Set([url.host]);
    if (url.hostname === 'localhost') {
      hosts.add(`127.0.0.1${url.port ? `:${url.port}` : ''}`);
    } else if (url.hostname === '127.0.0.1') {
      hosts.add(`localhost${url.port ? `:${url.port}` : ''}`);
    }
    return [...hosts].map((host) => `${url.protocol}//${host}`);
  } catch {
    return [origin];
  }
}

function createCorsOriginDelegate() {
  const raw =
    process.env.PAYMENT_ALLOWED_ORIGINS ||
    process.env.GATEWAY_ALLOWED_ORIGINS ||
    process.env.ALLOWED_ORIGINS ||
    '';
  const allowed = String(raw)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  // Expand localhost ↔ 127.0.0.1 aliases for each listed origin.
  const allowedExpanded = new Set();
  for (const entry of allowed) {
    if (entry === '*') {
      allowedExpanded.add('*');
      continue;
    }
    for (const alias of originHostAliases(entry)) {
      allowedExpanded.add(alias);
    }
  }

  return function originDelegate(origin, cb) {
    // No Origin header = same-origin or a non-browser caller — always fine.
    if (!origin) {
      return cb(null, true);
    }
    if (allowedExpanded.has('*')) {
      return cb(null, true);
    }
    if (allowedExpanded.has(origin)) {
      return cb(null, true);
    }
    // Also accept if any alias of the request origin is listed.
    for (const alias of originHostAliases(origin)) {
      if (allowedExpanded.has(alias)) {
        return cb(null, true);
      }
    }
    return cb(null, false);
  };
}

module.exports = {
  createSessionAuthMiddleware,
  createCorsOriginDelegate,
  authRequired,
  extractBearer,
};
