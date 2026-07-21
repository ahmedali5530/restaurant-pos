'use strict';

require('dotenv').config();

const http = require('http');
const express = require('express');
const cors = require('cors');
const authRoutes = require('./src/auth.routes');
const { attachRpcRelay } = require('./src/ws-relay');
const { initSurrealClient } = require('./src/surreal-client');
const { verifySession, extractBearer } = require('./src/jwt');

const app = express();
const PORT = Number(process.env.GATEWAY_PORT || 3142);
const HOST = process.env.GATEWAY_HOST || '0.0.0.0';

function parseOrigins(raw) {
  return String(raw || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

const allowedOrigins = parseOrigins(process.env.GATEWAY_ALLOWED_ORIGINS);

app.use(
  cors({
    origin(origin, cb) {
      if (!origin || allowedOrigins.length === 0 || allowedOrigins.includes('*')) {
        return cb(null, true);
      }
      if (allowedOrigins.includes(origin)) {
        return cb(null, true);
      }
      return cb(null, false);
    },
    credentials: true,
  })
);

app.use(express.json({ limit: '256kb' }));

app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'posr-gateway' });
});

app.use('/auth', authRoutes);

/** Shared verify endpoint for other services (optional). */
app.post('/auth/verify', async (req, res) => {
  try {
    const token = extractBearer(req) || req.body?.token;
    const payload = await verifySession(token);
    return res.json({ ok: true, session: payload });
  } catch (err) {
    return res.status(err.status || 401).json({ ok: false, error: err.message });
  }
});

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ ok: false, error: 'Internal error' });
});

const server = http.createServer(app);
attachRpcRelay(server);

server.listen(PORT, HOST, () => {
  console.log(`Gateway listening on http://${HOST}:${PORT}`);
  console.log('POST /auth/login');
  console.log('POST /auth/logout');
  console.log('GET  /auth/session');
  console.log('POST /auth/db-token');
  console.log('WS   /rpc (session JWT required)');
});

void initSurrealClient()
  .then(() => console.log('Connected to SurrealDB for auth lookups'))
  .catch((err) => {
    console.warn('SurrealDB connection failed at startup (will retry on request):', err.message);
  });
