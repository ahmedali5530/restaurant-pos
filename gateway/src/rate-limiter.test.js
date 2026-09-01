'use strict';

/**
 * Regression tests for the auth-gateway rate limiter.
 *
 * PIN logins use 4-digit codes (10,000 combinations). Without rate limiting,
 * an attacker can brute-force any PIN in a few minutes of automated requests
 * — bcrypt's slow compare slows but does not stop this. The limiter enforces
 * a per-IP and per-login lockout after MAX_ATTEMPTS failures.
 *
 * Run from the gateway directory:
 *   node --test src/rate-limiter.test.js
 */

const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const rl = require('./rate-limiter');

beforeEach(() => {
  rl._ipBuckets.byKey.clear();
  rl._loginBuckets.byKey.clear();
  delete process.env.AUTH_LOGIN_BYPASS_IPS;
  delete process.env.AUTH_LOGIN_BYPASS_LOOPBACK;
});

function fakeReq(ip, login) {
  return {
    body: login ? { login } : {},
    headers: { 'x-forwarded-for': ip },
    socket: { remoteAddress: ip },
  };
}

test('allows up to MAX_ATTEMPTS failures, then locks the NEXT request', () => {
  const { MAX_ATTEMPTS } = rl._config;
  // First MAX_ATTEMPTS requests pass through, each followed by a failure.
  for (let i = 0; i < MAX_ATTEMPTS; i++) {
    const req = fakeReq('203.0.113.1', 'victim');
    const nextCalled = { v: false };
    rl.loginRateLimit()(req, {}, () => { nextCalled.v = true; });
    assert.equal(nextCalled.v, true, `attempt ${i + 1} should be allowed`);
    rl.recordAuthResult(req, false);
  }
  // The (MAX_ATTEMPTS + 1)-th request must be locked — the previous failure
  // crossed the threshold and set lockedUntil.
  const req = fakeReq('203.0.113.1', 'victim');
  let status = null;
  const res = { set: () => {}, status: (s) => { status = s; return { json: () => {} }; } };
  rl.loginRateLimit()(req, res, () => { status = 'passed'; });
  assert.notEqual(status, 'passed', 'request after threshold must NOT pass');
  assert.equal(status, 429, 'must return 429');
});

test('successful login clears the per-login bucket but NOT the per-IP bucket', () => {
  // 3 failures from the same IP against 3 different logins.
  for (const login of ['user1', 'user2', 'user3']) {
    const req = fakeReq('198.51.100.1', login);
    rl.loginRateLimit()(req, {}, () => {});
    rl.recordAuthResult(req, false);
  }
  // Now user1 logs in successfully.
  const okReq = fakeReq('198.51.100.1', 'user1');
  rl.loginRateLimit()(okReq, {}, () => {});
  rl.recordAuthResult(okReq, true);
  // user1 bucket is cleared — a typo later shouldn't lock them immediately.
  const next = fakeReq('198.51.100.1', 'user1');
  let pass = false;
  rl.loginRateLimit()(next, { set: () => {}, status: () => ({ json: () => {} }) }, () => { pass = true; });
  assert.equal(pass, true, 'user1 cleared by successful login');

  // But the IP bucket is NOT cleared — a 4th distinct login from this IP
  // still accrues toward the IP lockout.
  const ipCheck = rl._ipBuckets.check('198.51.100.1');
  assert.ok(ipCheck.attempts >= 3, 'IP bucket retains failures across logins');
});

test('AUTH_LOGIN_BYPASS_IPS skips the limiter for listed IPs', () => {
  process.env.AUTH_LOGIN_BYPASS_IPS = '10.0.0.1,10.0.0.2';
  // Re-require to pick up env — the module reads BYPASS_IPS at load time.
  delete require.cache[require.resolve('./rate-limiter.js')];
  const rl2 = require('./rate-limiter.js');

  for (let i = 0; i < 20; i++) {
    const req = fakeReq('10.0.0.1', 'admin');
    let pass = false;
    rl2.loginRateLimit()(req, { set: () => {}, status: () => ({ json: () => {} }) }, () => { pass = true; });
    assert.equal(pass, true, `bypassed IP attempt ${i + 1} should pass`);
    rl2.recordAuthResult(req, false);
  }
});

test('Retry-After header is set on 429 responses', () => {
  const { MAX_ATTEMPTS } = rl._config;
  for (let i = 0; i < MAX_ATTEMPTS; i++) {
    const req = fakeReq('192.0.2.1', 'admin');
    rl.loginRateLimit()(req, {}, () => {});
    rl.recordAuthResult(req, false);
  }
  const req = fakeReq('192.0.2.1', 'admin');
  const setCalls = [];
  const res = {
    set: (k, v) => setCalls.push([k, v]),
    status: () => ({ json: () => {} }),
  };
  rl.loginRateLimit()(req, res, () => {});
  const retryAfter = setCalls.find(([k]) => k === 'Retry-After');
  assert.ok(retryAfter, 'Retry-After header must be set');
  assert.ok(Number(retryAfter[1]) > 0, 'Retry-After must be positive seconds');
});

test('per-login lockout triggers independently of IP lockout', () => {
  // 5 different IPs attack the same login.
  const { MAX_ATTEMPTS } = rl._config;
  for (let i = 0; i < MAX_ATTEMPTS; i++) {
    const req = fakeReq(`198.18.${i}.1`, 'victim');
    rl.loginRateLimit()(req, {}, () => {});
    rl.recordAuthResult(req, false);
  }
  // The 6th IP should still hit the per-login lockout.
  const req = fakeReq('198.18.99.1', 'victim');
  let status = null;
  rl.loginRateLimit()(req, { set: () => {}, status: (s) => { status = s; return { json: () => {} }; } }, () => { status = 'passed'; });
  assert.equal(status, 429, 'per-login bucket should lock regardless of source IP');
});
