'use strict';

const path = require('path');
const dotenv = require('dotenv');

// Layered env: `.env` defaults, `.env.local` fills gaps only.
// In Docker, compose `environment:` / `env_file` must win (e.g. SURREAL_URL=surrealdb).
dotenv.config({ path: path.resolve(__dirname, '.env') });
dotenv.config({ path: path.resolve(__dirname, '.env.local'), override: false });

const http = require('http');
const express = require('express');
const cors = require('cors');
const authRoutes = require('./src/auth.routes');
const { getUserRoleModules, hasSecurityAlertsAccess } = require('./src/auth.service');
const { attachRpcRelay } = require('./src/ws-relay');
const { getClient, initSurrealClient } = require('./src/surreal-client');
const { verifySession, extractBearer, _revocationStore } = require('./src/jwt');
const auditLog = require('./src/audit-log');

const app = express();
const PORT = Number(process.env.GATEWAY_PORT || 3142);
const HOST = process.env.GATEWAY_HOST || '0.0.0.0';

function parseOrigins(raw) {
  return String(raw || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

/** localhost and 127.0.0.1 are the same host; browsers treat them as different origins. */
function originAllowed(origin, allowed) {
  if (allowed.includes('*') || allowed.includes(origin)) {
    return true;
  }
  try {
    const u = new URL(origin);
    const port = u.port ? `:${u.port}` : '';
    const altHost =
      u.hostname === 'localhost'
        ? '127.0.0.1'
        : u.hostname === '127.0.0.1'
          ? 'localhost'
          : null;
    if (!altHost) return false;
    return allowed.includes(`${u.protocol}//${altHost}${port}`);
  } catch {
    return false;
  }
}

const allowedOrigins = parseOrigins(process.env.GATEWAY_ALLOWED_ORIGINS);

app.use(
  cors({
    origin(origin, cb) {
      // No Origin header = same-origin or a non-browser caller — always fine.
      if (!origin) {
        return cb(null, true);
      }
      // An unset/empty allow-list must NOT mean "allow every origin" — only
      // an explicit '*' or an explicitly listed origin passes.
      if (originAllowed(origin, allowedOrigins)) {
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

/**
 * GET /alerts — list recent security alerts (admin-only).
 * Query params: ?status=open&severity=critical&limit=50
 *
 * Returns the most recent security_alerts. Admin UI polls this endpoint to
 * surface suspicious activity detected by the anomaly detector.
 */
app.get('/alerts', async (req, res) => {
  try {
    const payload = await verifySession(extractBearer(req));
    const jwtRoles = payload.roles || [];
    let allowed = hasSecurityAlertsAccess(jwtRoles);
    if (!allowed) {
      const modules = await getUserRoleModules(payload.sub);
      allowed = hasSecurityAlertsAccess(modules);
    }
    if (!allowed) {
      return res.status(403).json({ ok: false, error: 'Admin role required to read alerts' });
    }

    const { getClient } = require('./src/surreal-client');
    const client = await getClient();
    const status = req.query.status || 'open';
    const severity = req.query.severity;
    const limit = Math.min(Number(req.query.limit) || 50, 200);

    let where = `status = $status`;
    const params = { status, limit };
    if (severity) {
      where += ` AND severity = $severity`;
      params.severity = severity;
    }

    const result = await client.query(
      `SELECT * FROM security_alerts WHERE ${where} ORDER BY emitted_at DESC LIMIT $limit;`,
      params
    );
    const rows = Array.isArray(result) ? result[0] || result : result;
    const alerts = Array.isArray(rows) ? rows : [];

    return res.json({ ok: true, alerts, count: alerts.length });
  } catch (err) {
    return res.status(err.status || 500).json({ ok: false, error: err.message });
  }
});

/**
 * POST /alerts/:id/acknowledge — mark an alert as acknowledged (admin-only).
 * Body: { resolutionNotes?: string }
 */
app.post('/alerts/:id/acknowledge', async (req, res) => {
  try {
    const payload = await verifySession(extractBearer(req));
    const jwtRoles = payload.roles || [];
    let allowed = hasSecurityAlertsAccess(jwtRoles);
    if (!allowed) {
      const modules = await getUserRoleModules(payload.sub);
      allowed = hasSecurityAlertsAccess(modules);
    }
    if (!allowed) {
      return res.status(403).json({ ok: false, error: 'Admin role required' });
    }

    const { getClient } = require('./src/surreal-client');
    const client = await getClient();
    const alertId = String(req.params.id || '').trim();
    if (!alertId) {
      return res.status(400).json({ ok: false, error: 'Alert id is required' });
    }

    await client.query(
      `UPDATE type::record('security_alerts', $id) MERGE {
         status: 'acknowledged',
         acknowledged_by: $actor,
         acknowledged_at: time::now(),
         resolution_notes: $notes,
       };`,
      {
        id: alertId,
        actor: payload.sub,
        notes: req.body?.resolutionNotes || null,
      }
    );

    return res.json({ ok: true, id: alertId, status: 'acknowledged' });
  } catch (err) {
    return res.status(err.status || 500).json({ ok: false, error: err.message });
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
  console.log('GET  /alerts              (admin-only — security alerts)');
  console.log('POST /alerts/:id/acknowledge (admin-only)');
  console.log('WS   /rpc (session JWT required)');
});

void initSurrealClient()
  .then(async () => {
    console.log('Connected to SurrealDB for auth lookups');
    // Wire the live Surreal client into the durable revocation store so
    // logouts survive process restarts. The store degrades to in-memory-only
    // if this fails (logged), keeping the POS operational.
    try {
      const client = await getClient();
      _revocationStore.setSurrealClient(client);
      await _revocationStore.triggerBootstrap();
      // Wire the same Surreal client into the audit logger so it can persist
      // audit entries (login success/failure, permission denials, session
      // revocations) to the audit_log table.
      auditLog.setSurrealClient(client);
      console.log('Audit logger connected to SurrealDB');
    } catch (err) {
      console.warn('Revocation store / audit logger bootstrap failed (operating in-memory only):', err.message);
    }
  })
  .catch((err) => {
    console.warn('SurrealDB connection failed at startup (will retry on request):', err.message);
  });
