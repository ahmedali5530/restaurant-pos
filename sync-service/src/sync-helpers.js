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

function withTimeout(promise, ms, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error(`${label} timed out after ${ms}ms`));
    }, ms);
  });

  return Promise.race([promise, timeout]).finally(() => {
    clearTimeout(timer);
  });
}

async function withRetry(task, options = {}) {
  const retries = Number.isFinite(options.retries) ? options.retries : 5;
  const delayMs = Number.isFinite(options.delayMs) ? options.delayMs : 75;
  const timeoutMs = Number.isFinite(options.timeoutMs) ? options.timeoutMs : 20000;
  const label = options.label || 'operation';
  let lastError;

  for (let attempt = 0; attempt < retries; attempt += 1) {
    try {
      return await withTimeout(Promise.resolve().then(task), timeoutMs, label);
    } catch (error) {
      lastError = error;
      if (!isRetryableError(error) || attempt === retries - 1) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, delayMs * (attempt + 1)));
    }
  }

  throw lastError;
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

const USER_SECRET_FIELDS = ['password', 'pin', 'password_hash', 'pass', 'pin_code'];

/**
 * Shared catalog rows (no branch_id) or rows for this branch apply.
 * Rows stamped for another branch are skipped.
 */
function shouldApplyCatalogRow(row, branchId) {
  if (!row || typeof row !== 'object') return false;
  const scoped = row.branch_id;
  if (scoped == null || scoped === '') return true;
  return String(scoped) === String(branchId);
}

/** Strip credential fields before writing cloud user rows onto the branch. */
function stripUserSecrets(payload) {
  if (!payload || typeof payload !== 'object') return payload;
  const out = { ...payload };
  for (const key of USER_SECRET_FIELDS) {
    delete out[key];
  }
  return out;
}

/**
 * Branch schema requires these as arrays (no null/none). Cloud rows that omit
 * them would upsert as NONE and fail — default to [].
 */
const REQUIRED_ARRAY_FIELDS = {
  kitchen: ['items'],
  menu: ['items'],
  menu_item: ['categories'],
  modifier_group: ['modifiers'],
  user: ['roles'],
};

/**
 * SCHEMAFULL fields with DEFAULTs. Cloud often omits them; a prior CONTENT
 * write may also have left NONE on the branch. Re-apply defaults on download.
 */
const CATALOG_FIELD_DEFAULTS = {
  discount: {
    application_mode: 'manual',
    category: 'manual',
    exclusive: false,
    is_active: true,
    requires_approval: false,
    requires_reason: false,
    schedules: [],
    scope: 'cart',
    stackable: true,
    stackable_with_coupon: true,
    stacking_mode: 'allow',
    targets: {},
    tax_treatment: 'tax_before_discount',
  },
};

/** Catalog tables that are Surreal RELATION edges (need INSERT RELATION, not UPSERT CONTENT). */
const RELATION_CATALOG_TABLES = Object.freeze([
  'menu_item_modifier_group',
]);

function prepareCatalogPayload(tableName, value) {
  const raw = { ...(value || {}) };
  delete raw.id;

  let payload = {};
  for (const [key, fieldValue] of Object.entries(raw)) {
    // Explicit null/undefined become NONE under CONTENT and defeat schema DEFAULTs.
    if (fieldValue === null || fieldValue === undefined) continue;
    payload[key] = fieldValue;
  }

  if (tableName === 'user') {
    payload = stripUserSecrets(payload);
  }
  const requiredArrays = REQUIRED_ARRAY_FIELDS[tableName] || [];
  for (const field of requiredArrays) {
    if (payload[field] == null) {
      payload[field] = [];
    }
  }
  const defaults = CATALOG_FIELD_DEFAULTS[tableName];
  if (defaults) {
    for (const [field, defaultValue] of Object.entries(defaults)) {
      if (payload[field] == null) {
        payload[field] = defaultValue;
      }
    }
  }
  return payload;
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

/**
 * Phase 5: intersect catalog_release.tables with the download allowlist.
 * Empty / missing / unknown tables → full allowlist (backward compatible).
 * When catching up, union tables from every tip release newer than localVersion.
 */
function resolveCatalogSyncTables({
  allowlist,
  localVersion = 0,
  globalRelease = null,
  branchRelease = null,
} = {}) {
  const allowed = Array.isArray(allowlist) ? allowlist.filter(Boolean) : [];
  if (!allowed.length) return [];

  const local = Number(localVersion) || 0;
  const tips = [];
  if (globalRelease && typeof globalRelease === 'object') tips.push(globalRelease);
  if (branchRelease && typeof branchRelease === 'object') tips.push(branchRelease);

  const newer = tips.filter((row) => Number(row.version) > local);
  const consider = newer.length
    ? newer
    : tips.length
      ? [pickWinningCatalogRelease(globalRelease, branchRelease)].filter(Boolean)
      : [];

  if (!consider.length) return [...allowed];

  const declared = [];
  let anyDeclared = false;
  for (const row of consider) {
    if (!Array.isArray(row.tables) || row.tables.length === 0) continue;
    anyDeclared = true;
    for (const name of row.tables) {
      const table = String(name || '').trim();
      if (table) declared.push(table);
    }
  }

  if (!anyDeclared) return [...allowed];

  const wanted = new Set(declared);
  const filtered = allowed.filter((name) => wanted.has(name));
  return filtered.length ? filtered : [...allowed];
}

function pickWinningCatalogRelease(globalRelease, branchRelease) {
  const g = globalRelease && typeof globalRelease === 'object' ? Number(globalRelease.version) || 0 : -1;
  const b = branchRelease && typeof branchRelease === 'object' ? Number(branchRelease.version) || 0 : -1;
  if (b < 0 && g < 0) return null;
  if (b >= g) return branchRelease;
  return globalRelease;
}

module.exports = {
  isRetryableError,
  isChangefeedRetentionError,
  withTimeout,
  withRetry,
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
  shouldApplyCatalogRow,
  stripUserSecrets,
  prepareCatalogPayload,
  resolveCatalogSyncTables,
  pickWinningCatalogRelease,
  USER_SECRET_FIELDS,
  RELATION_CATALOG_TABLES,
};
