'use strict';

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

function loadConfig(env) {
  const reconnectMsRaw = Number(env.SYNC_RECONNECT_MS || 5000);
  const reconnectMs = Number.isFinite(reconnectMsRaw) && reconnectMsRaw > 0 ? reconnectMsRaw : 5000;
  const excludeTables = parseList(env.SYNC_EXCLUDE_TABLES);
  const masterUrl = getOptional(env, 'SYNC_MASTER_URL');
  const syncEnabled = Boolean(masterUrl);

  return {
    serviceHost: env.SYNC_SERVICE_HOST || '0.0.0.0',
    servicePort: Number(env.SYNC_SERVICE_PORT || 3136),
    reconnectMs,
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
    excludeTables,
  };
}

module.exports = {
  loadConfig,
};
