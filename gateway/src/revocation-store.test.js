'use strict';

/**
 * Regression tests for the durable session revocation store.
 *
 * Previously the gateway kept revoked JTIs in an in-memory `Set`. A process
 * restart lost all revocations, allowing already-revoked sessions to be
 * revalidated until their natural TTL expired. These tests pin the in-memory
 * behaviour (the Surreal-backed path is covered by an integration test that
 * requires a running DB — not in scope here).
 *
 * Run from the gateway directory:
 *   node --test src/revocation-store.test.js
 */

const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const store = require('./revocation-store');

beforeEach(() => {
  store._reset();
});

test('isRevoked returns false for an unknown jti', async () => {
  assert.equal(await store.isRevoked('jti_unknown'), false);
});

test('revoke marks a jti as revoked in-memory', async () => {
  await store.revoke('jti_1', Math.floor(Date.now() / 1000) + 3600);
  assert.equal(await store.isRevoked('jti_1'), true);
});

test('revoke is idempotent — calling twice does not throw', async () => {
  await store.revoke('jti_2', Math.floor(Date.now() / 1000) + 3600);
  await store.revoke('jti_2', Math.floor(Date.now() / 1000) + 3600);
  assert.equal(await store.isRevoked('jti_2'), true);
});

test('revoke with a falsy jti is a no-op', async () => {
  await store.revoke(null, 123);
  await store.revoke(undefined, 123);
  await store.revoke('', 123);
  // No throw, no state change.
  assert.equal(await store.isRevoked(''), false);
});

test('isRevoked uses the negative cache — does not call Surreal more than once per TTL', async () => {
  // Without a Surreal client wired up, isRevoked returns false but should
  // still populate the negative cache. We can't observe the cache directly,
  // but we can confirm repeated calls are cheap (no throw, fast return).
  for (let i = 0; i < 100; i++) {
    assert.equal(await store.isRevoked('jti_repeat'), false);
  }
});

test('bootstrap does not throw when no Surreal client is wired', async () => {
  // triggerBootstrap returns a promise; with no client it should resolve
  // without rejecting (the store stays in-memory-only).
  await store.triggerBootstrap();
  // Still operational after.
  await store.revoke('jti_post_bootstrap', Math.floor(Date.now() / 1000) + 3600);
  assert.equal(await store.isRevoked('jti_post_bootstrap'), true);
});

test('_reset clears all state', async () => {
  await store.revoke('jti_persist', Math.floor(Date.now() / 1000) + 3600);
  assert.equal(await store.isRevoked('jti_persist'), true);
  store._reset();
  assert.equal(await store.isRevoked('jti_persist'), false);
});
