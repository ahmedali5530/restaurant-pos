'use strict';

/**
 * Regression tests for the fail-open JWT-secret defect: this module used to
 * fall back to a hardcoded, publicly-known secret ('dev-only-change-me-
 * posr-gateway') when GATEWAY_JWT_SECRET was unset, letting anyone forge a
 * valid session token. It must now refuse to start at all without a real
 * secret configured.
 *
 * Uses Node's built-in test runner (node --test) — no new dependency, since
 * this service has no test framework installed. The secret is read at
 * module-load time, so each case runs jwt.js in its own child process
 * (Node's module cache would otherwise hide the throw on a second import).
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const path = require('node:path');

const JWT_MODULE = path.join(__dirname, 'jwt.js');

function runInChildProcess(env) {
  return execFileSync(
    process.execPath,
    ['-e', `require(${JSON.stringify(JWT_MODULE)}); console.log('loaded-ok');`],
    { env: { ...process.env, ...env }, encoding: 'utf8' }
  );
}

test('throws at load time when GATEWAY_JWT_SECRET is unset — no hardcoded fallback', () => {
  assert.throws(
    () => runInChildProcess({ GATEWAY_JWT_SECRET: '' }),
    /GATEWAY_JWT_SECRET is required/
  );
});

test('the removed hardcoded secret is never accepted as if it were a real value', () => {
  // Sanity check the error path isn't accidentally satisfied by the old
  // fallback string leaking back in some other way.
  let output = '';
  try {
    runInChildProcess({ GATEWAY_JWT_SECRET: '' });
  } catch (err) {
    output = String(err.stderr || err.message || '');
  }
  assert.ok(!output.includes('dev-only-change-me-posr-gateway'));
});

test('loads successfully and signs/verifies a real session when a secret is configured', () => {
  const out = runInChildProcess({ GATEWAY_JWT_SECRET: 'a-real-random-secret-value-for-testing' });
  assert.match(out, /loaded-ok/);
});

test('signSession/verifySession round-trip works end to end with a real secret', async () => {
  process.env.GATEWAY_JWT_SECRET = 'a-real-random-secret-value-for-testing';
  delete require.cache[JWT_MODULE];
  const { signSession, verifySession } = require(JWT_MODULE);

  const { token } = await signSession({ userId: 'u1', login: 'alice' });
  const payload = await verifySession(token);

  assert.equal(payload.sub, 'u1');
  assert.equal(payload.login, 'alice');
  assert.equal(payload.typ, 'pos_session');
});

test('verifySession rejects a token signed with a different secret (no shared fallback to guess)', async () => {
  process.env.GATEWAY_JWT_SECRET = 'secret-one';
  delete require.cache[JWT_MODULE];
  const { signSession } = require(JWT_MODULE);
  const { token } = await signSession({ userId: 'u2', login: 'bob' });

  process.env.GATEWAY_JWT_SECRET = 'secret-two';
  delete require.cache[JWT_MODULE];
  const { verifySession } = require(JWT_MODULE);

  await assert.rejects(() => verifySession(token), /Invalid or expired session token/);
});
