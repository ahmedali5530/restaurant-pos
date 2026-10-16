'use strict';

/**
 * Pure helpers for local-to-cloud changefeed sync.
 * Kept free of Surreal clients so Node's test runner can exercise them.
 */

function isRetryableError(error) {
  const message = error && error.message ? String(error.message) : String(error || '');
  // Timeouts are retryable for the durable queue — the change stays at the cursor.
  if (/timed out after/i.test(message)) return true;
  if (/outside.*(retention|changefeed|feed)/i.test(message)) return false;
  if (/not found|undefined table|no such table/i.test(message)) return false;
  if (/must be connected|not connected|connection (closed|lost|reset)|socket|unavailable|ECONN|ETIMEDOUT|ENOTFOUND|EAI_AGAIN/i
    .test(message)) {
    return true;
  }
  return /transaction|conflict|retry|temporar|network|websocket|503|502|504/i.test(message);
}

function isChangefeedRetentionError(error) {
  const message = error && error.message ? String(error.message) : String(error || '');
  if (/Parse error/i.test(message)) return false;
  return /outside.*(retention|changefeed|feed)|changefeed.*(expired|missing)|versionstamp.*(too old|expired)/i
    .test(message);
}

/** Literal safe for SHOW CHANGES SINCE — params are not accepted by the parser. */
function sinceLiteral(value) {
  if (value == null) return '0';
  if (typeof value === 'bigint') return value.toString();
  if (typeof value === 'number' && Number.isFinite(value)) return String(Math.trunc(value));
  const asString = String(value).replace(/n$/i, '');
  if (/^\d+$/.test(asString)) return asString;
  // datetime form
  if (/^d".+"$/.test(asString) || /^\d{4}-\d{2}-\d{2}/.test(asString)) {
    return asString.startsWith('d"') ? asString : `d"${asString}"`;
  }
  return '0';
}

/**
 * Extract create/update/delete mutations from a SHOW CHANGES batch entry.
 * Returns { action, recordId, value? } or null for define_table / noise.
 */
function parseChangeMutation(change) {
  if (!change || typeof change !== 'object') return null;

  if (change.delete) {
    const id = change.delete.id ?? change.delete;
    return { action: 'DELETE', recordId: id, value: null };
  }

  if (change.update) {
    // Plain feed stores the after-image under update; INCLUDE ORIGINAL may use current.
    const value = change.current && typeof change.current === 'object' && !Array.isArray(change.update)
      ? change.current
      : (Array.isArray(change.update) ? change.current : change.update);
    const id = value && value.id != null
      ? value.id
      : (change.update && change.update.id);
    if (id == null) return null;
    return { action: 'UPDATE', recordId: id, value: value || null };
  }

  if (change.create) {
    const value = change.create;
    const id = value && value.id != null ? value.id : null;
    if (id == null) return null;
    return { action: 'CREATE', recordId: id, value };
  }

  return null;
}

function recordIdKey(recordId) {
  if (recordId == null) return '';
  return String(recordId);
}

/** Table name from a record id (`order:abc` → `order`). */
function tableNameFromRecordId(value) {
  const key = recordIdKey(value);
  if (!key) return '';
  const colon = key.indexOf(':');
  if (colon <= 0) return '';
  return key.slice(0, colon);
}

/** Deep-clone for JSON responses; BigInt → string. */
function jsonSafe(value) {
  if (typeof value === 'bigint') return value.toString();
  if (value == null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(jsonSafe);
  const out = {};
  for (const [k, v] of Object.entries(value)) {
    out[k] = jsonSafe(v);
  }
  return out;
}

/**
 * Collapse a SHOW CHANGES batch to the net effect per record id.
 * Later mutations win. A trailing DELETE wins over earlier upserts.
 *
 * @param {Array<{changes?: any[], versionstamp?: number|string}>} entries
 * @returns {{ operations: Array<{action, recordId, value, versionstamp}>, lastVersionstamp: number|string|null }}
 */
function compactChangeBatch(entries) {
  const byId = new Map();
  let lastVersionstamp = null;

  for (const entry of entries || []) {
    if (!entry || typeof entry !== 'object') continue;
    if (entry.versionstamp != null) lastVersionstamp = entry.versionstamp;
    const changes = Array.isArray(entry.changes) ? entry.changes : [];
    for (const change of changes) {
      const mutation = parseChangeMutation(change);
      if (!mutation) continue;
      const key = recordIdKey(mutation.recordId);
      if (!key) continue;
      byId.set(key, {
        action: mutation.action === 'DELETE' ? 'DELETE' : 'UPSERT',
        recordId: mutation.recordId,
        value: mutation.action === 'DELETE' ? null : mutation.value,
        versionstamp: entry.versionstamp,
      });
    }
  }

  return {
    operations: [...byId.values()],
    lastVersionstamp,
  };
}

/**
 * Decide the next cursor after a successful apply of operations up through appliedVersionstamp.
 * Only advances when appliedVersionstamp is set. Uses BigInt when values are large stamps.
 */
function compareVersionstamp(a, b) {
  if (a == null && b == null) return 0;
  if (a == null) return -1;
  if (b == null) return 1;
  try {
    const left = BigInt(typeof a === 'bigint' ? a : String(a).replace(/n$/i, ''));
    const right = BigInt(typeof b === 'bigint' ? b : String(b).replace(/n$/i, ''));
    if (left < right) return -1;
    if (left > right) return 1;
    return 0;
  } catch {
    return String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0;
  }
}

function nextCursorVersionstamp(current, appliedVersionstamp) {
  if (appliedVersionstamp == null) return current;
  if (current == null) return appliedVersionstamp;
  return compareVersionstamp(appliedVersionstamp, current) >= 0 ? appliedVersionstamp : current;
}

/**
 * Surreal `SHOW CHANGES … SINCE stamp` is inclusive of `stamp`.
 * Drop entries at or before the cursor so we do not replay forever.
 */
function entriesAfterCursor(entries, cursor) {
  if (cursor == null || cursor === '' || cursor === 0 || cursor === '0') {
    return Array.isArray(entries) ? [...entries] : [];
  }
  return (entries || []).filter(
    (entry) => entry && compareVersionstamp(entry.versionstamp, cursor) > 0
  );
}

/** Persistable form of a versionstamp for sync_cloud_cursor (avoid raw BigInt). */
function versionstampForStorage(value) {
  if (value == null) return null;
  if (typeof value === 'bigint') return value.toString();
  return value;
}

/**
 * Normalize SHOW CHANGES query result into an array of { changes, versionstamp }.
 */
function normalizeShowChangesResult(result) {
  const first = Array.isArray(result) ? result[0] : result;
  const rows = first && typeof first === 'object' && 'result' in first ? first.result : first;
  if (!Array.isArray(rows)) return [];
  return rows.filter((row) => row && typeof row === 'object');
}

/**
 * Unwrap a Surreal SELECT page into a plain array of records.
 */
function normalizeSelectPage(result) {
  const first = Array.isArray(result) ? result[0] : result;
  const rows = first && typeof first === 'object' && 'result' in first ? first.result : first;
  if (!Array.isArray(rows)) return [];
  return rows;
}

module.exports = {
  isRetryableError,
  isChangefeedRetentionError,
  parseChangeMutation,
  compactChangeBatch,
  nextCursorVersionstamp,
  compareVersionstamp,
  entriesAfterCursor,
  versionstampForStorage,
  normalizeShowChangesResult,
  normalizeSelectPage,
  recordIdKey,
  tableNameFromRecordId,
  jsonSafe,
  sinceLiteral,
};
