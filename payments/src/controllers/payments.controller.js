'use strict';

const { getGatewayDriver } = require('../gateways/gateway.factory');
const { sendSuccess } = require('../lib/response');
const logger = require('../lib/logger');
const {
  validateCreateIntentRequest,
  validateVerifyRequest,
  validateCaptureRequest,
} = require('../lib/validation');

async function createIntent(req, res, next) {
  try {
    const payload = validateCreateIntentRequest(req.body);
    const idempotencyKey = req.get('x-idempotency-key') || null;
    const driver = getGatewayDriver(payload.gateway);
    const data = await driver.createIntent({
      ...payload,
      idempotencyKey,
    });
    logger.info('controller', 'createIntent success', {
      gateway: payload.gateway,
      intentId: data.intentId,
      status: data.status,
    });
    sendSuccess(res, data);
  } catch (err) {
    logger.error('controller', 'createIntent failed', {
      gateway: req.body?.gateway,
      message: err.message,
      details: err.details,
    });
    next(err);
  }
}

async function verifyPayment(req, res, next) {
  try {
    const payload = validateVerifyRequest(req.body);
    const driver = getGatewayDriver(payload.gateway);
    const data = await driver.verify(payload);
    logger.info('controller', 'verifyPayment success', {
      gateway: payload.gateway,
      status: data.status,
      reference: data.reference,
    });
    sendSuccess(res, data);
  } catch (err) {
    logger.error('controller', 'verifyPayment failed', {
      gateway: req.body?.gateway,
      intentId: req.body?.intentId,
      message: err.message,
      details: err.details,
    });
    next(err);
  }
}

async function capturePayment(req, res, next) {
  try {
    const payload = validateCaptureRequest(req.body);
    const driver = getGatewayDriver(payload.gateway);
    if (typeof driver.capture !== 'function') {
      throw new Error(`Gateway ${payload.gateway} does not support capture`);
    }
    const data = await driver.capture(payload);
    logger.info('controller', 'capturePayment success', {
      gateway: payload.gateway,
      status: data.status,
      reference: data.reference,
    });
    sendSuccess(res, data);
  } catch (err) {
    logger.error('controller', 'capturePayment failed', {
      gateway: req.body?.gateway,
      intentId: req.body?.intentId,
      message: err.message,
      details: err.details,
    });
    next(err);
  }
}

module.exports = {
  createIntent,
  verifyPayment,
  capturePayment,
};
