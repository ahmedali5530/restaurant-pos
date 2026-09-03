'use strict';

/**
 * Regression tests for payment credential encryption.
 *
 * Pins the AES-256-GCM encrypt/decrypt round-trip, the format detection
 * helpers, the production-refusal path, and the backward-compat fallback for
 * legacy plaintext / plain-object payloads.
 *
 * Run from the payments service directory:
 *   node --test src/lib/payment-credential.crypto.test.js
 */

const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');

const mod = require('./payment-credential.crypto');

const SAMPLE_CONFIG = {
  client_id: 'pk_live_abc123',
  client_secret: 'sk_live_xyz789',
  webhook_secret: 'whsec_secret123',
  merchant_id: 'MID-001',
  integrity_salt: 'salt123',
  secret_key:
    '-----BEGIN RSA PRIVATE KEY-----\nMIIEpAIBAAKCAQEA...\n-----END RSA PRIVATE KEY-----',
};

beforeEach(() => {
  delete process.env.PAYMENT_CREDENTIAL_ENCRYPTION_KEY;
  delete process.env.INTEGRATION_TOKEN_ENCRYPTION_KEY;
  delete process.env.NODE_ENV;
  // Reset the module's internal "already logged" flag.
  delete require.cache[require.resolve('./payment-credential.crypto.js')];
});

afterEach(() => {
  delete process.env.PAYMENT_CREDENTIAL_ENCRYPTION_KEY;
  delete process.env.INTEGRATION_TOKEN_ENCRYPTION_KEY;
  delete process.env.NODE_ENV;
});

function freshModule() {
  delete require.cache[require.resolve('./payment-credential.crypto.js')];
  return require('./payment-credential.crypto.js');
}

test('encrypt + decrypt round-trip restores the original config', () => {
  process.env.PAYMENT_CREDENTIAL_ENCRYPTION_KEY = 'a'.repeat(64);
  const m = freshModule();
  const ciphertext = m.encryptGatewayConfig(SAMPLE_CONFIG);
  assert.ok(ciphertext.startsWith('enc:v1:'), 'ciphertext must be prefixed with enc:v1:');
  assert.ok(!ciphertext.includes('sk_live_'), 'ciphertext must not contain plaintext secret');
  assert.ok(!ciphertext.includes('BEGIN RSA'), 'ciphertext must not contain RSA key marker');

  const recovered = m.decryptGatewayConfig(ciphertext);
  assert.deepEqual(recovered, SAMPLE_CONFIG, 'decrypted config must match original');
});

test('each encryption produces a different ciphertext (random IV)', () => {
  process.env.PAYMENT_CREDENTIAL_ENCRYPTION_KEY = 'b'.repeat(64);
  const m = freshModule();
  const c1 = m.encryptGatewayConfig(SAMPLE_CONFIG);
  const c2 = m.encryptGatewayConfig(SAMPLE_CONFIG);
  assert.notEqual(c1, c2, 'IV must be random — ciphertexts must differ');
  // Both decrypt back to the same config.
  assert.deepEqual(m.decryptGatewayConfig(c1), SAMPLE_CONFIG);
  assert.deepEqual(m.decryptGatewayConfig(c2), SAMPLE_CONFIG);
});

test('decryption detects tampering (GCM auth tag)', () => {
  process.env.PAYMENT_CREDENTIAL_ENCRYPTION_KEY = 'c'.repeat(64);
  const m = freshModule();
  const ciphertext = m.encryptGatewayConfig(SAMPLE_CONFIG);
  // Flip a byte in the base64 payload (after the "enc:v1:" prefix).
  const prefix = 'enc:v1:';
  const b64 = ciphertext.slice(prefix.length);
  const buf = Buffer.from(b64, 'base64');
  buf[buf.length - 1] ^= 0x01; // flip last byte
  const tampered = prefix + buf.toString('base64');
  assert.throws(() => m.decryptGatewayConfig(tampered), /unsupported|auth|decrypt/i);
});

test('encrypt throws in production when no key is set', () => {
  process.env.NODE_ENV = 'production';
  const m = freshModule();
  assert.throws(
    () => m.encryptGatewayConfig(SAMPLE_CONFIG),
    /PAYMENT_CREDENTIAL_ENCRYPTION_KEY is not set/i,
    'production must refuse to encrypt without a key'
  );
});

