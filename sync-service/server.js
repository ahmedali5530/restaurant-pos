'use strict';

const path = require('path');
const dotenv = require('dotenv');

// `.env` holds defaults; `.env.local` (gitignored) holds real values and overrides `.env`.
// Do not use override against process.env so Docker Compose injected vars still win.
dotenv.config({ path: path.resolve(__dirname, '.env') });
dotenv.config({ path: path.resolve(__dirname, '.env.local'), override: true });

const express = require('express');
const { loadConfig } = require('./src/config');
const { createLogger } = require('./src/logger');
const { SyncManager } = require('./src/sync-manager');

async function main() {
  const config = loadConfig(process.env);
  const logger = createLogger(config.logLevel);
  const manager = config.syncEnabled ? new SyncManager(config, logger) : null;

  const app = express();
  app.get('/health', (req, res) => {
    if (!manager) {
      res.status(200).json({
        ok: true,
        enabled: false,
        service: 'posr-sync-service',
        message: 'Sync service is disabled because SYNC_MASTER_URL is not configured.',
      });
      return;
    }

    const stats = manager.getStats();
    res.status(stats.healthy ? 200 : 503).json({
      ok: stats.healthy,
      enabled: true,
      service: 'posr-sync-service',
      stats,
    });
  });

  // SECURITY: The /stats endpoint leaks sync topology (table count, processed/
  // failed event counts, last error message). Without auth, anyone on the
  // network can probe it. /health is intentionally open (for Docker health
  // checks + load balancers) but only returns a boolean — /stats returns
  // detailed data that an attacker could use to plan an attack.
  //
  // When SYNC_STATS_SECRET is set, the caller must send it in the
  // X-Sync-Stats-Secret header. When unset (dev/local), /stats is open.
  const statsSecret = process.env.SYNC_STATS_SECRET || '';

  app.get('/stats', (req, res) => {
    if (statsSecret) {
      const provided = req.get('x-sync-stats-secret') || '';
      if (provided !== statsSecret) {
        return res.status(403).json({ ok: false, error: 'Forbidden' });
      }
    }

    if (!manager) {
      res.json({
        enabled: false,
        message: 'Sync service is disabled because SYNC_MASTER_URL is not configured.',
      });
      return;
    }

    res.json({
      enabled: true,
      ...manager.getStats(),
    });
  });

  if (manager) {
    await manager.start();
  } else {
    logger.warn('SYNC_MASTER_URL is missing; sync manager startup skipped and service is disabled.');
  }

  const server = app.listen(config.servicePort, config.serviceHost, () => {
    logger.info(`Sync service listening on http://${config.serviceHost}:${config.servicePort}`);
  });

  const shutdown = async (signal) => {
    logger.info(`Received ${signal}, shutting down sync service`);
    if (manager) {
      await manager.stop();
    }
    await new Promise((resolve) => server.close(resolve));
    process.exit(0);
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error('Failed to start sync service', error);
  process.exit(1);
});
