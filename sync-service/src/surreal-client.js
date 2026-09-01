'use strict';

const WS = require('ws');
const { Surreal } = require('surrealdb');

if (typeof global.WebSocket === 'undefined') {
  global.WebSocket = WS;
}

async function createConnectedClient(label, connectionConfig, logger) {
  const client = new Surreal();
  await client.connect(connectionConfig.url, {
    namespace: connectionConfig.ns,
    database: connectionConfig.db,
    authentication: {
      username: connectionConfig.user,
      password: connectionConfig.pass,
    },
  });

  logger.info(`${label} SurrealDB connected`, {
    url: connectionConfig.url,
    namespace: connectionConfig.ns,
    database: connectionConfig.db,
  });

  return client;
}

async function closeClient(client) {
  if (!client) return;
  if (typeof client.close === 'function') {
    await client.close();
  }
}

module.exports = {
  createConnectedClient,
  closeClient,
};
