'use strict';

/**
 * Encryption for payment-gateway credentials at rest.
 *
 * The `payments` service stores gateway credentials (Stripe secret key, M-Pesa
 * consumer secret, Telebirr RSA private key, etc.) in the `payment_type`
 * table's `gateway_config` field. Previously this was a plain JSON object —
 * anyone with DB read access gets live payment keys.
 *
 * This module encrypts the entire `gateway_config` blob with AES-256-GCM
 * before it is written to Surreal, and decrypts it transparently on read.
 * The `gateway-config.store.js` loader handles the fallback to legacy
 * plaintext payloads so operators can migrate incrementally.
 *
 * Key: PAYMENT_CREDENTIAL_ENCRYPTION_KEY env var (64 hex chars or >= 32 UTF-8
 * bytes). In production (NODE_ENV=production) encrypt() throws if the key is
 * unset — refusing to persist plaintext credentials. In development it falls
 * back to a `PLAINTEXT:` prefix with a warning, mirroring the
 * `token.crypto.js` pattern used by the api service for OAuth tokens.
 *
 * Algorithm: AES-256-GCM with random 16-byte IV + 16-byte auth tag prepended.
 * Storage format (base64): [version:1][iv:16][authTag:16][ciphertext]
 */

const crypto = require('crypto');
const logger = require('./logger');

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;
const VERSION_BYTE = 0x01; // bump if we ever change the format

const IS_PROD = String(process.env.NODE_ENV || '').toLowerCase() === 'production';

let plaintextRefusalLogged = false;

function getEncryptionKey() {
  // Prefer PAYMENT_CREDENTIAL_ENCRYPTION_KEY; fall back to
  // INTEGRATION_TOKEN_ENCRYPTION_KEY so a single key can protect both
  // OAuth tokens (api) and payment credentials (payments). Documented in
  // SECURITY.md.
  const raw =
    process.env.PAYMENT_CREDENTIAL_ENCRYPTION_KEY ||
    process.env.INTEGRATION_TOKEN_ENCRYPTION_KEY;

  if (!raw) {
    if (IS_PROD) {
      if (!plaintextRefusalLogged) {
        logger.error(
          'crypto',
          'PAYMENT_CREDENTIAL_ENCRYPTION_KEY (or INTEGRATION_TOKEN_ENCRYPTION_KEY) is not set ' +
            'and NODE_ENV=production — refusing to encrypt payment credentials. ' +
            'Generate with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))" and restart.'
        );
        plaintextRefusalLogged = true;
      }
      return null;
    }
    logger.warn(
      'crypto',
      'No payment credential encryption key set — credentials stored as plain text. ' +
        'Set PAYMENT_CREDENTIAL_ENCRYPTION_KEY or NODE_ENV=production to enforce encryption.'
    );
    return null;
  }

  try {
    const isHex = /^[0-9a-fA-F]+$/.test(raw) && raw.length === 64;
    if (isHex) {
      return Buffer.from(raw, 'hex');
    }
    const buf = Buffer.from(raw, 'utf8');
    if (buf.length < 32) {
      logger.error('crypto', 'Encryption key must be 64 hex chars or >= 32 bytes');
      return null;
    }
    return buf.slice(0, 32);
  } catch {
    logger.error('crypto', 'Failed to parse encryption key');
    return null;
  }
}

/**
 * Encrypt a JSON-serialisable object (the gateway_config blob).
 * Returns a base64 string prefixed with `enc:v1:` so readers can detect the
 * format without trying to JSON.parse it.
 *
 * In production with no key configured, throws — never silently stores
 * plaintext. In development, returns `PLAINTEXT:<json>` for backward compat.
 */
function encryptGatewayConfig(config) {
  const key = getEncryptionKey();
  const plaintext = JSON.stringify(config);

  if (!key) {
    if (IS_PROD) {
      throw new Error(
        'PAYMENT_CREDENTIAL_ENCRYPTION_KEY is not set; refusing to encrypt payment credentials in production. ' +
          'Set the env var (64 hex chars) and restart the payments service.'
      );
    }
    return `PLAINTEXT:${plaintext}`;
  }

  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  // [version:1][iv:16][authTag:16][ciphertext]
  const payload = Buffer.concat([Buffer.from([VERSION_BYTE]), iv, authTag, encrypted]);
  return `enc:v1:${payload.toString('base64')}`;
}

/**
 * Decrypt a value produced by encryptGatewayConfig(). Accepts:
 *   - `enc:v1:<base64>`           → AES-256-GCM encrypted (current)
 *   - `PLAINTEXT:<json>`           → legacy dev-mode plaintext (backward compat)
 *   - a plain object               → original unencrypted format (migration path)
 *
 * Returns the original config object, or null if the value is falsy.
 * Throws on tampering (GCM auth tag mismatch) or malformed input.
 */
function decryptGatewayConfig(stored) {
  if (stored == null) {
    return null;
  }
  // Already a plain object — the row was written before encryption existed.
  // Return as-is so operators can migrate at their own pace.
  if (typeof stored === 'object' && !Array.isArray(stored)) {
    return stored;
  }
  if (typeof stored !== 'string') {
    throw new Error(`Cannot decrypt gateway_config: unexpected type ${typeof stored}`);
  }

  // Legacy plaintext dev-mode value.
  if (stored.startsWith('PLAINTEXT:')) {
    if (IS_PROD) {
      logger.warn(
        'crypto',
        'Decrypting a PLAINTEXT: payment credential in production — re-save the payment type to encrypt it at rest.'
      );
    }
    return JSON.parse(stored.slice('PLAINTEXT:'.length));
  }

  // Current encrypted format.
  if (stored.startsWith('enc:v1:')) {
    const key = getEncryptionKey();
    if (!key) {
      logger.warn('crypto', 'Cannot decrypt gateway_config — no encryption key configured');
      return null;
    }
    const buf = Buffer.from(stored.slice('enc:v1:'.length), 'base64');
    if (buf.length < 1 + IV_LENGTH + AUTH_TAG_LENGTH) {
      throw new Error('Encrypted gateway_config payload is too short');
    }
    const version = buf[0];
    if (version !== VERSION_BYTE) {
      throw new Error(`Unsupported gateway_config encryption version: ${version}`);
    }
    const iv = buf.slice(1, 1 + IV_LENGTH);
    const authTag = buf.slice(1 + IV_LENGTH, 1 + IV_LENGTH + AUTH_TAG_LENGTH);
    const encrypted = buf.slice(1 + IV_LENGTH + AUTH_TAG_LENGTH);
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
    decipher.setAuthTag(authTag);
    const plaintext = Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
    return JSON.parse(plaintext);
  }

  // Unknown format — could be a JSON string that was never encrypted.
  // Try parsing it as a fallback (some drivers may have stored a stringified
  // object directly). If that fails, surface the error.
  try {
    return JSON.parse(stored);
  } catch {
    throw new Error(`Unrecognised gateway_config format (prefix: ${stored.slice(0, 20)}…)`);
  }
}

/** True when the stored value is in the encrypted format (vs plaintext/legacy). */
function isEncrypted(stored) {
  return typeof stored === 'string' && stored.startsWith('enc:v1:');
}

/** True when the stored value is the legacy dev-mode plaintext format. */
function isLegacyPlaintext(stored) {
  return typeof stored === 'string' && stored.startsWith('PLAINTEXT:');
}

module.exports = {
  encryptGatewayConfig,
  decryptGatewayConfig,
  isEncrypted,
  isLegacyPlaintext,
  isProductionMode: () => IS_PROD,
  _VERSION_BYTE: VERSION_BYTE,
};
