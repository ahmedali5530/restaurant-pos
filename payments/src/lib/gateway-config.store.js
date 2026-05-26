'use strict';

const { PaymentGateway } = require('../gateways/gateway.types');
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

function mapMpesaCredentials(config, mode) {
  const consumerKey = config?.client_id;
  const consumerSecret = config?.client_secret;
  const passkey = config?.integrity_salt;
  const shortcode = config?.merchant_id;

  if (!consumerKey || !consumerSecret) {
    throw new Error(
      'M-Pesa gateway config is incomplete. Set Consumer Key, Consumer Secret, Passkey, and Shortcode on the payment type.'
    );
  }

  const transactionType = (config?.public_key || '').trim() || 'CustomerPayBillOnline';

  return {
    consumerKey: String(consumerKey).trim(),
    consumerSecret: String(consumerSecret).trim(),
    passkey: String(passkey).trim(),
    shortcode: String(shortcode).trim(),
    transactionType,
    mode: mode === 'live' ? 'live' : 'sandbox',
  };
}

async function loadPaymentTypeGatewayConfig(paymentTypeId) {
  const client = await getClient();
  const recordId = normalizeRecordId(paymentTypeId);

  logger.info('gateway-config', 'Loading payment type config', { paymentTypeId: recordId });

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
    logger.warn('gateway-config', 'Payment type not found', { paymentTypeId: recordId, rawResult: result });
    throw new Error(`Payment type not found: ${recordId}`);
  }

  logger.info('gateway-config', 'Payment type loaded', {
    paymentTypeId: recordId,
    gateway: paymentType.gateway,
    gateway_mode: paymentType.gateway_mode,
    type: paymentType.type,
    has_gateway_config: !!paymentType.gateway_config,
  });

  const gateway = String(paymentType.gateway || '').toLowerCase();
  if (gateway !== PaymentGateway.MPESA) {
    throw new Error(`Payment type ${recordId} is not configured for M-Pesa (gateway: ${gateway || 'none'})`);
  }

  const typeName = String(paymentType.type || '').toLowerCase();
  if (typeName !== 'remote') {
    throw new Error(`Payment type ${recordId} must be Remote for M-Pesa`);
  }

  const gatewayConfig = paymentType.gateway_config;
  if (!gatewayConfig || typeof gatewayConfig !== 'object') {
    throw new Error(`Payment type ${recordId} has no gateway_config`);
  }

  const mode = paymentType.gateway_mode === 'live' ? 'live' : 'sandbox';
  const mpesa = mapMpesaCredentials(gatewayConfig, mode);

  logger.info('gateway-config', 'M-Pesa credentials mapped', logger.sanitizeMpesaCredentials(mpesa));

  return {
    paymentTypeId: recordId,
    mode,
    gateway,
    mpesa,
  };
}

module.exports = {
  loadPaymentTypeGatewayConfig,
  mapMpesaCredentials,
  normalizeRecordId,
};
