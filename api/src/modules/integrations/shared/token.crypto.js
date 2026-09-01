'use strict';

/**
 * Provider-agnostic token encryption for OAuth credentials.
 * Shared by all cloud accounting providers (QBO, Xero, ...).
 *
 * Encryption key: INTEGRATION_TOKEN_ENCRYPTION_KEY environment variable
 * (32-byte hex string). If unset:
 *   - NODE_ENV=production: encrypt() throws (refuses to start serving requests
 *     that would otherwise persist plaintext OAuth tokens). decrypt() still
 *     accepts PLAINTEXT: payloads so an existing store can be migrated after
 *     the operator sets the key.
 *   - otherwise (dev/test): tokens are stored with a `PLAINTEXT:` prefix and a
 *     warning — convenient for local docker-compose without forcing operators
 *     to generate a key for the first run.
 * Algorithm: AES-256-GCM with random 16-byte IV prepended.
 */

const crypto = require('crypto');
const logger = require('../../../lib/logger');

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;

const IS_PROD = String(process.env.NODE_ENV || '').toLowerCase() === 'production';

let plaintextRefusalLogged = false;

function getEncryptionKey() {
  const raw = process.env.INTEGRATION_TOKEN_ENCRYPTION_KEY;
  if (!raw) {
    if (IS_PROD) {
      // Don't spam the log per-call — this is checked on every encrypt().
      if (!plaintextRefusalLogged) {
        logger.error(
          'integrations.crypto',
          'INTEGRATION_TOKEN_ENCRYPTION_KEY is not set and NODE_ENV=production — refusing to encrypt OAuth tokens. ' +
            'Generate with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))" and restart.'
        );
        plaintextRefusalLogged = true;
      }
      return null;
    }
    logger.warn(
      'integrations.crypto',
      'INTEGRATION_TOKEN_ENCRYPTION_KEY not set — tokens stored as plain text (not suitable for production). ' +
        'Set NODE_ENV=production to enforce encryption.'
    );
    return null;
  }
  try {
    // Accept hex or direct bytes. Hex is preferred for env-file portability.
    const isHex = /^[0-9a-fA-F]+$/.test(raw) && raw.length === 64;
    if (isHex) {
      return Buffer.from(raw, 'hex');
    }
    // If raw is >= 32 UTF-8 bytes, use as-is truncated to 32.
    const buf = Buffer.from(raw, 'utf8');
    if (buf.length < 32) {
      logger.error('integrations.crypto', 'INTEGRATION_TOKEN_ENCRYPTION_KEY must be 64 hex chars or >= 32 bytes');
      return null;
    }
    return buf.slice(0, 32);
  } catch {
    logger.error('integrations.crypto', 'Failed to parse INTEGRATION_TOKEN_ENCRYPTION_KEY');
    return null;
  }
}

function encrypt(plaintext) {
  const key = getEncryptionKey();
  if (!key) {
    if (IS_PROD) {
      // Hard refusal — never silently store plaintext OAuth tokens in production.
      throw new Error(
        'INTEGRATION_TOKEN_ENCRYPTION_KEY is not set; refusing to encrypt OAuth token in production. ' +
          'Set the env var (64 hex chars) and restart the API.'
      );
    }
    return `PLAINTEXT:${plaintext}`;
  }
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, encrypted]).toString('base64');
}

function decrypt(ciphertext) {
  if (!ciphertext) {
    return undefined;
  }
  if (String(ciphertext).startsWith('PLAINTEXT:')) {
    // Allow reading legacy plaintext payloads so operators can migrate to
    // encrypted storage by setting the key and re-saving each credential.
    if (IS_PROD) {
      logger.warn(
        'integrations.crypto',
        'Decrypting a PLAINTEXT: credential in production — re-save the OAuth connection to encrypt it at rest.'
      );
    }
    return String(ciphertext).slice('PLAINTEXT:'.length);
  }
  const key = getEncryptionKey();
  if (!key) {
    logger.warn('integrations.crypto', 'Cannot decrypt — no encryption key configured');
    return undefined;
  }
  try {
    const buf = Buffer.from(String(ciphertext), 'base64');
    const iv = buf.slice(0, IV_LENGTH);
    const authTag = buf.slice(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
    const encrypted = buf.slice(IV_LENGTH + AUTH_TAG_LENGTH);
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
    decipher.setAuthTag(authTag);
    return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
  } catch (err) {
    logger.error('integrations.crypto', 'Failed to decrypt OAuth token', { error: err.message });
    return undefined;
  }
}

module.exports = { encrypt, decrypt, isProductionMode: () => IS_PROD };
