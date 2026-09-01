'use strict';

/**
 * Server-side audit logger for permission denials.
 *
 * SurrealDB DEFINE EVENT fires only on WRITE operations (CREATE/UPDATE/DELETE)
 * — not on SELECT. SELECT denials (e.g. a cashier trying to read payroll_run)
 * are NOT captured by events. This module logs them server-side by writing
 * directly to the audit_log table when the session-auth middleware returns
 * 401/403, or when the gateway ws-relay detects an authentication failure.
 *
 * Also logs:
 *   - Failed logins (rate limiter hits) — from auth.routes.js
 *   - Successful logins — from auth.routes.js (for login audit trail)
 *   - Session revocations — from jwt.js
 *
 * Writes are best-effort: if SurrealDB is unreachable, the audit entry is
 * logged to stderr but does NOT block the request. Audit logging must never
 * break the POS.
 *
 * See: migrations/2026_08_28_audit_log_events.surql (audit_log table schema)
 * See: RBAC-DESIGN.md → "Audit logging" section
 */

const logger = {
  info: (...args) => console.log('[audit]', ...args),
  warn: (...args) => console.warn('[audit]', ...args),
  error: (...args) => console.error('[audit]', ...args),
};

let surrealClient = null;

function setSurrealClient(client) {
  surrealClient = client;
}

/**
 * Write an audit log entry. Best-effort — never throws.
 *
 * @param {object} entry
 * @param {string} entry.action       — 'login_success' | 'login_failure' | 'logout' | 'permission_denied' | 'session_revoked'
 * @param {string} [entry.actor_id]   — user id (sub claim)
 * @param {string} [entry.actor_login]
 * @param {string[]} [entry.actor_roles]
 * @param {string} [entry.table_name] — for permission_denied
 * @param {string} [entry.record_id]
 * @param {object} [entry.details]    — arbitrary metadata
 * @param {string} [entry.source]     — 'gateway-session-auth' | 'gateway-ws-relay' | 'gateway-auth-routes' | 'gateway-jwt'
 */
async function log(entry) {
  if (!entry || !entry.action) {
    logger.warn('log() called without action', entry);
    return;
  }

  const payload = {
    occurred_at: new Date().toISOString(),
    actor_id: entry.actor_id || null,
    actor_login: entry.actor_login || null,
    actor_roles: Array.isArray(entry.actor_roles) ? entry.actor_roles : [],
    action: entry.action,
    table_name: entry.table_name || null,
    record_id: entry.record_id || null,
    changed_fields: [],
    source: entry.source || 'gateway',
    details: entry.details || null,
  };

  // Best-effort write to Surreal. If it fails, log to stderr and continue.
  if (!surrealClient) {
    logger.warn('No Surreal client — audit entry logged to stderr only:', payload);
    return;
  }

  try {
    await surrealClient.query(
      `CREATE audit_log CONTENT $data;`,
      { data: payload }
    );
  } catch (err) {
    // Never throw — audit logging must not break the POS.
    logger.error('Failed to write audit log entry:', err.message, payload);
  }
}

/**
 * Log a permission denial (401/403 from session-auth middleware).
 * Called from the session-auth middleware when a request is rejected.
 */
async function logPermissionDenied(req, status, error) {
  const token = extractBearer(req);
  let actor = null;
  if (token) {
    // Try to decode the JWT payload (without verifying — it may be invalid,
    // which is exactly why we're logging the denial).
    try {
      const parts = String(token).split('.');
      if (parts.length === 3) {
        const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
        actor = payload;
      }
    } catch {
      // Invalid token — actor stays null (we log what we can).
    }
  }

  await log({
    action: 'permission_denied',
    actor_id: actor?.sub,
    actor_login: actor?.login,
    actor_roles: actor?.roles,
    table_name: null,
    details: {
      method: req.method,
      path: req.path || req.url,
      status,
      error: error || null,
      ip: req.socket?.remoteAddress || req.ip,
      user_agent: req.headers?.['user-agent']?.slice(0, 200),
    },
    source: 'gateway-session-auth',
  });
}

function extractBearer(req) {
  const header = req.get?.('authorization') || req.headers?.authorization || '';
  const match = String(header).match(/^Bearer\s+(.+)$/i);
  if (match) return match[1].trim();
  if (req.query?.token) return String(req.query.token);
  return null;
}

/**
 * Log a successful login (for the login audit trail).
 */
async function logLoginSuccess(userId, login, roles, ip) {
  await log({
    action: 'login_success',
    actor_id: String(userId),
    actor_login: login,
    actor_roles: roles,
    details: { ip },
    source: 'gateway-auth-routes',
  });
}

/**
 * Log a failed login attempt (rate limiter / wrong credentials).
 */
async function logLoginFailure(login, ip, reason) {
  await log({
    action: 'login_failure',
    actor_login: login,
    details: { ip, reason },
    source: 'gateway-auth-routes',
  });
}

/**
 * Log a session revocation (logout).
 */
async function logSessionRevoked(jti, userId, login) {
  await log({
    action: 'session_revoked',
    actor_id: userId ? String(userId) : null,
    actor_login: login,
    details: { jti },
    source: 'gateway-jwt',
  });
}

module.exports = {
  setSurrealClient,
  log,
  logPermissionDenied,
  logLoginSuccess,
  logLoginFailure,
  logSessionRevoked,
  _TABLE: 'audit_log',
};
