'use strict';

const path = require('path');

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

/**
 * Docker sets SURREAL_BIN=/surreal. The desktop app ships posr-surreal-*.exe
 * next to the Node sidecar and does not set SURREAL_BIN.
 * @param {{ bin?: string, execDir?: string, entries?: (dir: string) => string[], exists?: (file: string) => boolean }} input
 */
function resolveSurrealBin(input = {}) {
  const exists = input.exists || (() => false);
  const configured = String(input.bin || '').trim();
  if (configured && exists(configured)) {
    return configured;
  }
  const execDir = String(input.execDir || '').trim();
  const entries = input.entries || (() => []);
  let names = [];
  if (execDir) {
    try {
      names = entries(execDir) || [];
    } catch {
      names = [];
    }
  }
  const preferred = names.find((name) => /^posr-surreal/i.test(name))
    || names.find((name) => /^surreal([.-]|$)/i.test(name));
  if (preferred && execDir) {
    const full = path.join(execDir, preferred);
    if (exists(full)) return full;
  }
  return configured || 'surreal';
}

function maxUploadBytes(env = process.env) {
  const raw = Number(env.BACKUP_MAX_UPLOAD_BYTES);
  if (Number.isFinite(raw) && raw > 0) return raw;
  return 512 * 1024 * 1024;
}

module.exports = {
  hasDatabaseBackupAccess,
  surrealHttpEndpoint,
  resolveSurrealBin,
  maxUploadBytes,
};
