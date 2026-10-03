'use strict';

/**
 * Smoke: catalog download applies a shared menu_item from master → source.
 * Uses a throwaway master NS/DB on the same Surreal as source (like smoke-changefeed).
 *
 *   SYNC_FORCE_HOST_URL=1 node scripts/smoke-catalog-download.cjs
 */

process.stdout.write('smoke-catalog: boot\n');

const assert = require('node:assert/strict');
const path = require('path');
const WS = require('ws');
const { Surreal, RecordId } = require('surrealdb');

if (typeof global.WebSocket === 'undefined') {
  global.WebSocket = WS;
}

function loadEnvFiles() {
  const dotenv = require('dotenv');
  for (const root of [path.resolve(__dirname, '..'), path.resolve(__dirname, '../..')]) {
    dotenv.config({ path: path.join(root, '.env') });
    dotenv.config({ path: path.join(root, '.env.local'), override: true });
  }
}

function env(key, fallback = '') {
  const v = process.env[key];
  return v && String(v).trim() ? String(v).trim() : fallback;
}

async function connect(label, cfg) {
  const client = new Surreal();
  await client.connect(cfg.url, {
    namespace: cfg.ns,
    database: cfg.db,
    authentication: { username: cfg.user, password: cfg.pass },
  });
  console.log('connected', label, { ns: cfg.ns, db: cfg.db });
  return client;
}

async function main() {
  loadEnvFiles();

  let sourceUrl = env('SYNC_SOURCE_URL', env('SURREAL_URL', 'ws://127.0.0.1:8000/rpc'));
  if (process.env.SYNC_FORCE_HOST_URL) {
    sourceUrl = sourceUrl.replace('ws://surrealdb:', 'ws://127.0.0.1:');
  }

  const user = env('SYNC_SOURCE_USER', env('SURREAL_USER', 'root'));
  const pass = env('SYNC_SOURCE_PASS', env('SURREAL_PASS', 'root'));
  // Throwaway NS/DB on both sides so smoke never touches live posr data.
  const sourceNs = env('SYNC_SMOKE_SOURCE_NS', 'posr_catalog_smoke_src');
  const sourceDb = env('SYNC_SMOKE_SOURCE_DB', 'posr_catalog_smoke_src');
  const clientId = env('SYNC_CLIENT_ID', 'smoke-branch');
  const masterNs = env('SYNC_SMOKE_MASTER_NS', 'posr_catalog_smoke');
  const masterDb = env('SYNC_SMOKE_MASTER_DB', 'posr_catalog_smoke');

  process.env.SYNC_DISTRIBUTION_MODE = 'full';
  process.env.SYNC_CLIENT_ID = clientId;
  process.env.SYNC_SOURCE_URL = sourceUrl;
  process.env.SYNC_SOURCE_NS = sourceNs;
  process.env.SYNC_SOURCE_DB = sourceDb;
  process.env.SYNC_SOURCE_USER = user;
  process.env.SYNC_SOURCE_PASS = pass;
  process.env.SYNC_MASTER_URL = sourceUrl;
  process.env.SYNC_MASTER_NS = masterNs;
  process.env.SYNC_MASTER_DB = masterDb;
  process.env.SYNC_MASTER_USER = user;
  process.env.SYNC_MASTER_PASS = pass;
  process.env.SYNC_DOWNLOAD_TABLES = 'menu_item';
  process.env.SYNC_INCLUDE_TABLES = 'order';
  process.env.SYNC_POLL_MS = '500';
  process.env.SYNC_RECONNECT_MS = '2000';

  const { loadConfig } = require('../src/config');
  const { createLogger } = require('../src/logger');
  const { SyncManager } = require('../src/sync-manager');

  const config = loadConfig(process.env);
  assert.ok(config.downloadEnabled, 'download must be enabled');
  assert.ok(config.uploadEnabled, 'upload still enabled in full mode');
  assert.ok(!config.downloadTables.includes('order'), 'orders must not download');
  assert.ok(!config.includeTables.includes('menu_item'), 'menu_item must not upload');

  const master = await connect('master', {
    url: sourceUrl, ns: masterNs, db: masterDb, user, pass,
  });

  await master.query('DEFINE TABLE IF NOT EXISTS menu_item SCHEMALESS;');
  await master.query('ALTER TABLE IF EXISTS menu_item CHANGEFEED 14d;');
  await master.query('DEFINE TABLE IF NOT EXISTS catalog_release SCHEMALESS;');

  const dishId = new RecordId('menu_item', `smoke_cat_${Date.now()}`);
  await master.upsert(dishId).content({ name: 'Smoke Wings', price: 9.5, categories: [] });
  await master.upsert(new RecordId('catalog_release', 'current')).content({
    version: Date.now(),
    published_at: new Date().toISOString(),
  });
  console.log('seeded master', String(dishId));

  // Schemaless source (throwaway) so apply is not blocked by live branch field defs.
  const sourceSetup = await connect('source-setup', {
    url: sourceUrl, ns: sourceNs, db: sourceDb, user, pass,
  });
  await sourceSetup.query('DEFINE TABLE IF NOT EXISTS menu_item SCHEMALESS;');
  await sourceSetup.query('DEFINE TABLE IF NOT EXISTS order SCHEMALESS;');
  await sourceSetup.query('ALTER TABLE IF EXISTS order CHANGEFEED 14d;');
  await sourceSetup.query('DEFINE TABLE IF NOT EXISTS sync_catalog_down_cursor SCHEMALESS;');
  await sourceSetup.query('DEFINE TABLE IF NOT EXISTS sync_cloud_cursor SCHEMALESS;');
  await sourceSetup.close();

  const logger = createLogger('info');
  const manager = new SyncManager(config, logger);
  await manager.start();

  const queued = manager.requestCatalogSync();
  assert.ok(queued.ok, 'sync-now should queue');
  await queued.done;

  let ok = false;
  for (let i = 0; i < 10; i += 1) {
    await new Promise((r) => setTimeout(r, 200));
    const source = await connect('source-check', {
      url: sourceUrl, ns: sourceNs, db: sourceDb, user, pass,
    });
    let row = null;
    try {
      row = await source.select(dishId);
    } catch {
      row = null;
    }
    await source.close();
    if (row && row.name === 'Smoke Wings') {
      ok = true;
      console.log('download verified', String(dishId));
      break;
    }
  }

  const stats = manager.getStats();
  assert.ok(stats.downloadEnabled === true);
  assert.ok(stats.uploadEnabled === true);
  assert.equal(stats.distributionMode, 'full');

  await manager.stop();
  await master.close();
  if (!ok) throw new Error('menu_item was not downloaded to source');
  console.log('SMOKE CATALOG OK');
}

main().catch((err) => {
  console.error('SMOKE CATALOG FAILED', err);
  process.exit(1);
});
