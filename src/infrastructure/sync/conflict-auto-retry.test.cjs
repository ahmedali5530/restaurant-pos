/**
 * Pure Node test — no Vitest/Vite collect. Run with:
 *   node --test src/infrastructure/sync/conflict-auto-retry.test.cjs
 */
const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const AUTO_RETRY_MAX_ATTEMPTS = 5;
const AUTO_RETRY_COOLDOWNS_MS = [15_000, 30_000, 60_000, 120_000, 300_000];
const conflictAutoRetry = new Map();

function eligible(operationId, now = Date.now()) {
  const state = conflictAutoRetry.get(operationId);
  if (!state) return true;
  if (state.attempts >= AUTO_RETRY_MAX_ATTEMPTS) return false;
  return now >= state.nextAt;
}

function note(operationId, now = Date.now()) {
  const prev = conflictAutoRetry.get(operationId);
  const attempts = (prev?.attempts ?? 0) + 1;
  const cooldown =
    AUTO_RETRY_COOLDOWNS_MS[Math.min(attempts - 1, AUTO_RETRY_COOLDOWNS_MS.length - 1)] ??
    300_000;
  conflictAutoRetry.set(operationId, { attempts, nextAt: now + cooldown });
}

function clear(operationId) {
  conflictAutoRetry.delete(operationId);
}

beforeEach(() => {
  conflictAutoRetry.clear();
});

test('allows the first attempt immediately', () => {
  assert.equal(eligible('op-1', 1_000), true);
});

test('blocks until cooldown elapses, then allows again', () => {
  const t0 = 10_000;
  note('op-1', t0);
  assert.equal(eligible('op-1', t0 + 1_000), false);
  assert.equal(eligible('op-1', t0 + AUTO_RETRY_COOLDOWNS_MS[0]), true);
});

test('stops after max auto attempts', () => {
  const t0 = 0;
  for (let i = 0; i < AUTO_RETRY_MAX_ATTEMPTS; i += 1) {
    assert.equal(eligible('op-1', t0 + i * 1_000_000), true);
    note('op-1', t0 + i * 1_000_000);
  }
  assert.equal(eligible('op-1', t0 + AUTO_RETRY_MAX_ATTEMPTS * 1_000_000), false);
});

test('clear resets eligibility for Sync all / manual retry', () => {
  note('op-1', 0);
  clear('op-1');
  assert.equal(eligible('op-1', 1), true);
});
