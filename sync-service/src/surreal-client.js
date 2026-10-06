'use strict';

const WS = require('ws');
const { Surreal } = require('surrealdb');

if (typeof global.WebSocket === 'undefined') {
  global.WebSocket = WS;
}

function raceTimeout(promise, ms, label) {
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

/**
 * Connect with a hard timeout. On timeout/failure the client is closed so a
 * later master bring-up is not blocked by orphaned half-open sockets.
 */
async function createConnectedClient(label, connectionConfig, logger, options = {}) {
  const timeoutMs = Number.isFinite(options.timeoutMs) ? options.timeoutMs : 15000;
  const client = new Surreal();
  try {
    await raceTimeout(
      client.connect(connectionConfig.url, {
        namespace: connectionConfig.ns,
        database: connectionConfig.db,
        authentication: {
          username: connectionConfig.user,
          password: connectionConfig.pass,
        },
      }),
      timeoutMs,
      `${String(label || 'db').toLowerCase()}.connect`
    );
  } catch (error) {
    await closeClient(client, { timeoutMs: 3000 });
    throw error;
  }

  logger.info(`${label} SurrealDB connected`, {
    url: connectionConfig.url,
    namespace: connectionConfig.ns,
    database: connectionConfig.db,
  });

  return client;
}

async function closeClient(client, options = {}) {
  if (!client) return;
  if (typeof client.close !== 'function') return;
  const timeoutMs = Number.isFinite(options.timeoutMs) ? options.timeoutMs : 5000;
  try {
    await raceTimeout(
      Promise.resolve().then(() => client.close()),
      timeoutMs,
      'client.close'
    );
  } catch {
    // Abandon hung closes so reconnect can proceed when master was down.
  }
}

module.exports = {
  createConnectedClient,
  closeClient,
};
