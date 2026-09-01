'use strict';

/**
 * Business-logic tests for the sync-service SyncManager.
 *
 * Previously the sync-service had ZERO tests — the only service in the stack
 * with no coverage at all. These tests pin the critical helper functions
 * that protect data integrity during multi-branch replication:
 *
 *   - toAnyRecordId: converts various input formats to RecordId (handles
 *     strings, objects, RecordId instances, nulls, malformed values)
 *   - collectArrayLinkedRecordIds: finds record links in array fields
 *     (used to materialize child rows like order.items -> order_item)
 *   - normalizePayloadLinks: ensures link fields stay proper RecordId
 *     values in CONTENT payloads (prevents string corruption during upsert)
 *   - isRetryableError: determines which errors are retried (transaction
 *     conflicts yes, hard timeouts no — they mean the socket is wedged)
 *   - withRetry: exponential backoff with timeout, excludes non-retryable
 *     errors immediately
 *   - buildContentPayload: strips id from payload before upsert
 *
 * Run from the sync-service directory:
 *   node --test src/sync-manager.business.test.cjs
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { RecordId, StringRecordId } = require('surrealdb');

const {
  toAnyRecordId,
  collectArrayLinkedRecordIds,
  normalizePayloadLinks,
} = require('./sync-manager.js');

// ---------------------------------------------------------------------------
// toAnyRecordId — the most critical function (validates + converts record IDs)
// ---------------------------------------------------------------------------

test('toAnyRecordId accepts a valid record ID string', () => {
  const result = toAnyRecordId('order:abc123');
  assert.ok(result, 'should return a non-null value for a valid record ID string');
  assert.equal(String(result), 'order:abc123');
});

test('toAnyRecordId accepts a RecordId instance', () => {
  const rid = new RecordId('order', 'abc');
  const result = toAnyRecordId(rid);
  assert.ok(result);
  assert.equal(result, rid);
});

test('toAnyRecordId accepts a StringRecordId instance', () => {
  const sid = new StringRecordId('order:xyz');
  const result = toAnyRecordId(sid);
  assert.ok(result);
});

test('toAnyRecordId accepts an object with tb + id', () => {
  const result = toAnyRecordId({ tb: 'order', id: 'abc' });
  assert.ok(result);
  assert.equal(String(result), 'order:abc');
});

test('toAnyRecordId rejects a plain string that is not a record ID (e.g. "Normal")', () => {
  const result = toAnyRecordId('Normal');
  assert.equal(result, null);
});

test('toAnyRecordId rejects null and undefined', () => {
  assert.equal(toAnyRecordId(null), null);
  assert.equal(toAnyRecordId(undefined), null);
});

test('toAnyRecordId rejects empty string', () => {
  assert.equal(toAnyRecordId(''), null);
});

test('toAnyRecordId rejects numbers', () => {
  assert.equal(toAnyRecordId(42), null);
  assert.equal(toAnyRecordId(0), null);
});

test('toAnyRecordId rejects an object with extra fields (not a plain link)', () => {
  const result = toAnyRecordId({ tb: 'order', id: 'abc', extra: 'field' });
  assert.equal(result, null);
});

test('toAnyRecordId rejects an object without tb/id', () => {
  assert.equal(toAnyRecordId({ name: 'test' }), null);
  assert.equal(toAnyRecordId({ foo: 'bar' }), null);
});

test('toAnyRecordId trims whitespace from string record IDs', () => {
  const result = toAnyRecordId('  order:abc  ');
  assert.ok(result);
  assert.equal(String(result), 'order:abc');
});

test('toAnyRecordId accepts record ID with numeric table prefix', () => {
  // Underscore prefix is valid
  const result = toAnyRecordId('_table:abc');
  assert.ok(result);
});

test('toAnyRecordId accepts record ID with hyphen in the id part', () => {
  const result = toAnyRecordId('order:abc-def-123');
  assert.ok(result);
});

test('toAnyRecordId rejects record ID with space in the id part', () => {
  const result = toAnyRecordId('order:abc def');
  assert.equal(result, null);
});

// ---------------------------------------------------------------------------
// collectArrayLinkedRecordIds — finds child record references in arrays
// ---------------------------------------------------------------------------

test('collectArrayLinkedRecordIds finds record links in array fields', () => {
  const record = {
    id: 'order:1',
    items: ['order_item:1', 'order_item:2'],
  };
  const links = collectArrayLinkedRecordIds(record);
  assert.equal(links.length, 2);
  assert.equal(String(links[0]), 'order_item:1');
  assert.equal(String(links[1]), 'order_item:2');
});

test('collectArrayLinkedRecordIds skips non-array fields', () => {
  const record = {
    id: 'order:1',
    status: 'paid',
    total: 1000,
    customer: 'customer:abc', // not an array — should be skipped
  };
  const links = collectArrayLinkedRecordIds(record);
  assert.equal(links.length, 0);
});

test('collectArrayLinkedRecordIds skips non-link items in arrays', () => {
  const record = {
    id: 'order:1',
    tags: ['Normal', 'VIP', 'order_item:1'],
  };
  const links = collectArrayLinkedRecordIds(record);
  assert.equal(links.length, 1);
  assert.equal(String(links[0]), 'order_item:1');
});

test('collectArrayLinkedRecordIds skips the id field', () => {
  const record = {
    id: 'order:1',
    items: ['order_item:1'],
  };
  const links = collectArrayLinkedRecordIds(record);
  // 'id' is excluded even if it looks like an array
  assert.equal(links.length, 1); // only from items, not from id
});

test('collectArrayLinkedRecordIds handles empty arrays', () => {
  const record = { id: 'order:1', items: [] };
  const links = collectArrayLinkedRecordIds(record);
  assert.equal(links.length, 0);
});

test('collectArrayLinkedRecordIds handles null/undefined records', () => {
  assert.equal(collectArrayLinkedRecordIds(null).length, 0);
  assert.equal(collectArrayLinkedRecordIds(undefined).length, 0);
  assert.equal(collectArrayLinkedRecordIds('string').length, 0);
});

test('collectArrayLinkedRecordIds handles multiple array fields', () => {
  const record = {
    id: 'order:1',
    items: ['order_item:1'],
    taxes: ['tax:vat', 'tax:service'],
    payments: ['order_payment:1'],
  };
  const links = collectArrayLinkedRecordIds(record);
  assert.equal(links.length, 4);
});

// ---------------------------------------------------------------------------
// normalizePayloadLinks — ensures links are proper RecordId before upsert
// ---------------------------------------------------------------------------

test('normalizePayloadLinks converts string links to RecordId', () => {
  const payload = { customer: 'customer:abc', total: 100 };
  const result = normalizePayloadLinks(payload);
  assert.ok(result.customer);
  assert.equal(String(result.customer), 'customer:abc');
  assert.equal(result.total, 100); // non-link fields untouched
});

test('normalizePayloadLinks converts array of string links to RecordIds', () => {
  const payload = { items: ['order_item:1', 'order_item:2'] };
  const result = normalizePayloadLinks(payload);
  assert.equal(result.items.length, 2);
  assert.equal(String(result.items[0]), 'order_item:1');
  assert.equal(String(result.items[1]), 'order_item:2');
});

test('normalizePayloadLinks preserves non-link values in arrays', () => {
  const payload = { tags: ['Normal', 'VIP'], items: ['order_item:1'] };
  const result = normalizePayloadLinks(payload);
  assert.equal(result.tags[0], 'Normal');
  assert.equal(result.tags[1], 'VIP');
  assert.equal(String(result.items[0]), 'order_item:1');
});

test('normalizePayloadLinks skips the id field', () => {
  const payload = { id: 'order:1', customer: 'customer:abc' };
  const result = normalizePayloadLinks(payload);
  assert.equal(result.id, 'order:1'); // unchanged
  assert.ok(result.customer); // converted
});

test('normalizePayloadLinks handles null/undefined payloads', () => {
  assert.deepEqual(normalizePayloadLinks(null), {});
  assert.deepEqual(normalizePayloadLinks(undefined), {});
});

test('normalizePayloadLinks does not modify the original payload (immutability)', () => {
  const original = { customer: 'customer:abc' };
  const result = normalizePayloadLinks(original);
  assert.equal(original.customer, 'customer:abc'); // unchanged
  assert.equal(String(result.customer), 'customer:abc'); // converted
});

test('normalizePayloadLinks handles arrays with no links', () => {
  const payload = { tags: ['a', 'b', 'c'] };
  const result = normalizePayloadLinks(payload);
  assert.deepEqual(result.tags, ['a', 'b', 'c']);
});

test('normalizePayloadLinks handles empty object', () => {
  const result = normalizePayloadLinks({});
  assert.deepEqual(result, {});
});

// ---------------------------------------------------------------------------
// isRecordLink — indirect test via collectArrayLinkedRecordIds
// ---------------------------------------------------------------------------

test('isRecordLink identifies record ID strings', () => {
  // isRecordLink is not exported, but collectArrayLinkedRecordIds uses it.
  // If it works, collectArrayLinkedRecordIds will find the link.
  const links = collectArrayLinkedRecordIds({ items: ['order_item:1'] });
  assert.equal(links.length, 1);
});

test('isRecordLink rejects plain strings (e.g. status values)', () => {
  const links = collectArrayLinkedRecordIds({ items: ['Normal', 'paid', 'order_item:1'] });
  assert.equal(links.length, 1);
  assert.equal(String(links[0]), 'order_item:1');
});

// ---------------------------------------------------------------------------
// isRetryableError — determines which errors are retried
// ---------------------------------------------------------------------------

const { isRetryableError, withRetry, buildContentPayload } = require('./sync-manager.js');

test('isRetryableError returns true for transaction conflicts', () => {
  assert.equal(isRetryableError(new Error('Transaction conflict')), true);
});

test('isRetryableError returns true for network errors', () => {
  assert.equal(isRetryableError(new Error('Network error: connection reset')), true);
});

test('isRetryableError returns true for websocket errors', () => {
  assert.equal(isRetryableError(new Error('WebSocket connection closed')), true);
});

test('isRetryableError returns true for "temporary" errors', () => {
  assert.equal(isRetryableError(new Error('Temporary failure')), true);
});

test('isRetryableError returns true for "retry" hint errors', () => {
  assert.equal(isRetryableError(new Error('Please retry the operation')), true);
});

test('isRetryableError returns FALSE for hard timeouts (socket wedged)', () => {
  assert.equal(isRetryableError(new Error('master.upsert(order:1) timed out after 20000ms')), false);
});

test('isRetryableError returns false for non-retryable errors', () => {
  assert.equal(isRetryableError(new Error('Permission denied')), false);
  assert.equal(isRetryableError(new Error('Record not found')), false);
  assert.equal(isRetryableError(new Error('Validation failed')), false);
});

test('isRetryableError handles string errors (not Error objects)', () => {
  assert.equal(isRetryableError('transaction conflict'), true);
  assert.equal(isRetryableError('timed out after 5000ms'), false);
});

test('isRetryableError handles null/undefined', () => {
  assert.equal(isRetryableError(null), false);
  assert.equal(isRetryableError(undefined), false);
});

// ---------------------------------------------------------------------------
// withRetry — retry with exponential backoff
// ---------------------------------------------------------------------------

test('withRetry returns the result on first success', async () => {
  let calls = 0;
  const result = await withRetry(async () => {
    calls++;
    return 'success';
  }, { retries: 3, delayMs: 1, timeoutMs: 1000 });
  assert.equal(result, 'success');
  assert.equal(calls, 1);
});

test('withRetry retries on retryable errors and succeeds on attempt 2', async () => {
  let calls = 0;
  const result = await withRetry(async () => {
    calls++;
    if (calls === 1) throw new Error('Transaction conflict');
    return 'success-on-retry';
  }, { retries: 3, delayMs: 1, timeoutMs: 1000 });
  assert.equal(result, 'success-on-retry');
  assert.equal(calls, 2);
});

test('withRetry does NOT retry on non-retryable errors', async () => {
  let calls = 0;
  await assert.rejects(
    withRetry(async () => {
      calls++;
      throw new Error('Permission denied');
    }, { retries: 3, delayMs: 1, timeoutMs: 1000 }),
    /Permission denied/
  );
  assert.equal(calls, 1, 'should not retry non-retryable errors');
});

test('withRetry does NOT retry on hard timeouts', async () => {
  let calls = 0;
  await assert.rejects(
    withRetry(async () => {
      calls++;
      throw new Error('operation timed out after 5000ms');
    }, { retries: 3, delayMs: 1, timeoutMs: 1000 }),
    /timed out/
  );
  assert.equal(calls, 1, 'should not retry hard timeouts');
});

test('withRetry exhausts retries on persistent retryable errors', async () => {
  let calls = 0;
  await assert.rejects(
    withRetry(async () => {
      calls++;
      throw new Error('Network error');
    }, { retries: 3, delayMs: 1, timeoutMs: 1000 }),
    /Network error/
  );
  assert.equal(calls, 3, 'should retry 3 times then give up');
});

// ---------------------------------------------------------------------------
// buildContentPayload — strips id + normalizes links before upsert
// ---------------------------------------------------------------------------

test('buildContentPayload strips the id field from the payload', () => {
  const result = buildContentPayload({ id: 'order:1', total: 100, status: 'paid' }, 'client-001');
  assert.equal(result.id, undefined);
  assert.equal(result.total, 100);
  assert.equal(result.status, 'paid');
});

test('buildContentPayload normalizes link fields', () => {
  const result = buildContentPayload({
    id: 'order:1',
    customer: 'customer:abc',
    items: ['order_item:1', 'order_item:2'],
  }, 'client-001');
  assert.equal(result.id, undefined);
  assert.ok(result.customer);
  assert.equal(String(result.customer), 'customer:abc');
  assert.equal(result.items.length, 2);
});

test('buildContentPayload handles null/undefined values', () => {
  const result = buildContentPayload(null, 'client-001');
  assert.deepEqual(result, {});
  const result2 = buildContentPayload(undefined, 'client-001');
  assert.deepEqual(result2, {});
});

test('buildContentPayload handles empty object', () => {
  const result = buildContentPayload({}, 'client-001');
  assert.deepEqual(result, {});
});
