-- Migration: 2026_08_27_revoked_session_store.surql
--
-- Durable session revocation table.
--
-- Previously the auth gateway kept revoked JTIs in an in-memory `Set`, which
-- meant a process restart re-validated already-revoked sessions (until their
-- natural TTL expired). This migration provisions the table the new
-- `revocation-store.js` module writes to, so logouts survive restarts.
--
-- See: gateway/src/revocation-store.js
-- See: gateway/src/jwt.js (verifySession / revokeSession)

DEFINE TABLE IF NOT EXISTS revoked_session SCHEMAFULL PERMISSIONS FULL;

DEFINE FIELD IF NOT EXISTS jti          ON revoked_session TYPE string;
DEFINE FIELD IF NOT EXISTS revoked_at   ON revoked_session TYPE datetime DEFAULT time::now();
DEFINE FIELD IF NOT EXISTS expires_at   ON revoked_session TYPE datetime;

-- One row per jti. CREATE with the same id is idempotent.
DEFINE INDEX IF NOT EXISTS revoked_session_jti ON revoked_session FIELDS jti UNIQUE;

-- Allow efficient GC of expired rows:
DEFINE INDEX IF NOT EXISTS revoked_session_expires_at ON revoked_session FIELDS expires_at;
