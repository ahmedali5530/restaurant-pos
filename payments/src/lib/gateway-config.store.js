'use strict';

const { getGatewayDriver } = require('../gateways/registry');
const { getClient } = require('./surreal-client');
const logger = require('./logger');

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
      'SELECT * FROM type::record($id) FETCH gateway_config;',
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

  const gatewayConfig = paymentType.gateway_config;
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
};
