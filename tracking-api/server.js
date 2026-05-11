'use strict';

require('dotenv').config();

const express = require('express');
const cors = require('cors');
const trackingRoutes = require('./src/routes/tracking.routes');

const app = express();
const PORT = Number(process.env.TRACKING_PORT || 3138);
const HOST = process.env.TRACKING_HOST || '0.0.0.0';

app.use(cors());
app.use(express.json({ limit: '1mb' }));

app.get('/health', (req, res) => {
  res.json({ ok: true, service: 'posr-tracking-api' });
});

app.use('/tracking', trackingRoutes);

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
