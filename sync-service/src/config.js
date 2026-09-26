'use strict';

/** Default FOH / sales tables for local-to-cloud upload. */
const DEFAULT_INCLUDE_TABLES = [
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

function resolveIncludeTables(env) {
  const includeOverride = parseList(env.SYNC_INCLUDE_TABLES);
  const excludeTables = parseList(env.SYNC_EXCLUDE_TABLES);
  const base = includeOverride.length ? includeOverride : DEFAULT_INCLUDE_TABLES;
  return base.filter((name) => !excludeTables.includes(name));
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
  const syncEnabled = Boolean(masterUrl);
  const excludeTables = parseList(env.SYNC_EXCLUDE_TABLES);
  const includeTables = resolveIncludeTables(env);

  return {
    serviceHost: env.SYNC_SERVICE_HOST || '0.0.0.0',
    servicePort: Number(env.SYNC_SERVICE_PORT || 3136),
    reconnectMs,
    pollMs,
    backfillPageSize,
    changeLimit,
    logLevel: (env.SYNC_LOG_LEVEL || 'info').toLowerCase(),
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
    excludeTables,
  };
}

module.exports = {
  DEFAULT_INCLUDE_TABLES,
  loadConfig,
  parseList,
  resolveIncludeTables,
};
