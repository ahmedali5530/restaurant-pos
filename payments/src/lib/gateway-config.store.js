'use strict';

const { getGatewayDriver } = require('../gateways/registry');
const { getClient } = require('./surreal-client');
const logger = require('./logger');
const {
  decryptGatewayConfig,
  isEncrypted,
  isLegacyPlaintext,
} = require('./payment-credential.crypto');

function normalizeRecordId(id) {
  const text = String(id || '').trim();
  if (!text) {
    throw new Error('paymentTypeId is required');
  }
  if (text.includes(':')) {
    return text;
  }
  return `payment_type:${text}`;
}

/**
 * Selects the gateway_config from a payment_type row, preferring the
 * encrypted field when present. Returns the decrypted config object, or the
 * legacy plaintext object if no encrypted field exists.
 *
 * Supports three storage shapes (see payment-credential.crypto.js):
 *   1. gateway_config_encrypted = "enc:v1:<base64>"  (current — encrypted)
 *   2. gateway_config = "PLAINTEXT:<json>"            (legacy dev-mode)
 *   3. gateway_config = { … }                          (original unencrypted)
 */
function resolveGatewayConfig(paymentType) {
  // Prefer the encrypted field when present.
  const encrypted = paymentType.gateway_config_encrypted;
  if (encrypted != null && encrypted !== '') {
    if (typeof encrypted === 'string' && isEncrypted(encrypted)) {
      return decryptGatewayConfig(encrypted);
    }
    // An encrypted field that isn't in the expected format is a red flag —
    // surface it rather than silently falling back.
    logger.warn(
      'gateway-config',
      'gateway_config_encrypted is set but not in enc:v1: format — falling back to plaintext',
      { prefix: String(encrypted).slice(0, 20) }
    );
  }

  // Fall back to the legacy plaintext field.
  const raw = paymentType.gateway_config;
  if (raw == null) {
    return null;
  }
  if (typeof raw === 'string' && isLegacyPlaintext(raw)) {
    return decryptGatewayConfig(raw);
  }
  // Original unencrypted JSON object.
  return raw;
}

async function loadPaymentTypeGatewayConfig(paymentTypeId, gatewayId) {
  const client = await getClient();
  const recordId = normalizeRecordId(paymentTypeId);
  const expectedGateway = String(gatewayId || '').toLowerCase();

  logger.info('gateway-config', 'Loading payment type config', {
    paymentTypeId: recordId,
    gateway: expectedGateway,
  });

  let result;
  try {
    result = await client.query(
      'SELECT * FROM type::record($id) FETCH gateway_config, gateway_config_encrypted;',
      { id: recordId }
    );
  } catch (err) {
    logger.error('gateway-config', 'SurrealDB query failed', {
      paymentTypeId: recordId,
      message: err.message,
    });
    const wrapped = new Error(`Failed to load payment type config: ${err.message}`);
    wrapped.details = { paymentTypeId: recordId, step: 'surreal_query' };
    throw wrapped;
  }

  const rows = Array.isArray(result) ? result[0] : result;
  const paymentType = Array.isArray(rows) ? rows[0] : rows;

  if (!paymentType) {
    logger.warn('gateway-config', 'Payment type not found', {
      paymentTypeId: recordId,
      rawResult: result,
    });
    throw new Error(`Payment type not found: ${recordId}`);
  }

  const gateway = String(paymentType.gateway || '').toLowerCase();
  if (gateway !== expectedGateway) {
    throw new Error(
      `Payment type ${recordId} is not configured for ${expectedGateway} (gateway: ${gateway || 'none'})`
    );
  }

  const typeName = String(paymentType.type || '').toLowerCase();
  if (typeName !== 'remote') {
    throw new Error(`Payment type ${recordId} must be Remote for ${expectedGateway}`);
  }

  // SECURITY: resolve the (possibly encrypted) gateway_config transparently.
  // Drivers never see the ciphertext — they receive a plain config object.
  const gatewayConfig = resolveGatewayConfig(paymentType);
  if (!gatewayConfig || typeof gatewayConfig !== 'object') {
    throw new Error(`Payment type ${recordId} has no gateway_config`);
  }

  const mode = paymentType.gateway_mode === 'live' ? 'live' : 'sandbox';
  const driver = getGatewayDriver(expectedGateway);

  if (!driver.requiresServerConfig) {
    return {
      paymentTypeId: recordId,
      mode,
      gateway,
      credentials: null,
    };
  }

  const credentials = driver.mapCredentials(gatewayConfig, mode);
  if (!credentials) {
    throw new Error(`Gateway ${expectedGateway} requires server config but none was mapped`);
  }

  logger.info('gateway-config', 'Gateway credentials mapped', {
    paymentTypeId: recordId,
    gateway,
    mode,
    encrypted: paymentType.gateway_config_encrypted != null,
  });

  return {
    paymentTypeId: recordId,
    mode,
    gateway,
    credentials,
  };
}

module.exports = {
  loadPaymentTypeGatewayConfig,
  normalizeRecordId,
  resolveGatewayConfig,
};
