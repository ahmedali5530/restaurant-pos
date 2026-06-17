'use strict';

const { getGatewayDriver, listGateways } = require('../gateways/gateway.factory');

const SupportedGateways = new Set(listGateways());

function assertObject(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new Error('Request body must be a JSON object');
  }
}

function requireField(body, field) {
  if (body[field] === undefined || body[field] === null || body[field] === '') {
    throw new Error(`${field} is required`);
  }
}

function normalizeGateway(input) {
  const gateway = String(input || '').toLowerCase();
  if (!SupportedGateways.has(gateway)) {
    throw new Error(`Unsupported payment gateway: ${input}`);
  }
  return gateway;
}

function validateGatewayRequirements(gateway, body, metadata, phase) {
  const driver = getGatewayDriver(gateway);

  if (driver.requiresPaymentTypeId && !metadata.paymentTypeId) {
    throw new Error(`metadata.paymentTypeId is required for ${gateway} gateway`);
  }

  if (phase === 'verify' && driver.requiresIntentIdOnVerify && !body.intentId) {
    throw new Error(`intentId is required for ${gateway} gateway verify`);
  }
}

function validateCreateIntentRequest(body) {
  assertObject(body);
  requireField(body, 'gateway');
  requireField(body, 'amount');
  requireField(body, 'currency');
  requireField(body, 'orderId');

  const gateway = normalizeGateway(body.gateway);
  const amount = Number(body.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error('amount must be a positive number');
  }

  const metadata = body.metadata || {};
  validateGatewayRequirements(gateway, body, metadata, 'create');

  return {
    gateway,
    amount,
    currency: String(body.currency).toUpperCase(),
    orderId: String(body.orderId),
    customer: body.customer || {},
    returnUrl: body.returnUrl || null,
    cancelUrl: body.cancelUrl || null,
    metadata,
  };
}

function validateVerifyRequest(body) {
  assertObject(body);
  requireField(body, 'gateway');
  const gateway = normalizeGateway(body.gateway);
  const metadata = body.metadata || {};
  validateGatewayRequirements(gateway, body, metadata, 'verify');

  return {
    gateway,
    paymentId: body.paymentId || null,
    intentId: body.intentId || null,
    orderId: body.orderId || null,
    metadata,
    payload: body.payload || {},
  };
}

function parseWebhookBody(rawBody) {
  if (!rawBody) return {};
  const asText = Buffer.isBuffer(rawBody) ? rawBody.toString('utf8') : String(rawBody);
  if (!asText) return {};
  try {
    return JSON.parse(asText);
  } catch (err) {
    return { raw: asText };
  }
}

function validateCaptureRequest(body) {
  assertObject(body);
  requireField(body, 'gateway');
  requireField(body, 'intentId');
  const gateway = normalizeGateway(body.gateway);
  const metadata = body.metadata || {};
  validateGatewayRequirements(gateway, body, metadata, 'verify');

  return {
    gateway,
    intentId: String(body.intentId),
    orderId: body.orderId || null,
    metadata,
    payload: body.payload || {},
  };
}

module.exports = {
  validateCreateIntentRequest,
  validateVerifyRequest,
  validateCaptureRequest,
  normalizeGateway,
  parseWebhookBody,
};