test('encrypt falls back to PLAINTEXT: in dev when no key is set', () => {
  // Dev mode (NODE_ENV unset)
  const m = freshModule();
  const result = m.encryptGatewayConfig(SAMPLE_CONFIG);
  assert.ok(result.startsWith('PLAINTEXT:'), 'dev mode must produce PLAINTEXT: prefix');
  assert.ok(result.includes('sk_live_'), 'dev plaintext must contain the secret (expected)');
  // And it round-trips.
  assert.deepEqual(m.decryptGatewayConfig(result), SAMPLE_CONFIG);
});

test('decrypt accepts a plain object (original unencrypted format)', () => {
  process.env.PAYMENT_CREDENTIAL_ENCRYPTION_KEY = 'd'.repeat(64);
  const m = freshModule();
  // A plain object — the row was written before encryption existed.
  const result = m.decryptGatewayConfig(SAMPLE_CONFIG);
  assert.deepEqual(result, SAMPLE_CONFIG, 'plain object must pass through unchanged');
});

test('decrypt accepts a JSON string (another legacy format)', () => {
  process.env.PAYMENT_CREDENTIAL_ENCRYPTION_KEY = 'e'.repeat(64);
  const m = freshModule();
  const json = JSON.stringify(SAMPLE_CONFIG);
  const result = m.decryptGatewayConfig(json);
  assert.deepEqual(result, SAMPLE_CONFIG, 'JSON string must parse to the original object');
});

test('decrypt returns null for null/undefined', () => {
  process.env.PAYMENT_CREDENTIAL_ENCRYPTION_KEY = 'f'.repeat(64);
  const m = freshModule();
  assert.equal(m.decryptGatewayConfig(null), null);
  assert.equal(m.decryptGatewayConfig(undefined), null);
});

test('decrypt rejects malformed encrypted payload', () => {
  process.env.PAYMENT_CREDENTIAL_ENCRYPTION_KEY = '0'.repeat(64);
  const m = freshModule();
  // Too short to contain version + IV + auth tag + ciphertext.
  assert.throws(() => m.decryptGatewayConfig('enc:v1:AAAA'), /too short/i);
});

test('decrypt rejects unknown version byte', () => {
  process.env.PAYMENT_CREDENTIAL_ENCRYPTION_KEY = '1'.repeat(64);
  const m = freshModule();
  // Forge a payload with version byte 0xFF.
  const buf = Buffer.alloc(40);
  buf[0] = 0xff;
  const fake = 'enc:v1:' + buf.toString('base64');
  assert.throws(() => m.decryptGatewayConfig(fake), /unsupported.*version/i);
});

test('isEncrypted detects the enc:v1: prefix', () => {
  process.env.PAYMENT_CREDENTIAL_ENCRYPTION_KEY = '2'.repeat(64);
  const m = freshModule();
  const ciphertext = m.encryptGatewayConfig(SAMPLE_CONFIG);
  assert.equal(m.isEncrypted(ciphertext), true);
  assert.equal(m.isEncrypted('PLAINTEXT:{"a":1}'), false);
  assert.equal(m.isEncrypted({ a: 1 }), false);
  assert.equal(m.isEncrypted(null), false);
});

test('isLegacyPlaintext detects the PLAINTEXT: prefix', () => {
  // No key set → dev mode → PLAINTEXT: prefix
  const m = freshModule();
  const dev = m.encryptGatewayConfig(SAMPLE_CONFIG);
  assert.equal(m.isLegacyPlaintext(dev), true);
  assert.equal(m.isLegacyPlaintext('enc:v1:abc'), false);
});

test('INTEGRATION_TOKEN_ENCRYPTION_KEY is accepted as fallback key', () => {
  process.env.INTEGRATION_TOKEN_ENCRYPTION_KEY = '4'.repeat(64);
  const m = freshModule();
  const ciphertext = m.encryptGatewayConfig(SAMPLE_CONFIG);
  assert.ok(ciphertext.startsWith('enc:v1:'));
  assert.deepEqual(m.decryptGatewayConfig(ciphertext), SAMPLE_CONFIG);
});

test('large config (Telebirr with RSA private key) round-trips', () => {
  process.env.PAYMENT_CREDENTIAL_ENCRYPTION_KEY = '5'.repeat(64);
  const m = freshModule();
  // Simulate a 4KB RSA private key
  const bigKey = '-----BEGIN RSA PRIVATE KEY-----\n' + 'A'.repeat(4000) + '\n-----END RSA PRIVATE KEY-----';
  const config = { ...SAMPLE_CONFIG, secret_key: bigKey };
  const ciphertext = m.encryptGatewayConfig(config);
  assert.ok(ciphertext.length > 4000, 'ciphertext must be larger than the plaintext (GCM overhead)');
  const recovered = m.decryptGatewayConfig(ciphertext);
  assert.equal(recovered.secret_key, bigKey);
});
