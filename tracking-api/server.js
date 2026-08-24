'use strict';

const path = require('path');
const fs = require('fs');

// Prefer repo-root .env (gateway secrets / ALLOWED_ORIGINS), then local tracking-api/.env
const rootEnv = path.resolve(__dirname, '..', '.env');
const localEnv = path.resolve(__dirname, '.env');
if (fs.existsSync(rootEnv)) {
  require('dotenv').config({ path: rootEnv });
}
if (fs.existsSync(localEnv)) {
  require('dotenv').config({ path: localEnv, override: true });
}

const express = require('express');
const cors = require('cors');
const trackingRoutes = require('./src/routes/tracking.routes');
const {
  createSessionAuthMiddleware,
  createCorsOriginDelegate,
} = require('./src/session-auth.middleware');

const app = express();
const PORT = Number(process.env.TRACKING_PORT || 3138);
const HOST = process.env.TRACKING_HOST || '0.0.0.0';
const requireSession = createSessionAuthMiddleware();

app.use(cors({ origin: createCorsOriginDelegate() }));
app.use(express.json({ limit: '2mb' }));

app.get('/health', (req, res) => {
  res.json({ ok: true, service: 'posr-tracking-api' });
});

app.use('/tracking', requireSession, trackingRoutes);

app.use((err, req, res, next) => {
  // eslint-disable-next-line no-console
  console.error('Tracking API error:', err);
  res.status(500).json({
    success: false,
    error: err instanceof Error ? err.message : 'Unexpected server error',
  });
});

app.listen(PORT, HOST, () => {
  // eslint-disable-next-line no-console
  console.log(`Tracking API listening on http://${HOST}:${PORT}`);
  // eslint-disable-next-line no-console
  console.log('POST /tracking');
});
