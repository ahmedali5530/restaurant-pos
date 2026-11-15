'use strict';

function hasDatabaseBackupAccess(roleModules) {
  if (!Array.isArray(roleModules)) return false;
  return roleModules.some((r) => {
    const s = String(r);
    return s === 'settings.database' || s === 'settings.*';
  });
}

function surrealHttpEndpoint(env = process.env) {
  const explicit =
    env.SURREAL_HTTP_ENDPOINT ||
    env.SURREAL_ENDPOINT ||
    '';
  if (String(explicit).trim()) {
    return String(explicit).trim().replace(/\/$/, '');
  }
  const ws = String(env.SURREAL_URL || 'ws://surrealdb:8000/rpc');
  return ws
    .replace(/^ws:/i, 'http:')
    .replace(/^wss:/i, 'https:')
    .replace(/\/rpc\/?$/i, '');
}

function maxUploadBytes(env = process.env) {
  const raw = Number(env.BACKUP_MAX_UPLOAD_BYTES);
  if (Number.isFinite(raw) && raw > 0) return raw;
  return 512 * 1024 * 1024;
}

module.exports = {
  hasDatabaseBackupAccess,
  surrealHttpEndpoint,
  maxUploadBytes,
};
