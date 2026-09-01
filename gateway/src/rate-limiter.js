'use strict';

/**
 * Lightweight in-memory rate limiter for the auth gateway.
 *
 * Two buckets are tracked per failed login:
 *   1. By client IP        — defends against distributed PIN brute force
 *   2. By login identifier — defends against targeted account brute force
 *
 * Both must be under their respective thresholds for a request to proceed.
 * Successful login clears the per-login bucket (so a typo doesn't lock a
 * real user out). Failed login increments both buckets and, when the threshold
 * is crossed, sets a lockout window.
 *
 * Configurable via env vars:
 *   AUTH_LOGIN_MAX_ATTEMPTS    default 5  — failures before lockout
 *   AUTH_LOGIN_LOCKOUT_MS      default 15 * 60 * 1000 (15 minutes)
 *   AUTH_LOGIN_WINDOW_MS       default 15 * 60 * 1000 (sliding failure window)
 *   AUTH_LOGIN_BYPASS_IPS      comma-separated CIDRs / IPs that skip limiting
 *                             (e.g. 127.0.0.1, 10.0.0.0/8). Use sparingly.
 *
 * State is in-memory (per-process). With a single gateway container this is
 * sufficient. For horizontal scaling, replace `Buckets` with a Redis backend.
 */

const MAX_ATTEMPTS = Number(process.env.AUTH_LOGIN_MAX_ATTEMPTS || 5);
const LOCKOUT_MS = Number(process.env.AUTH_LOGIN_LOCKOUT_MS || 15 * 60 * 1000);
const WINDOW_MS = Number(process.env.AUTH_LOGIN_WINDOW_MS || 15 * 60 * 1000);

