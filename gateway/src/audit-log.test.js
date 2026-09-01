'use strict';

/**
 * Regression tests for the gateway audit logger.
 *
 * Pins the public API (setSurrealClient, log, logPermissionDenied,
 * logLoginSuccess, logLoginFailure, logSessionRevoked) and verifies
 * best-effort behaviour: never throws, degrades gracefully when no Surreal
 * client is wired, and produces the expected payload shape.
 *
 * Run from the gateway directory:
 *   node --test src/audit-log.test.js
 */

const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

// Load the audit-log module fresh per test to reset state.
function freshModule() {
  delete require.cache[require.resolve('./audit-log.js')];
  return require('./audit-log.js');
}

beforeEach(() => {
  delete require.cache[require.resolve('./audit-log.js')];
});

afterEach(() => {
  delete require.cache[require.resolve('./audit-log.js')];
});

test('module exports the expected public API', () => {
  const m = freshModule();
  assert.equal(typeof m.setSurrealClient, 'function');
  assert.equal(typeof m.log, 'function');
  assert.equal(typeof m.logPermissionDenied, 'function');
  assert.equal(typeof m.logLoginSuccess, 'function');
  assert.equal(typeof m.logLoginFailure, 'function');
  assert.equal(typeof m.logSessionRevoked, 'function');
  assert.equal(m._TABLE, 'audit_log');
});

test('log() without a Surreal client does not throw (best-effort)', async () => {
  const m = freshModule();
  // No setSurrealClient() called — should log to stderr and return.
  await m.log({
    action: 'login_failure',
    actor_login: 'testuser',
    details: { ip: '1.2.3.4' },
  });
  // No throw = pass.
});

test('log() without action logs a warning and returns', async () => {
  const m = freshModule();
  await m.log({ actor_login: 'test' }); // no action
  // No throw = pass.
});

test('log() with a Surreal client calls client.query with the right shape', async () => {
  let capturedQuery = null;
  let capturedArgs = null;
  const fakeClient = {
    query: async (q, args) => {
      capturedQuery = q;
      capturedArgs = args;
    },
  };
  const m = freshModule();
  m.setSurrealClient(fakeClient);
  await m.log({
    action: 'login_success',
    actor_id: 'user:abc',
    actor_login: 'admin',
    actor_roles: ['admin'],
    source: 'test',
  });
  assert.ok(capturedQuery.includes('CREATE audit_log'));
  assert.ok(capturedArgs.data);
  assert.equal(capturedArgs.data.action, 'login_success');
  assert.equal(capturedArgs.data.actor_id, 'user:abc');
  assert.equal(capturedArgs.data.actor_login, 'admin');
  assert.deepEqual(capturedArgs.data.actor_roles, ['admin']);
  assert.equal(capturedArgs.data.source, 'test');
  assert.ok(capturedArgs.data.occurred_at); // ISO timestamp
});

test('log() never throws even if Surreal query fails', async () => {
  const fakeClient = {
    query: async () => {
      throw new Error('SurrealDB connection refused');
    },
  };
  const m = freshModule();
  m.setSurrealClient(fakeClient);
  // Should log error to stderr but NOT throw.
  await m.log({ action: 'login_failure', actor_login: 'test' });
});

test('logLoginSuccess produces the right payload', async () => {
  let captured = null;
  const fakeClient = {
    query: async (q, args) => { captured = args.data; },
  };
  const m = freshModule();
  m.setSurrealClient(fakeClient);
  await m.logLoginSuccess('user:123', 'manager1', ['manager'], '10.0.0.1');
  assert.equal(captured.action, 'login_success');
  assert.equal(captured.actor_id, 'user:123');
  assert.equal(captured.actor_login, 'manager1');
  assert.deepEqual(captured.actor_roles, ['manager']);
  assert.equal(captured.source, 'gateway-auth-routes');
  assert.equal(captured.details.ip, '10.0.0.1');
});

