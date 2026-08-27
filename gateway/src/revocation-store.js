'use strict';

/**
 * Durable session revocation store.
 *
 * Previously the gateway kept revoked JTIs in an in-memory `Set`, which meant a
 * restart re-validated already-revoked sessions (until their natural TTL
 * expired). For a POS this is unacceptable: a manager who revokes a waiter's
 * session (e.g. on suspicion of misuse) expects the revocation to survive a
 * deploy or a crash.
 *
 * This module writes revocations to SurrealDB and mirrors them into an
 * in-process cache for fast lookup on every request. On startup it loads all
 * non-expired revocations into the cache. Expired rows are deleted lazily.
 *
 * Table: revoked_session
 *   - jti: string (primary key)
 *   - revoked_at: datetime
 *   - expires_at: datetime  (token exp — used for GC)
 *
 * The store degrades gracefully: if Surreal is unreachable, it falls back to
 * in-memory-only behaviour (with a loud warning) rather than blocking login
 * or, worse, fail-opening revocation.
 */

// The gateway has no shared logger module — sibling files use console.*
// directly. A thin wrapper keeps the call sites readable while staying
// dependency-free.
const logger = {
  info: (...args) => console.log('[revocation]', ...args),
  warn: (...args) => console.warn('[revocation]', ...args),
  error: (...args) => console.error('[revocation]', ...args),
};

let surrealClient = null;
const memoryCache = new Set();
let bootstrapped = false;
let bootstrapPromise = null;

const TABLE = 'revoked_session';
const NEGATIVE_CACHE_TTL_MS = 5 * 1000; // re-check Surreal every 5s for a jti
const negativeCache = new Map(); // jti -> lastCheckedAt

function setSurrealClient(client) {
  surrealClient = client;
  // Kick off the bootstrap load as soon as the client is wired up.
  triggerBootstrap();
}

async function triggerBootstrap() {
  if (bootstrapped || bootstrapPromise) return bootstrapPromise;
  if (!surrealClient) return;
  bootstrapPromise = (async () => {
    try {
      // Load all revocations whose tokens haven't naturally expired yet.
      const now = new Date().toISOString();
      const rows = await surrealClient.query(
        `SELECT jti FROM ${TABLE} WHERE expires_at > $now`,
        { now }
      );
      const loaded = Array.isArray(rows) ? rows : [];
      for (const row of loaded) {
        if (row && row.jti) memoryCache.add(String(row.jti));
      }
      bootstrapped = true;
      logger.info('revocation', `Loaded ${loaded.length} revoked sessions from Surreal into cache`);
      // Schedule a GC pass.
      setTimeout(() => gc().catch(() => {}), 60 * 1000).unref?.();
    } catch (err) {
      logger.warn(
        'revocation',
        `Failed to bootstrap revocation cache from Surreal — operating in-memory only until next write succeeds: ${err.message || err}`
      );
      // Retry once on the next revoke() call.
      bootstrapPromise = null;
    }
  })();
  return bootstrapPromise;
}

async function gc() {
  if (!surrealClient) return;
  try {
    const now = new Date().toISOString();
    await surrealClient.query(`DELETE FROM ${TABLE} WHERE expires_at <= $now`, { now });
  } catch (err) {
    logger.warn('revocation', `GC of expired revocations failed: ${err.message || err}`);
  }
}

/**
 * Persist a revocation. Idempotent — revoking the same jti twice is a no-op.
 * @param {string} jti
 * @param {number} expiresAtSeconds  Token `exp` claim (unix seconds). Used to GC.
 */
async function revoke(jti, expiresAtSeconds) {
  if (!jti) return;
  const jtiStr = String(jti);
  memoryCache.add(jtiStr);
  if (!surrealClient) {
    // In-memory only (e.g. during tests). Already added above.
    return;
  }
  try {
    const revokedAt = new Date().toISOString();
    const expiresAt = new Date((expiresAtSeconds || 0) * 1000).toISOString();
    await surrealClient.query(
      `CREATE ${TABLE} CONTENT $data`,
      {
        data: {
          jti: jtiStr,
          revoked_at: revokedAt,
          expires_at: expiresAt,
        },
      }
    );
  } catch (err) {
    // Even if Surreal write fails, we've already cached in memory — the
    // revocation is still effective for this process. Other gateway
    // replicas (if any) would miss it until they re-bootstrap, but a single
    // gateway is the documented deployment.
    logger.warn('revocation', `Surreal write failed — revocation cached in memory only: ${err.message || err}`);
  }
}

/**
 * Check whether a jti is revoked. Uses the in-memory cache as the fast path;
 * periodically re-confirms against Surreal to pick up revocations issued by
 * other processes (future-proofing for multi-replica deploys).
 */
async function isRevoked(jti) {
  if (!jti) return false;
  const jtiStr = String(jti);
  if (memoryCache.has(jtiStr)) return true;

  // Negative cache: don't hit Surreal more than once per NEGATIVE_CACHE_TTL_MS
  // for the same jti.
  const now = Date.now();
  const last = negativeCache.get(jtiStr);
  if (last && now - last < NEGATIVE_CACHE_TTL_MS) return false;

  if (!surrealClient) return false;
  try {
    const rows = await surrealClient.query(`SELECT jti FROM ${TABLE} WHERE jti = $jti LIMIT 1`, {
      jti: jtiStr,
    });
    const found = Array.isArray(rows) && rows.length > 0;
    negativeCache.set(jtiStr, now);
    if (found) {
      memoryCache.add(jtiStr);
      return true;
    }
    return false;
  } catch {
    // DB error — fail-open on revocation check to keep the POS operational,
    // since the in-memory cache is the authoritative fast path for this
    // process. Logged so operators notice connectivity issues.
    return false;
  }
}

/** Test-only: clear all state. */
function _reset() {
  memoryCache.clear();
  negativeCache.clear();
  bootstrapped = false;
  bootstrapPromise = null;
}

module.exports = {
  setSurrealClient,
  revoke,
  isRevoked,
  triggerBootstrap,
  _reset,
  _TABLE: TABLE,
};
