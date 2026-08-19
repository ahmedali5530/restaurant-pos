'use strict';

require('dotenv').config();

const WS = require('ws');
const { Surreal } = require('surrealdb');

if (typeof global.WebSocket === 'undefined') {
  global.WebSocket = WS;
}

const DB_URL = process.env.SURREAL_URL || 'ws://127.0.0.1:8000/rpc';
const DB_NS = process.env.SURREAL_NS || 'posr';
const DB_NAME = process.env.SURREAL_DB || 'posr';
const DB_USER = process.env.SURREAL_USER;
const DB_PASS = process.env.SURREAL_PASS;
if (!DB_USER || !DB_PASS) {
  throw new Error('SURREAL_USER and SURREAL_PASS are required and have no default — set them in gateway/.env');
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

async function createClient() {
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
}

async function getClient() {
  if (clientPromise) return clientPromise;

  clientPromise = createClient().catch((err) => {
    clientPromise = null;
    throw err;
  });

  return clientPromise;
}

/**
 * Fresh sign-in to obtain a Surreal access token for the browser session.
 * Root credentials never leave this process.
 */
async function issueSurrealAccessToken() {
  const client = new Surreal();
  try {
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
      `SurrealDB connect for token (${DB_URL})`
    );

    if (client.accessToken) {
      return client.accessToken;
    }

    const tokens = await client.signin({
      username: DB_USER,
      password: DB_PASS,
    });

    const access =
      typeof tokens === 'string'
        ? tokens
        : tokens?.access || tokens?.accessToken || tokens?.token;

    if (!access && client.accessToken) {
      return client.accessToken;
    }
    if (!access) {
      throw new Error('SurrealDB did not return an access token');
    }
    return access;
  } finally {
    await client.close().catch(() => {});
  }
}

async function initSurrealClient() {
  await getClient();
}

module.exports = {
  getClient,
  initSurrealClient,
  issueSurrealAccessToken,
  DB_NS,
  DB_NAME,
};
