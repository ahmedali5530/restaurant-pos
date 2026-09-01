'use strict';

const crypto = require('crypto');

const SECRET = process.env.GATEWAY_JWT_SECRET;
if (!SECRET) {
  throw new Error('GATEWAY_JWT_SECRET is required and has no default — set it in .env');
}
if (SECRET.length < 32) {
  throw new Error('GATEWAY_JWT_SECRET must be at least 32 characters');
}

const { SignJWT, jwtVerify } = require('jose');
const TTL = process.env.GATEWAY_JWT_TTL || '12h';
const key = crypto.createSecretKey(Buffer.from(SECRET, 'utf8'));

// Durable revocation store. Was previously an in-memory `Set` that was lost on
// every restart, allowing revoked sessions to be revalidated until their TTL
// expired. See ./revocation-store.js for details.
const revocation = require('./revocation-store');

function parseTtlSeconds(ttl) {
  if (!ttl) return 12 * 60 * 60;
  const m = String(ttl).trim().match(/^(\d+)([smhd])?$/i);
  if (!m) return 12 * 60 * 60;
  const n = Number(m[1]);
  const unit = (m[2] || 's').toLowerCase();
  if (unit === 'm') return n * 60;
  if (unit === 'h') return n * 60 * 60;
  if (unit === 'd') return n * 60 * 60 * 24;
  return n;
}

async function signSession({ userId, login }) {
  const jti = crypto.randomUUID();
  const token = await new SignJWT({
    sub: String(userId),
    login: String(login || ''),
    typ: 'pos_session',
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(TTL)
    .setJti(jti)
    .setIssuer('posr-gateway')
    .sign(key);

  return { token, jti, expiresIn: parseTtlSeconds(TTL) };
}

async function verifySession(token) {
  if (!token) {
    const err = new Error('Missing session token');
    err.status = 401;
    throw err;
  }

  let payload;
  try {
    ({ payload } = await jwtVerify(token, key, {
      issuer: 'posr-gateway',
      algorithms: ['HS256'],
    }));
  } catch {
    const err = new Error('Invalid or expired session token');
    err.status = 401;
    throw err;
  }

  if (payload.typ !== 'pos_session') {
    const err = new Error('Invalid token type');
    err.status = 401;
    throw err;
  }

  if (payload.jti && (await revocation.isRevoked(payload.jti))) {
    const err = new Error('Session revoked');
    err.status = 401;
    throw err;
  }

  return payload;
}

async function revokeSession(jti, expiresAtSeconds) {
  if (!jti) return;
  await revocation.revoke(jti, expiresAtSeconds);
}

function extractBearer(req) {
  const header = req.get?.('authorization') || req.headers?.authorization || '';
  const match = String(header).match(/^Bearer\s+(.+)$/i);
  if (match) return match[1].trim();
  if (req.query?.token) return String(req.query.token);
  return null;
}

module.exports = {
  signSession,
  verifySession,
  revokeSession,
  extractBearer,
  // Exposed for wiring the Surreal client at boot (see gateway/server.js).
  _revocationStore: revocation,
};
