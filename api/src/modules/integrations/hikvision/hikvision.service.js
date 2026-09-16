'use strict';

/**
 * Shared helpers for resolving Hikvision device connection params from request bodies.
 */

function normalizeDevice(input) {
  if (!input || typeof input !== 'object') {
    const err = new Error('device credentials are required');
    err.statusCode = 400;
    throw err;
  }

  const host = String(input.host || '').trim();
  const username = String(input.username || '').trim();
  const password = String(input.password ?? '');

  if (!host) {
    const err = new Error('device.host is required');
    err.statusCode = 400;
    throw err;
  }
  if (!username) {
    const err = new Error('device.username is required');
    err.statusCode = 400;
    throw err;
  }
  if (!password) {
    const err = new Error('device.password is required');
    err.statusCode = 400;
    throw err;
  }

  const useHttps = Boolean(input.useHttps);
  const port = Number(input.port) || (useHttps ? 443 : 80);

  return {
    id: input.id ? String(input.id) : undefined,
    name: input.name ? String(input.name) : undefined,
    host,
    port,
    useHttps,
    username,
    password,
    timeoutMs: Number(input.timeoutMs) || 15000,
  };
}

module.exports = {
  normalizeDevice,
};
