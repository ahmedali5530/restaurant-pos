'use strict';

const path = require('path');
const dotenv = require('dotenv');

// Layered env loading: committed `.env` holds non-secret defaults; local
// `.env.local` (gitignored) holds real credentials and overrides `.env`.
dotenv.config({ path: path.resolve(__dirname, '.env') });
dotenv.config({ path: path.resolve(__dirname, '.env.local'), override: true });

/**
 * Expand ${VAR} references in process.env (dotenv does not do this by itself).
 * Lets .env.local reuse shared keys, e.g. AI_CHEAP_KEY=${DEEPSEEK_API_KEY}.
 * Unresolved names are left unchanged so misconfig is easier to spot.
 */
function expandEnvVars(maxPasses = 5) {
  const pattern = /\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g;
  for (let pass = 0; pass < maxPasses; pass += 1) {
    let changed = false;
    for (const [key, value] of Object.entries(process.env)) {
      if (typeof value !== 'string' || !value.includes('${')) {
        continue;
      }
      const next = value.replace(pattern, (match, name) => {
        const replacement = process.env[name];
        if (replacement === undefined || replacement === null) {
          return match;
        }
        changed = true;
        return String(replacement);
      });
      if (next !== value) {
        process.env[key] = next;
      }
    }
    if (!changed) {
      break;
    }
  }
}

expandEnvVars();

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

// SECURITY: fail-closed when no origins are allow-listed. The previous behaviour
// passed `cors(undefined)` when API_ALLOWED_ORIGINS was unset, which silently
// allowed ALL cross-origin requests. The gateway already denies by default; the
// API must mirror that posture. Set API_ALLOWED_ORIGINS explicitly in .env.
if (!allowedOrigins.length && process.env.NODE_ENV !== 'test') {
  logger.warn(
    'server',
    'API_ALLOWED_ORIGINS is not set. CORS will deny all cross-origin requests. ' +
      'Set it explicitly in api/.env (comma-separated list of frontend origins).'
  );
}

app.use(
  cors({
    // When the allow-list is empty we deny every Origin header (browser-side
    // cross-origin request). Same-origin / non-browser callers (no Origin
    // header) are still accepted.
    origin(origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      return callback(new Error(`Origin ${origin} is not allowed by API_ALLOWED_ORIGINS`));
    },
  })
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
    logger.info(
      'server',
      `Allowed origins: ${allowedOrigins.length ? allowedOrigins.join(', ') : '(none — CORS denies all cross-origin)'}`
    );
    for (const module of modules) {
      logger.info('server', `Mounted module '${module.name}' at ${module.basePath}`);
    }
  });
}

start();
