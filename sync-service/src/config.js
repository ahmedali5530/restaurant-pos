'use strict';

/** Default FOH / sales tables for local-to-cloud upload (phase 1). */
const DEFAULT_UPLOAD_TABLES = [
  'order',
  'order_item',
  'order_item_kitchen',
  'order_payment',
  'order_tax',
  'order_discount',
  'order_coupon',
  'coupon_redemption',
  'order_void',
  'order_refund',
  'order_split',
  'order_merge',
  'order_print',
  'order_extras',
  'order_meta',
  'day_closing',
  'shift',
  'time_entry',
  'tip_distribution',
  'tip_distribution_user_share',
  'customer',
  'integration_order_fiscal',
];

/** FOH catalog tables for cloud-to-local download (phase 2). Must not overlap upload. */
const DEFAULT_DOWNLOAD_TABLES = [
  'order_type',
  'category',
  'menu_item',
  'modifier_group',
  'modifier',
  'menu_item_modifier_group',
  'floor',
  'floor_table',
  'kitchen',
  'workflow',
  'workflow_stage',
  'payment_type',
  'tax',
  'menu',
  'menu_menu_item',
  'setting',
  'user',
  'extra',
  'discount',
  'discount_reason',
  'coupon',
  'printer',
];

/** @deprecated use DEFAULT_UPLOAD_TABLES */
const DEFAULT_INCLUDE_TABLES = DEFAULT_UPLOAD_TABLES;

const DISTRIBUTION_MODES = ['off', 'report_only', 'full'];

function parseList(value) {
  if (!value) return [];
  return String(value)
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
}

function getRequired(env, key) {
  const value = env[key];
  if (!value || !String(value).trim()) {
    throw new Error(`Missing required env variable: ${key}`);
  }
  return String(value).trim();
}

function getOptional(env, key) {
  const value = env[key];
  return value ? String(value).trim() : '';
}

function resolveTableList(overrideEnvKey, defaults, excludeTables, env) {
  const includeOverride = parseList(env[overrideEnvKey]);
  const base = includeOverride.length ? includeOverride : defaults;
  return base.filter((name) => !excludeTables.includes(name));
}

/** @deprecated use resolveUploadTables */
function resolveIncludeTables(env) {
  return resolveUploadTables(env);
}

function resolveUploadTables(env) {
  const excludeTables = parseList(env.SYNC_EXCLUDE_TABLES);
  return resolveTableList('SYNC_INCLUDE_TABLES', DEFAULT_UPLOAD_TABLES, excludeTables, env);
}

function resolveDownloadTables(env) {
  const excludeTables = parseList(env.SYNC_EXCLUDE_TABLES);
  const downloadExclude = parseList(env.SYNC_DOWNLOAD_EXCLUDE_TABLES);
  const excluded = [...new Set([...excludeTables, ...downloadExclude])];
  return resolveTableList('SYNC_DOWNLOAD_TABLES', DEFAULT_DOWNLOAD_TABLES, excluded, env);
}

function assertDisjointAllowlists(uploadTables, downloadTables) {
  const upload = new Set(uploadTables);
  const overlap = downloadTables.filter((name) => upload.has(name));
  if (overlap.length) {
    throw new Error(
      `Upload and download allowlists overlap (infinite-loop risk): ${overlap.join(', ')}`
    );
  }
}

/**
 * Resolve distribution mode.
 * - No master URL → off
 * - Unset mode + master → report_only (keeps phase-1 uploads working)
 * - Explicit off|report_only|full otherwise
 */
function resolveDistributionMode(env, masterUrl) {
  if (!masterUrl) return 'off';
  const raw = (env.SYNC_DISTRIBUTION_MODE || '').trim().toLowerCase();
  if (!raw) return 'report_only';
  if (!DISTRIBUTION_MODES.includes(raw)) {
    throw new Error(
      `Invalid SYNC_DISTRIBUTION_MODE="${raw}"; expected one of ${DISTRIBUTION_MODES.join(', ')}`
    );
  }
  return raw;
}

function loadConfig(env) {
  const reconnectMsRaw = Number(env.SYNC_RECONNECT_MS || 5000);
  const reconnectMs = Number.isFinite(reconnectMsRaw) && reconnectMsRaw > 0 ? reconnectMsRaw : 5000;
  const pollMsRaw = Number(env.SYNC_POLL_MS || 1000);
  const pollMs = Number.isFinite(pollMsRaw) && pollMsRaw > 0 ? pollMsRaw : 1000;
  const backfillPageSizeRaw = Number(env.SYNC_BACKFILL_PAGE_SIZE || 200);
  const backfillPageSize = Number.isFinite(backfillPageSizeRaw) && backfillPageSizeRaw > 0
    ? backfillPageSizeRaw
    : 200;
  const changeLimitRaw = Number(env.SYNC_CHANGE_LIMIT || 100);
  const changeLimit = Number.isFinite(changeLimitRaw) && changeLimitRaw > 0 ? changeLimitRaw : 100;
  const masterUrl = getOptional(env, 'SYNC_MASTER_URL');
  const distributionMode = resolveDistributionMode(env, masterUrl);
  const excludeTables = parseList(env.SYNC_EXCLUDE_TABLES);
  const includeTables = resolveUploadTables(env);
  const downloadTables = resolveDownloadTables(env);

  assertDisjointAllowlists(includeTables, downloadTables);

  const uploadEnabled = Boolean(masterUrl)
    && (distributionMode === 'report_only' || distributionMode === 'full');
  const downloadEnabled = Boolean(masterUrl) && distributionMode === 'full';
  const syncEnabled = uploadEnabled || downloadEnabled;

  return {
    serviceHost: env.SYNC_SERVICE_HOST || '0.0.0.0',
    servicePort: Number(env.SYNC_SERVICE_PORT || 3136),
    reconnectMs,
    pollMs,
    backfillPageSize,
    changeLimit,
    logLevel: (env.SYNC_LOG_LEVEL || 'info').toLowerCase(),
    distributionMode,
    uploadEnabled,
    downloadEnabled,
    syncEnabled,
    clientId: getRequired(env, 'SYNC_CLIENT_ID'),
    source: {
      url: getRequired(env, 'SYNC_SOURCE_URL'),
      ns: getRequired(env, 'SYNC_SOURCE_NS'),
      db: getRequired(env, 'SYNC_SOURCE_DB'),
      user: getRequired(env, 'SYNC_SOURCE_USER'),
      pass: getRequired(env, 'SYNC_SOURCE_PASS'),
    },
    master: {
      url: masterUrl,
      ns: syncEnabled ? getRequired(env, 'SYNC_MASTER_NS') : '',
      db: syncEnabled ? getRequired(env, 'SYNC_MASTER_DB') : '',
      user: syncEnabled ? getRequired(env, 'SYNC_MASTER_USER') : '',
      pass: syncEnabled ? getRequired(env, 'SYNC_MASTER_PASS') : '',
    },
    includeTables,
    downloadTables,
    excludeTables,
  };
}

module.exports = {
  DEFAULT_INCLUDE_TABLES,
  DEFAULT_UPLOAD_TABLES,
  DEFAULT_DOWNLOAD_TABLES,
  DISTRIBUTION_MODES,
  loadConfig,
  parseList,
  resolveIncludeTables,
  resolveUploadTables,
  resolveDownloadTables,
  assertDisjointAllowlists,
  resolveDistributionMode,
};
