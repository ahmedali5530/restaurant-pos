'use strict';

const DB_URL = process.env.TRACKING_DB_URL || 'ws://surrealdb:8001/rpc';
const DB_NS = process.env.TRACKING_DB_NS || 'posr';
const DB_NAME = process.env.TRACKING_DB_NAME || 'posr';
const DB_USER = process.env.TRACKING_DB_USER;
const DB_PASS = process.env.TRACKING_DB_PASS;
if (!DB_USER || !DB_PASS) {
  throw new Error('TRACKING_DB_USER and TRACKING_DB_PASS are required and have no default — set them in the environment');
}
if (DB_USER === 'root' && DB_PASS === 'root') {
  console.warn(
    'TRACKING_DB_USER/TRACKING_DB_PASS are root/root — allowed for an existing datastore; change them for new installs'
  );
}

const WS = require('ws');
const { Surreal } = require('surrealdb');

if (typeof global.WebSocket === 'undefined') {
  global.WebSocket = WS;
}

let clientPromise = null;

async function getClient() {
  if (clientPromise) return clientPromise;

  clientPromise = (async () => {
    const client = new Surreal();
    await client.connect(DB_URL, {
      namespace: DB_NS,
      database: DB_NAME,
      authentication: {
        username: DB_USER,
        password: DB_PASS,
      },
    });

    return client;
  })();

  return clientPromise;
}

module.exports = {
  getClient,
};