test('logLoginFailure produces the right payload', async () => {
  let captured = null;
  const fakeClient = {
    query: async (q, args) => { captured = args.data; },
  };
  const m = freshModule();
  m.setSurrealClient(fakeClient);
  await m.logLoginFailure('testuser', '1.2.3.4', 'invalid_credentials');
  assert.equal(captured.action, 'login_failure');
  assert.equal(captured.actor_login, 'testuser');
  assert.equal(captured.actor_id, null); // unknown user
  assert.equal(captured.details.ip, '1.2.3.4');
  assert.equal(captured.details.reason, 'invalid_credentials');
});

test('logSessionRevoked produces the right payload', async () => {
  let captured = null;
  const fakeClient = {
    query: async (q, args) => { captured = args.data; },
  };
  const m = freshModule();
  m.setSurrealClient(fakeClient);
  await m.logSessionRevoked('jti-abc-123', 'user:456', 'waiter1');
  assert.equal(captured.action, 'session_revoked');
  assert.equal(captured.actor_id, 'user:456');
  assert.equal(captured.actor_login, 'waiter1');
  assert.equal(captured.details.jti, 'jti-abc-123');
  assert.equal(captured.source, 'gateway-jwt');
});

test('logPermissionDenied extracts actor from JWT payload (without verifying)', async () => {
  let captured = null;
  const fakeClient = {
    query: async (q, args) => { captured = args.data; },
  };
  const m = freshModule();
  m.setSurrealClient(fakeClient);

  // Forge a JWT-like token with a payload we can decode.
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({
    sub: 'user:suspicious',
    login: 'cashier1',
    roles: ['cashier'],
    typ: 'pos_session',
  })).toString('base64url');
  const fakeJwt = `${header}.${payload}.invalid-signature`;

  const fakeReq = {
    method: 'GET',
    path: '/api/sensitive',
    headers: { authorization: `Bearer ${fakeJwt}`, 'user-agent': 'curl/8.0' },
    socket: { remoteAddress: '203.0.113.99' },
    get(name) { return this.headers[name.toLowerCase()]; },
  };

  await m.logPermissionDenied(fakeReq, 403, 'Permission denied for payroll_run');
  assert.equal(captured.action, 'permission_denied');
  assert.equal(captured.actor_id, 'user:suspicious');
  assert.equal(captured.actor_login, 'cashier1');
  assert.deepEqual(captured.actor_roles, ['cashier']);
  assert.equal(captured.details.method, 'GET');
  assert.equal(captured.details.path, '/api/sensitive');
  assert.equal(captured.details.status, 403);
  assert.equal(captured.details.ip, '203.0.113.99');
  assert.equal(captured.source, 'gateway-session-auth');
});

test('logPermissionDenied handles invalid/malformed tokens gracefully', async () => {
  let captured = null;
  const fakeClient = {
    query: async (q, args) => { captured = args.data; },
  };
  const m = freshModule();
  m.setSurrealClient(fakeClient);

  const fakeReq = {
    method: 'POST',
    path: '/auth/login',
    headers: { authorization: 'Bearer not-a-valid-jwt' },
    socket: { remoteAddress: '198.51.100.1' },
    get(name) { return this.headers[name.toLowerCase()]; },
  };

  await m.logPermissionDenied(fakeReq, 401, 'Invalid token');
  assert.equal(captured.action, 'permission_denied');
  assert.equal(captured.actor_id, null); // couldn't decode
  assert.equal(captured.actor_login, null);
  assert.equal(captured.details.status, 401);
  assert.equal(captured.details.ip, '198.51.100.1');
});

test('logPermissionDenied handles request with no token at all', async () => {
  let captured = null;
  const fakeClient = {
    query: async (q, args) => { captured = args.data; },
  };
  const m = freshModule();
  m.setSurrealClient(fakeClient);

  const fakeReq = {
    method: 'GET',
    path: '/protected',
    headers: {},
    socket: { remoteAddress: '192.0.2.1' },
    get(name) { return this.headers[name.toLowerCase()]; },
  };

  await m.logPermissionDenied(fakeReq, 401, 'No bearer token');
  assert.equal(captured.action, 'permission_denied');
  assert.equal(captured.actor_id, null);
  assert.equal(captured.details.error, 'No bearer token');
});