const BYPASS_IPS = new Set(
  (process.env.AUTH_LOGIN_BYPASS_IPS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
);

/**
 * @typedef {{ failures: number[], lockedUntil: number }} Bucket
 */
class Buckets {
  constructor() {
    /** @type {Map<string, Bucket>} */
    this.byKey = new Map();
    // Periodic GC so memory doesn't grow unbounded.
    setInterval(() => this.gc(), 5 * 60 * 1000).unref?.();
  }

  gc() {
    const now = Date.now();
    for (const [key, bucket] of this.byKey) {
      bucket.failures = bucket.failures.filter((t) => now - t < WINDOW_MS);
      if (bucket.failures.length === 0 && now > bucket.lockedUntil) {
        this.byKey.delete(key);
      }
    }
  }

  /** @param {string} key */
  getOrCreate(key) {
    let b = this.byKey.get(key);
    if (!b) {
      b = { failures: [], lockedUntil: 0 };
      this.byKey.set(key, b);
    }
    return b;
  }

  /**
   * Returns the lockout status. `locked` true means the caller MUST reject
   * without checking credentials.
   */
  check(key) {
    const b = this.getOrCreate(key);
    const now = Date.now();
    if (b.lockedUntil > now) {
      return { locked: true, retryAfterMs: b.lockedUntil - now };
    }
    // Sliding window — drop old failures.
    b.failures = b.failures.filter((t) => now - t < WINDOW_MS);
    return { locked: false, retryAfterMs: 0, attempts: b.failures.length };
  }

  /** Record a failure; engages lockout when threshold is reached. */
  recordFailure(key) {
    const b = this.getOrCreate(key);
    const now = Date.now();
    b.failures.push(now);
    b.failures = b.failures.filter((t) => now - t < WINDOW_MS);
    if (b.failures.length >= MAX_ATTEMPTS) {
      b.lockedUntil = now + LOCKOUT_MS;
      return { locked: true, retryAfterMs: LOCKOUT_MS };
    }
    return {
      locked: false,
      attemptsRemaining: Math.max(0, MAX_ATTEMPTS - b.failures.length),
    };
  }

  /** Successful auth — clear the per-login bucket so a typo doesn't lock out. */
  clear(key) {
    this.byKey.delete(key);
  }
}

const ipBuckets = new Buckets();
const loginBuckets = new Buckets();

/**
 * Extract client IP from the request. Falls back through common proxy headers
 * (the docker-compose stack runs behind nginx in production). Takes the first
 * IP in X-Forwarded-For (set by the trusted reverse proxy).
 */
function clientIp(req) {
  const xff = req.headers['x-forwarded-for'];
  if (typeof xff === 'string' && xff.length > 0) {
    const first = xff.split(',')[0].trim();
    if (first) return first;
  }
  const realIp = req.headers['x-real-ip'];
  if (typeof realIp === 'string' && realIp.length > 0) return realIp.trim();
  return req.socket?.remoteAddress || req.ip || 'unknown';
}

function isBypassed(ip) {
  if (BYPASS_IPS.has(ip)) return true;
  // Allow loopback bypass only when explicitly requested.
  if (process.env.AUTH_LOGIN_BYPASS_LOOPBACK !== 'true') return false;
  return ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1';
}

/**
 * Express middleware factory — wraps /auth/login (or any auth route).
 * On lockout it returns 429 with a Retry-After header.
 */
function loginRateLimit() {
  return (req, res, next) => {
    const ip = clientIp(req);
    if (isBypassed(ip)) {
      req._rateLimit = { bypassed: true, ip };
      return next();
    }
    const login = req.body?.login || req.body?.pin;
    const loginKey = login ? String(login).toLowerCase() : null;

    const ipCheck = ipBuckets.check(ip);
    if (ipCheck.locked) {
      res.set('Retry-After', String(Math.ceil(ipCheck.retryAfterMs / 1000)));
      return res.status(429).json({
        ok: false,
        error: 'Too many login attempts. Try again later.',
        code: 'rate_limited_ip',
        retryAfterMs: ipCheck.retryAfterMs,
        maxAttempts: MAX_ATTEMPTS,
        lockoutMs: LOCKOUT_MS,
      });
    }
    if (loginKey) {
      const loginCheck = loginBuckets.check(loginKey);
      if (loginCheck.locked) {
        res.set('Retry-After', String(Math.ceil(loginCheck.retryAfterMs / 1000)));
        return res.status(429).json({
          ok: false,
          error: 'This account is temporarily locked due to repeated failed logins.',
          code: 'rate_limited_account',
          retryAfterMs: loginCheck.retryAfterMs,
          maxAttempts: MAX_ATTEMPTS,
          lockoutMs: LOCKOUT_MS,
        });
      }
    }

    req._rateLimit = { ip, loginKey };
    next();
  };
}

/** Hook called after auth attempt resolves. Call with `success` boolean.
 *  Returns rate-limit metadata on failure (for 401 responses). */
function recordAuthResult(req, success) {
  if (!req._rateLimit || req._rateLimit.bypassed) return null;
  const { ip, loginKey } = req._rateLimit;
  if (success) {
    if (loginKey) loginBuckets.clear(loginKey);
    return null;
  }

  const loginResult = loginKey ? loginBuckets.recordFailure(loginKey) : null;
  const ipResult = ipBuckets.recordFailure(ip);

  if (loginResult?.locked || ipResult?.locked) {
    const retryAfterMs = Math.max(loginResult?.retryAfterMs || 0, ipResult?.retryAfterMs || 0);
    return {
      locked: true,
      retryAfterMs,
      maxAttempts: MAX_ATTEMPTS,
      lockoutMs: LOCKOUT_MS,
    };
  }

  const loginRemaining = loginResult?.attemptsRemaining ?? MAX_ATTEMPTS;
  const ipRemaining = ipResult?.attemptsRemaining ?? MAX_ATTEMPTS;
  return {
    locked: false,
    attemptsRemaining: Math.min(loginRemaining, ipRemaining),
    maxAttempts: MAX_ATTEMPTS,
    lockoutMs: LOCKOUT_MS,
  };
}

module.exports = {
  loginRateLimit,
  recordAuthResult,
  clientIp,
  // Test hooks (not used in routes):
  _ipBuckets: ipBuckets,
  _loginBuckets: loginBuckets,
  _config: { MAX_ATTEMPTS, LOCKOUT_MS, WINDOW_MS },
};
