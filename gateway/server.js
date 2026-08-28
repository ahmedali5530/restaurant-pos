'use strict';

require('dotenv').config();

const http = require('http');
const express = require('express');
const cors = require('cors');
const authRoutes = require('./src/auth.routes');
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

    // Define a SurrealDB database token that trusts the gateway session JWT.
    // When GATEWAY_USE_JWT_AS_SURREAL_TOKEN=true, the SPA authenticates to
    // SurrealDB using the JWT directly — SurrealDB verifies the HS256
    // signature using GATEWAY_JWT_SECRET and makes the claims (sub, login,
    // roles, typ) available via $auth in PERMISSIONS expressions.
    try {
      const secret = process.env.GATEWAY_JWT_SECRET;
      const client = await getClient();
      const escapedSecret = String(secret).replace(/'/g, "\\'");
      await client.query(
        `DEFINE TOKEN posr_session ON DATABASE TYPE HS256 VALUE '${escapedSecret}';`
      );
      console.log('Defined SurrealDB token posr_session (HS256) for JWT-based auth');
      if (String(process.env.GATEWAY_USE_JWT_AS_SURREAL_TOKEN || '').toLowerCase() === 'true') {
        console.log('GATEWAY_USE_JWT_AS_SURREAL_TOKEN=true — SPA will authenticate with the session JWT (RBAC active)');
      } else {
        console.log('GATEWAY_USE_JWT_AS_SURREAL_TOKEN not set — SPA uses root access token (RBAC permissions defined but dormant)');
      }
    } catch (err) {
      console.warn('Failed to define SurrealDB token posr_session:', err.message);
      console.warn('JWT-based auth will not work until this succeeds. RBAC permissions are dormant.');
    }
  })
  .catch((err) => {
    console.warn('SurrealDB connection failed at startup (will retry on request):', err.message);
  });
