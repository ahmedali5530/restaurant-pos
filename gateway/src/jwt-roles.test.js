'use strict';

/**
 * Regression tests for the JWT roles claim added for SurrealDB RBAC.
 *
 * The gateway now extracts top-level role sections from the hierarchical
 * permission IDs (e.g. 'admin.dishes.create' → 'admin') and includes them
 * as the `roles` array in the JWT payload. SurrealDB makes these available
 * as `$auth.roles` in PERMISSIONS expressions.
 *
 * These tests pin:
 *   - The roles claim is present and is an array
 *   - Hierarchical IDs are reduced to top-level sections
 *   - Empty/null roles produce an empty array (not undefined)
 *   - The roles claim survives a sign→verify round-trip
 *   - Duplicate top-level sections are de-duplicated
 *
 * Run from the gateway directory:
 *   GATEWAY_JWT_SECRET=<secret> node --test src/jwt-roles.test.js
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const path = require('node:path');

const JWT_MODULE = path.join(__dirname, 'jwt.js');

// Each test runs in a child process because jwt.js reads GATEWAY_JWT_SECRET
// at module-load time and throws if unset. We set a fresh secret per test.
function runInChild(script) {
  const secret = 'a'.repeat(48);
  return execFileSync(
    process.execPath,
    ['-e', script],
    {
      env: { ...process.env, GATEWAY_JWT_SECRET: secret },
      encoding: 'utf8',
    }
  );
}

test('signSession includes a roles claim in the JWT payload', () => {
  const output = runInChild(`
    const { signSession, verifySession } = require(${JSON.stringify(JWT_MODULE)});
    (async () => {
      const { token } = await signSession({
        userId: 'user:test1',
        login: 'admin1',
        roles: ['admin', 'admin.dishes', 'admin.dishes.create'],
      });
      const payload = await verifySession(token);
      console.log(JSON.stringify({
        hasRoles: Array.isArray(payload.roles),
        roles: payload.roles,
      }));
    })();
  `);
  const result = JSON.parse(output.trim());
  assert.equal(result.hasRoles, true, 'roles must be an array');
  assert.deepEqual(result.roles, ['admin'], 'hierarchical IDs reduce to top-level');
});

test('hierarchical roles are reduced to top-level sections', () => {
  const output = runInChild(`
    const { signSession, verifySession } = require(${JSON.stringify(JWT_MODULE)});
    (async () => {
      const { token } = await signSession({
        userId: 'user:test2',
        login: 'manager1',
        roles: ['admin.dishes.create', 'admin.dishes.update', 'manager.reports.view', 'hr.payroll.view'],
      });
      const payload = await verifySession(token);
      console.log(JSON.stringify({ roles: payload.roles }));
    })();
  `);
  const result = JSON.parse(output.trim());
  assert.deepEqual(
    result.roles.sort(),
    ['admin', 'hr', 'manager'],
    'must contain the unique set of top-level sections'
  );
});

test('empty roles array produces an empty roles claim', () => {
  const output = runInChild(`
    const { signSession, verifySession } = require(${JSON.stringify(JWT_MODULE)});
    (async () => {
      const { token } = await signSession({
        userId: 'user:test3',
        login: 'guest',
        roles: [],
      });
      const payload = await verifySession(token);
      console.log(JSON.stringify({ roles: payload.roles, isArray: Array.isArray(payload.roles) }));
    })();
  `);
  const result = JSON.parse(output.trim());
  assert.equal(result.isArray, true);
  assert.deepEqual(result.roles, [], 'empty input → empty array');
});

test('null/undefined roles produce an empty array (not null)', () => {
  const output = runInChild(`
    const { signSession, verifySession } = require(${JSON.stringify(JWT_MODULE)});
    (async () => {
      const { token } = await signSession({
        userId: 'user:test4',
        login: 'guest2',
        roles: null,
      });
      const payload = await verifySession(token);
      console.log(JSON.stringify({ roles: payload.roles, isNull: payload.roles === null }));
    })();
  `);
  const result = JSON.parse(output.trim());
  assert.equal(result.isNull, false, 'roles must not be null');
  assert.deepEqual(result.roles, []);
});

test('duplicate top-level sections are de-duplicated', () => {
  const output = runInChild(`
    const { signSession, verifySession } = require(${JSON.stringify(JWT_MODULE)});
    (async () => {
      const { token } = await signSession({
        userId: 'user:test5',
        login: 'dup1',
        roles: ['admin.create', 'admin.update', 'admin.delete', 'admin.read'],
      });
      const payload = await verifySession(token);
      console.log(JSON.stringify({ roles: payload.roles, count: payload.roles.length }));
    })();
  `);
  const result = JSON.parse(output.trim());
  assert.equal(result.count, 1, 'four admin.* roles → one admin');
  assert.deepEqual(result.roles, ['admin']);
});

test('super_admin wildcard role is preserved', () => {
  const output = runInChild(`
    const { signSession, verifySession } = require(${JSON.stringify(JWT_MODULE)});
    (async () => {
      const { token } = await signSession({
        userId: 'user:test6',
        login: 'superadmin',
        roles: ['*', 'admin', 'admin.dishes.create'],
      });
      const payload = await verifySession(token);
      console.log(JSON.stringify({ roles: payload.roles }));
    })();
  `);
  const result = JSON.parse(output.trim());
  assert.ok(result.roles.includes('*'), 'wildcard role must be preserved');
  assert.ok(result.roles.includes('admin'), 'admin must also be present');
});

test('roles claim survives a sign→verify round-trip intact', () => {
  const output = runInChild(`
    const { signSession, verifySession } = require(${JSON.stringify(JWT_MODULE)});
    (async () => {
      const inputRoles = ['admin', 'hr', 'accountant', 'inventory', 'waiter', 'kitchen', 'delivery', 'cashier'];
      const { token, roles: extractedRoles } = await signSession({
        userId: 'user:test7',
        login: 'allroles',
        roles: inputRoles,
      });
      const payload = await verifySession(token);
      console.log(JSON.stringify({
        extractedRoles,
        payloadRoles: payload.roles,
        match: JSON.stringify(extractedRoles) === JSON.stringify(payload.roles),
      }));
    })();
  `);
  const result = JSON.parse(output.trim());
  assert.equal(result.match, true, 'extracted roles must match the payload roles');
  assert.equal(result.payloadRoles.length, 8, 'all 8 roles preserved');
});
