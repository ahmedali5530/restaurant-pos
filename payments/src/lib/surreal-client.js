'use strict';

const DB_URL = process.env.SURREAL_URL || 'ws://localhost:8001/rpc';
const DB_NS = process.env.SURREAL_NS || 'posr';
const DB_NAME = process.env.SURREAL_DB || 'posr';
const DB_USER = process.env.SURREAL_USER;
const DB_PASS = process.env.SURREAL_PASS;
if (!DB_USER || !DB_PASS) {
  throw new Error('SURREAL_USER and SURREAL_PASS are required and have no default — set them in payments/.env');
}
if (DB_USER === 'root' && DB_PASS === 'root') {
  console.warn(
    'SURREAL_USER/SURREAL_PASS are root/root — allowed for an existing datastore; change them for new installs'
  );
}

const WS = require('ws');
const { Surreal } = require('surrealdb');

if (typeof global.WebSocket === 'undefined') {
  global.WebSocket = WS;
}

const CONNECT_TIMEOUT_MS = Number(process.env.SURREAL_CONNECT_TIMEOUT_MS || 10000);

let clientPromise = null;

function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    }),
  ]);
}

async function getClient() {
  if (clientPromise) return clientPromise;

  clientPromise = (async () => {
    const client = new Surreal();
    await withTimeout(
      client.connect(DB_URL, {
        namespace: DB_NS,
        database: DB_NAME,
        authentication: {
          username: DB_USER,
          password: DB_PASS,
        },
      }),
      CONNECT_TIMEOUT_MS,
      `SurrealDB connect (${DB_URL})`
    );
    return client;
  })().catch((err) => {
    clientPromise = null;
    throw err;
  });

  return clientPromise;
}

async function initSurrealClient() {
  await getClient();
}

module.exports = {
  getClient,
  initSurrealClient,
};
