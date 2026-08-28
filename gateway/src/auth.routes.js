'use strict';

const express = require('express');
const { authenticatePosUser } = require('./auth.service');
const { signSession, verifySession, revokeSession, extractBearer } = require('./jwt');
const { issueSurrealAccessToken } = require('./surreal-client');
const { loginRateLimit, recordAuthResult } = require('./rate-limiter');

const router = express.Router();

router.post('/login', loginRateLimit(), async (req, res) => {
  try {
    const method = req.body?.method === 'form' ? 'form' : 'pin';
    const login = req.body?.login;
    const password = req.body?.password;

    const user = await authenticatePosUser({ method, login, password });
    if (!user) {
      // SECURITY: record the failure for both IP and login buckets. Without
      // rate limiting a 4-digit PIN can be brute-forced in ~10,000 requests,
      // which bcrypt's slow compare alone cannot prevent.
      recordAuthResult(req, false);
      return res.status(401).json({ ok: false, error: 'Invalid credentials' });
    }

    recordAuthResult(req, true);

    const session = await signSession({
      userId: user.id,
      login: user.login,
      roles: user.roles || [],
    });

    // When GATEWAY_USE_JWT_AS_SURREAL_TOKEN=true, the SPA authenticates to
    // SurrealDB using the session JWT itself (verified via DEFINE TOKEN on the
    // DB). When false (default), the gateway signs in with root and issues a
    // root-scoped access token — the legacy behaviour. See RBAC-DESIGN.md.
    const useJwtAsSurrealToken =
      String(process.env.GATEWAY_USE_JWT_AS_SURREAL_TOKEN || '').toLowerCase() === 'true';
    let surrealToken = null;
    if (useJwtAsSurrealToken) {
      surrealToken = session.token;
    } else {
      try {
        surrealToken = await issueSurrealAccessToken();
      } catch (err) {
        console.error('Failed to issue Surreal access token', err);
        return res.status(503).json({
          ok: false,
          error: 'Database session unavailable',
        });
      }
    }

    return res.json({
      ok: true,
      token: session.token,
      expiresIn: session.expiresIn,
      surrealToken,
      user,
    });
  } catch (err) {
    console.error('login error', err);
    if (err?.kind === 'NotAllowed' || /authentication/i.test(String(err?.message || ''))) {
      return res.status(503).json({
        ok: false,
        error:
          'Database authentication failed — SURREAL_USER/SURREAL_PASS must match the existing SurrealDB root user (the --user/--pass flags only apply on an empty data directory).',
      });
    }
    return res.status(500).json({ ok: false, error: 'Login failed' });
  }
});

router.get('/session', async (req, res) => {
  try {
    const payload = await verifySession(extractBearer(req));
    return res.json({ ok: true, session: payload });
  } catch (err) {
    return res.status(err.status || 401).json({ ok: false, error: err.message });
  }
});

router.post('/logout', async (req, res) => {
  try {
    const payload = await verifySession(extractBearer(req));
    // Pass the token's `exp` so the revocation store can GC expired rows
    // after the natural TTL elapses.
    await revokeSession(payload.jti, payload.exp);
    return res.json({ ok: true });
  } catch {
    // Idempotent logout
    return res.json({ ok: true });
  }
});

/**
 * Refresh Surreal access token for an existing gateway session.
 * Used when the Surreal token expires but the POS session is still valid.
 */
router.post('/db-token', async (req, res) => {
  try {
    const token = extractBearer(req);
    await verifySession(token);
    // When GATEWAY_USE_JWT_AS_SURREAL_TOKEN=true, the "Surreal token" IS the
    // session JWT — no separate root sign-in needed.
    const useJwtAsSurrealToken =
      String(process.env.GATEWAY_USE_JWT_AS_SURREAL_TOKEN || '').toLowerCase() === 'true';
    if (useJwtAsSurrealToken) {
      return res.json({ ok: true, surrealToken: token });
    }
    const surrealToken = await issueSurrealAccessToken();
    return res.json({ ok: true, surrealToken });
  } catch (err) {
    return res.status(err.status || 500).json({
      ok: false,
      error: err.message || 'Failed to refresh database token',
    });
  }
});

module.exports = router;
