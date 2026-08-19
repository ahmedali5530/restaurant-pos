'use strict';

/**
 * Regression tests for two bugs in this file (this is the copy actually
 * required by payments/server.js — see also the identical copies in api,
 * printing, and tracking-api, each tested the same way):
 *
 * 1. createCorsOriginDelegate() used to treat an empty/unset allow-list as
 *    "allow every origin" — a code-level fail-open bug independent of any
 *    env-var default. It must now deny cross-origin requests unless the
 *    origin is explicitly listed, or the operator explicitly opted into '*'.
 * 2. authRequired()/createSessionAuthMiddleware() must actually reject
 *    unauthenticated/invalid requests once a secret is configured.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');

// This module reads process.env at *call* time (each request), not just at
// require() time, so the env must stay set for the whole duration of the
// callback — not just while requiring the module.
async function withEnv(env, fn) {
  const keys = Object.keys(env);
  const previous = {};
  for (const key of keys) previous[key] = process.env[key];
  Object.assign(process.env, env);
  try {
    return await fn();
  } finally {
    for (const key of keys) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
}

function loadFresh() {
  const modulePath = require.resolve('./session-auth.middleware.js');
  delete require.cache[modulePath];
  return require(modulePath);
}

function callOrigin(delegate, origin) {
  return new Promise((resolve, reject) => {
    delegate(origin, (err, allowed) => (err ? reject(err) : resolve(allowed)));
  });
}

test('CORS: empty/unset allow-list denies a cross-origin request (no implicit allow-all)', async () => {
  await withEnv(
    { GATEWAY_ALLOWED_ORIGINS: '', PAYMENT_ALLOWED_ORIGINS: '', ALLOWED_ORIGINS: '' },
    async () => {
      const { createCorsOriginDelegate } = loadFresh();
      const delegate = createCorsOriginDelegate();
      assert.equal(await callOrigin(delegate, 'https://evil.example.com'), false);
    }
  );
});

test('CORS: a request with no Origin header (same-origin/non-browser) is always allowed', async () => {
  await withEnv({ GATEWAY_ALLOWED_ORIGINS: '' }, async () => {
    const { createCorsOriginDelegate } = loadFresh();
    const delegate = createCorsOriginDelegate();
    assert.equal(await callOrigin(delegate, undefined), true);
  });
});

test('CORS: an explicitly listed origin is allowed, others are not', async () => {
  await withEnv({ GATEWAY_ALLOWED_ORIGINS: 'http://localhost:5173' }, async () => {
    const { createCorsOriginDelegate } = loadFresh();
    const delegate = createCorsOriginDelegate();
    assert.equal(await callOrigin(delegate, 'http://localhost:5173'), true);
    assert.equal(await callOrigin(delegate, 'https://evil.example.com'), false);
  });
});

test('CORS: an explicit "*" is still honored as a deliberate operator choice', async () => {
  await withEnv({ GATEWAY_ALLOWED_ORIGINS: '*' }, async () => {
    const { createCorsOriginDelegate } = loadFresh();
    const delegate = createCorsOriginDelegate();
    assert.equal(await callOrigin(delegate, 'https://anything.example.com'), true);
  });
});

test('authRequired: defaults to true once a JWT secret is configured', () => {
  withEnv({ GATEWAY_AUTH_REQUIRED: '', GATEWAY_JWT_SECRET: 'a-real-secret' }, () => {
    const { authRequired } = loadFresh();
    assert.equal(authRequired(), true);
  });
});

test('authRequired: false only when no secret exists at all (misconfigured, not silently open by choice)', () => {
  withEnv(
    { GATEWAY_AUTH_REQUIRED: '', GATEWAY_JWT_SECRET: '', POS_SESSION_SECRET: '' },
    () => {
      const { authRequired } = loadFresh();
      assert.equal(authRequired(), false);
    }
  );
});

test('session middleware: rejects a request with no bearer token when auth is required', async () => {
  await withEnv(
    { GATEWAY_AUTH_REQUIRED: 'true', GATEWAY_JWT_SECRET: 'a-real-secret' },
    async () => {
      const { createSessionAuthMiddleware } = loadFresh();
      const middleware = createSessionAuthMiddleware();

      const req = { headers: {}, get: () => undefined, query: {} };
      let statusCode = null;
      const res = {
        status(code) {
          statusCode = code;
          return this;
        },
        json() {
          return this;
        },
      };
      let nextCalled = false;

      await middleware(req, res, () => {
        nextCalled = true;
      });

      assert.equal(nextCalled, false);
      assert.equal(statusCode, 401);
    }
  );
});

test('session middleware: rejects an invalid/forged bearer token', async () => {
  await withEnv(
    { GATEWAY_AUTH_REQUIRED: 'true', GATEWAY_JWT_SECRET: 'a-real-secret' },
    async () => {
      const { createSessionAuthMiddleware } = loadFresh();
      const middleware = createSessionAuthMiddleware();

      const req = {
        headers: { authorization: 'Bearer not-a-real-token' },
        get(name) {
          return this.headers[name.toLowerCase()];
        },
        query: {},
      };
      let statusCode = null;
      const res = {
        status(code) {
          statusCode = code;
          return this;
        },
        json() {
          return this;
        },
      };
      let nextCalled = false;

      await middleware(req, res, () => {
        nextCalled = true;
      });

      assert.equal(nextCalled, false);
      assert.equal(statusCode, 401);
    }
  );
});

test('session middleware: accepts a valid token signed with the same secret', async () => {
  await withEnv(
    { GATEWAY_AUTH_REQUIRED: 'true', GATEWAY_JWT_SECRET: 'a-real-secret' },
    async () => {
      const { SignJWT } = require('jose');
      const crypto = require('crypto');
      const key = crypto.createSecretKey(Buffer.from('a-real-secret', 'utf8'));
      const token = await new SignJWT({ sub: 'u1', typ: 'pos_session' })
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuedAt()
        .setExpirationTime('1h')
        .setIssuer('posr-gateway')
        .sign(key);

      const { createSessionAuthMiddleware } = loadFresh();
      const middleware = createSessionAuthMiddleware();

      const req = {
        headers: { authorization: `Bearer ${token}` },
        get(name) {
          return this.headers[name.toLowerCase()];
        },
        query: {},
      };
      const res = {
        status() {
          return this;
        },
        json() {
          return this;
        },
      };
      let nextCalled = false;

      await middleware(req, res, () => {
        nextCalled = true;
      });

      assert.equal(nextCalled, true);
      assert.equal(req.posSession.sub, 'u1');
    }
  );
});
