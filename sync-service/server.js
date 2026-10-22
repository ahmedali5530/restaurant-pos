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

function requireStatsSecret(req, res, statsSecret) {
  if (!statsSecret) return true;
  const provided = req.get('x-sync-stats-secret') || '';
  if (provided !== statsSecret) {
    res.status(403).json({ ok: false, error: 'Forbidden' });
    return false;
  }
  return true;
}

async function main() {
  const config = loadConfig(process.env);
  const logger = createLogger(config.logLevel);
  const manager = config.syncEnabled ? new SyncManager(config, logger) : null;

  const app = express();
  app.use(express.json({ limit: '32kb' }));

  // Settings UI (Vite) calls /stats and /catalog/sync-now from the browser.
  const allowedOrigins = String(
    process.env.SYNC_ALLOWED_ORIGINS
      || 'http://localhost:5173,http://127.0.0.1:5173'
  )
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  app.use((req, res, next) => {
    const origin = req.get('origin');
    if (origin && allowedOrigins.includes(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Sync-Stats-Secret');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    }
    if (req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }
    next();
  });

  app.get('/health', (req, res) => {
    if (!manager) {
      res.status(200).json({
        ok: true,
        enabled: false,
        distributionMode: config.distributionMode,
        service: 'posr-sync-service',
        message: config.distributionMode === 'off'
          ? 'Sync service is disabled (SYNC_DISTRIBUTION_MODE=off or SYNC_MASTER_URL missing).'
          : 'Sync service is disabled because SYNC_MASTER_URL is not configured.',
      });
      return;
    }

    const stats = manager.getStats();
    res.status(stats.healthy ? 200 : 503).json({
      ok: stats.healthy,
      enabled: true,
      distributionMode: config.distributionMode,
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
    if (!requireStatsSecret(req, res, statsSecret)) return;

    if (!manager) {
      res.json({
        enabled: false,
        distributionMode: config.distributionMode,
        message: 'Sync service is disabled because SYNC_MASTER_URL is not configured or mode is off.',
      });
      return;
    }

    // Light version nudge for Settings — never block /stats on a slow master.
    if (manager.catalogDownload) {
      void manager.catalogDownload.refreshRemoteVersion().catch(() => {});
    }

    res.json({
      enabled: true,
      distributionMode: config.distributionMode,
      ...manager.getStats(),
    });
  });

  app.post('/catalog/sync-now', (req, res) => {
    if (!requireStatsSecret(req, res, statsSecret)) return;

    if (!manager) {
      res.status(503).json({
        ok: false,
        error: 'Sync service is disabled',
      });
      return;
    }

    try {
      const result = manager.requestCatalogSync();
      const { done: _done, ...body } = result;
      res.json(body);
    } catch (error) {
      res.status(400).json({
        ok: false,
        error: error.message || String(error),
      });
    }
  });

  if (manager) {
    // Bind HTTP first so /health and /stats stay reachable while master is down.
    const server = app.listen(config.servicePort, config.serviceHost, () => {
      logger.info(`Sync service listening on http://${config.serviceHost}:${config.servicePort}`, {
        mode: config.distributionMode,
        upload: config.uploadEnabled,
        download: config.downloadEnabled,
      });
    });

    manager.start().catch((error) => {
      logger.error('Sync manager failed to start', { error: error.message || String(error) });
    });

    const shutdown = async (signal) => {
      logger.info(`Received ${signal}, shutting down sync service`);
      await manager.stop();
      await new Promise((resolve) => server.close(resolve));
      process.exit(0);
    };

    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));
  } else {
    logger.warn('Sync manager startup skipped', {
      mode: config.distributionMode,
      hasMaster: Boolean(config.master.url),
    });
    const server = app.listen(config.servicePort, config.serviceHost, () => {
      logger.info(`Sync service listening on http://${config.serviceHost}:${config.servicePort}`);
    });

    const shutdown = async (signal) => {
      logger.info(`Received ${signal}, shutting down sync service`);
      await new Promise((resolve) => server.close(resolve));
      process.exit(0);
    };

    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));
  }
}

main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error('Failed to start sync service', error);
  process.exit(1);
});
