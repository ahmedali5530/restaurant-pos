'use strict';

const path = require('path');
const dotenv = require('dotenv');

// Layered env loading: committed `.env` holds non-secret defaults; local
// `.env.local` (gitignored) holds real credentials and overrides `.env`.
dotenv.config({ path: path.resolve(__dirname, '.env') });
dotenv.config({ path: path.resolve(__dirname, '.env.local'), override: true });

const express = require('express');
const cors = require('cors');
const { handleError } = require('./src/lib/response');
const { requestLogMiddleware } = require('./src/lib/request-log.middleware');
const { createSessionAuthMiddleware } = require('./src/lib/session-auth.middleware');
const { modules } = require('./src/modules');
const logger = require('./src/lib/logger');

const app = express();
const PORT = Number(process.env.API_PORT || 3140);
const HOST = process.env.API_HOST || '0.0.0.0';
const requireSession = createSessionAuthMiddleware();

const allowedOrigins = (process.env.API_ALLOWED_ORIGINS || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(
  cors(
    allowedOrigins.length
      ? {
          origin(origin, callback) {
            // Allow same-origin / non-browser callers (no Origin header).
            if (!origin || allowedOrigins.includes(origin)) {
              return callback(null, true);
            }
            return callback(new Error(`Origin ${origin} is not allowed`));
          },
        }
      : undefined
  )
);

app.use(express.json({ limit: '2mb' }));
app.use(requestLogMiddleware);

app.get('/health', (req, res) => {
  res.json({
    ok: true,
    service: 'posr-api-server',
    modules: modules.map((m) => m.name),
  });
});

for (const module of modules) {
  // Mount webhook/public routes first — no session auth (vendor signature or OAuth redirects).
  if (module.webhookRouter) {
    app.use(module.basePath, module.webhookRouter);
  }
  // Protect session-authenticated module routes with POS session JWT.
  if (module.router) {
    app.use(module.basePath, requireSession, module.router);
  }
}

app.use((err, req, res, next) => {
  handleError(res, err);
});

function start() {
  app.listen(PORT, HOST, () => {
    logger.info('server', `API server listening on http://${HOST}:${PORT}`);
    logger.info('server', `Allowed origins: ${allowedOrigins.length ? allowedOrigins.join(', ') : '(all)'}`);
    for (const module of modules) {
      logger.info('server', `Mounted module '${module.name}' at ${module.basePath}`);
    }
  });
}

start();
