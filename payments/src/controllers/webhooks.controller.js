'use strict';

const { getGatewayDriver } = require('../gateways/gateway.factory');
const { sendSuccess, sendError } = require('../lib/response');
const { normalizeGateway, parseWebhookBody } = require('../lib/validation');
const { normalizeOrderKey } = require('../lib/intent.utils');
const { savePaymentWebhook, consumePaymentWebhook } = require('../lib/payment-webhook.store');
const { mapStoredWebhookToVerifyResponse } = require('../lib/webhook-result.mapper');
const { WebhookStatus } = require('../gateways/gateway.types');
const logger = require('../lib/logger');

async function processWebhook(gateway, rawBody, headers, signature) {
  const parsedBody = parseWebhookBody(rawBody);
  const driver = getGatewayDriver(gateway);
  return driver.handleWebhook({
    headers,
    signature,
    rawBody,
    body: parsedBody,
    eventType: parsedBody.type || parsedBody.eventType,
    eventId: parsedBody.id || parsedBody.eventId,
  });
}

async function handleWebhook(req, res, next) {
  try {
    const gateway = normalizeGateway(req.params.gateway);
    const signature =
      req.get('x-signature') ||
      req.get('stripe-signature') ||
      req.get('x-razorpay-signature') ||
      null;
    const rawBody = req.body;

    logger.info('webhook', 'Received legacy webhook', { gateway });

    const driverResult = await processWebhook(gateway, rawBody, req.headers, signature);

    const orderKey =
      driverResult.orderKey ||
      (typeof getGatewayDriver(gateway).extractOrderKeyFromWebhook === 'function'
        ? getGatewayDriver(gateway).extractOrderKeyFromWebhook(driverResult.normalizedData)
        : null);

    if (orderKey && driverResult.status === WebhookStatus.RECEIVED) {
      await savePaymentWebhook({
        key: orderKey,
        gateway,
        data: {
          raw: parseWebhookBody(rawBody),
          normalized: driverResult,
        },
      });
      logger.info('webhook', 'Stored legacy webhook', { gateway, orderKey });
    }

    sendSuccess(res, driverResult);
  } catch (err) {
    next(err);
  }
}

async function handleOrderWebhook(req, res, next) {
  try {
    const gateway = normalizeGateway(req.params.gateway);
    const orderKey = normalizeOrderKey(decodeURIComponent(req.params.orderKey));
    const signature =
      req.get('x-signature') ||
      req.get('stripe-signature') ||
      req.get('x-razorpay-signature') ||
      null;
    const rawBody = req.body;

    const driverResult = await processWebhook(gateway, rawBody, req.headers, signature);

    await savePaymentWebhook({
      key: orderKey,
      gateway,
      data: {
        raw: parseWebhookBody(rawBody),
        normalized: driverResult,
      },
    });

    logger.info('webhook', 'Stored order webhook', { gateway, orderKey });

    sendSuccess(res, driverResult);
  } catch (err) {
    next(err);
  }
}

async function getWebhookResult(req, res, next) {
  try {
    const gateway = normalizeGateway(req.params.gateway);
    const orderKey = normalizeOrderKey(decodeURIComponent(req.params.orderKey));

    const stored = await consumePaymentWebhook({ key: orderKey, gateway });
    if (!stored) {
      return sendError(res, 404, 'Webhook result not found');
    }

    const verifyResponse = mapStoredWebhookToVerifyResponse(gateway, stored);
    if (!verifyResponse) {
      return sendError(res, 422, `Unable to map webhook result for ${gateway}`);
    }

    sendSuccess(res, verifyResponse);
  } catch (err) {
    next(err);
  }
}

module.exports = {
  handleWebhook,
  handleOrderWebhook,
  getWebhookResult,
};
