'use strict';

/**
 * Backfill script: encrypt existing plaintext gateway credentials at rest.
 *
 * Walks every `payment_type` row that has a non-empty `gateway_config` but no
 * `gateway_config_encrypted`, encrypts the blob with AES-256-GCM, writes the
 * ciphertext to `gateway_config_encrypted`, and clears the legacy plaintext
 * `gateway_config` field.
 *
 * Idempotent — re-running skips rows that already have an encrypted field.
 *
 * Env vars (required — same as other migration scripts):
 *   SURREAL_URL    ws://surrealdb:8000/rpc
 *   SURREAL_NS     posr
 *   SURREAL_DB     posr
 *   SURREAL_USER   (required — no root/root fallback)
 *   SURREAL_PASS   (required)
 *   PAYMENT_CREDENTIAL_ENCRYPTION_KEY  (64 hex chars — required)
 *   DRY_RUN=1      (optional — report what would change without writing)
 *
 * Usage:
 *   SURREAL_USER=posr SURREAL_PASS=... \
 *   PAYMENT_CREDENTIAL_ENCRYPTION_KEY=<64-hex> \
 *   node migrations/scripts/encrypt-existing-payment-credentials.cjs
 *
 *   # Dry run:
 *   DRY_RUN=1 ... node migrations/scripts/encrypt-existing-payment-credentials.cjs
 */

const path = require('path');
const WS = require('ws');
const { Surreal } = require('surrealdb');

if (typeof global.WebSocket === 'undefined') {
  global.WebSocket = WS;
}

const DB_NS = process.env.SURREAL_NS || 'posr';
const DB_NAME = process.env.SURREAL_DB || 'posr';
const DB_URL = process.env.SURREAL_URL || 'ws://surrealdb:8000/rpc';
const DB_USER = process.env.SURREAL_USER;
const DB_PASS = process.env.SURREAL_PASS;
const DRY_RUN = process.env.DRY_RUN === '1' || process.env.DRY_RUN === 'true';

if (!DB_USER || !DB_PASS) {
  console.error(
    'ERROR: SURREAL_USER and SURREAL_PASS env vars are required. ' +
      'The previous root/root fallback was removed for security — set them explicitly.'
  );
  process.exit(1);
}

// Load the encryption module from the payments service (same code path the
// runtime uses — guarantees the ciphertext format matches).
const cryptoMod = require(path.resolve(
  __dirname,
  '..',
  '..',
  'payments',
  'src',
  'lib',
  'payment-credential.crypto.js'
));

const KEY_ENV = process.env.PAYMENT_CREDENTIAL_ENCRYPTION_KEY || process.env.INTEGRATION_TOKEN_ENCRYPTION_KEY;
if (!KEY_ENV) {
  console.error(
    'ERROR: PAYMENT_CREDENTIAL_ENCRYPTION_KEY (or INTEGRATION_TOKEN_ENCRYPTION_KEY) is required. ' +
      'Generate with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"'
  );
  process.exit(1);
}

async function main() {
  console.log('Connecting to', DB_URL, 'ns=' + DB_NS, 'db=' + DB_NAME);
  const db = new Surreal();
  await db.connect(DB_URL);
  await db.signin({ username: DB_USER, password: DB_PASS });
  await db.use({ namespace: DB_NS, database: DB_NAME });

  // Select all payment types that have a plaintext gateway_config but no
  // encrypted field yet. We FETCH both to check the encrypted one isn't already
  // populated.
  const rows = await db.query(
    `SELECT id, gateway, gateway_mode, type, gateway_config, gateway_config_encrypted
     FROM payment_type
     WHERE gateway_config != NONE AND gateway_config_encrypted = NONE;`
  );
  const list = Array.isArray(rows) ? rows[0] || rows : rows;
  const flat = Array.isArray(list) ? list : [list];

  console.log(`Found ${flat.length} payment type(s) with plaintext gateway_config to encrypt.`);
  if (flat.length === 0) {
    console.log('Nothing to do — all credentials are already encrypted (or none exist).');
    await db.close();
    return;
  }

  let encrypted = 0;
  let skipped = 0;
  let failed = 0;

  for (const row of flat) {
    const cfg = row.gateway_config;
    if (cfg == null) {
      console.log(`  SKIP  ${row.id}  (gateway_config cleared after migration?)`);
      skipped++;
      continue;
    }

    let ciphertext;
    try {
      // The crypto module reads the key from env at call time, so it picks up
      // KEY_ENV transparently.
      ciphertext = cryptoMod.encryptGatewayConfig(cfg);
    } catch (err) {
      console.error(`  FAIL  ${row.id}  encryption refused: ${err.message}`);
      failed++;
      continue;
    }

    if (ciphertext.startsWith('PLAINTEXT:')) {
      console.error(
        `  FAIL  ${row.id}  encryption key not configured (got PLAINTEXT fallback). ` +
          'Set PAYMENT_CREDENTIAL_ENCRYPTION_KEY before running this script.'
      );
      failed++;
      continue;
    }

    console.log(`  ${DRY_RUN ? 'DRY-RUN' : 'ENCRYPT'}  ${row.id}  gateway=${row.gateway}  mode=${row.gateway_mode || 'sandbox'}`);
    if (DRY_RUN) {
      console.log(`           would write gateway_config_encrypted (${ciphertext.length} chars) and clear gateway_config`);
      encrypted++;
      continue;
    }

    try {
      await db.query(
        `UPDATE type::record($id) MERGE {
           gateway_config_encrypted: $enc,
           gateway_config: NONE,
           credentials_updated_at: time::now()
         };`,
        { id: row.id, enc: ciphertext }
      );
      encrypted++;
    } catch (err) {
      console.error(`  FAIL  ${row.id}  write failed: ${err.message}`);
      failed++;
    }
  }

  console.log('');
  console.log(`Done. Encrypted: ${encrypted}, skipped: ${skipped}, failed: ${failed}${DRY_RUN ? ' (DRY RUN — no writes)' : ''}.`);
  await db.close();
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error('Backfill failed:', err);
  process.exit(1);
});
