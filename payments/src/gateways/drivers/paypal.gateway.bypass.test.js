'use strict';

/**
 * Regression tests for the PayPal webhook signature bypass.
 *
 * Previously the PayPal driver defaulted `signatureValid = true` and only
 * ran verification when `body.metadata.paymentTypeId` was present. That meant
 * any caller who knew an orderKey (predictable: `order:<invoiceNumber>`)
 * could POST a forged webhook without a paymentTypeId and have it persisted
 * to the `payment_webhook` table — which the POS then polls and treats as a
 * paid result. This is the most exploitable defect in the payments service.
 *
 * These tests pin the fail-closed behaviour so a future "convenience"
 * change cannot reintroduce the bypass.
 *
 * Uses Node's built-in test runner (node --test). Run from the payments
 * service directory:
 *   node --test src/gateways/drivers/paypal.gateway.bypass.test.js
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

// Stub modules that the driver imports but we don't want to exercise.
// We install them into require.cache before the first require() of the driver.
function installStubs({ verifyWebhook, loadConfig }) {
  // paypal/paypal.client — exports parsePaypalWebhookEvent + verifyWebhook
  const paypalClientPath = require.resolve('../paypal/paypal.client');
  require.cache[paypalClientPath] = {
    id: paypalClientPath,
    filename: paypalClientPath,
    loaded: true,
    exports: {
      parsePaypalWebhookEvent: (body) => ({
        eventType: body?.event_type || 'CHECKOUT.ORDER.APPROVED',
        eventId: body?.id || 'evt_test',
        orderId: body?.resource?.id || 'order_test',
      }),
      verifyWebhook: verifyWebhook || (async () => {
        throw new Error('verifyWebhook stub not configured');
      }),
    },
  };
  // gateway-config.store — loadPaymentTypeGatewayConfig
  const configStorePath = require.resolve('../../lib/gateway-config.store');
  require.cache[configStorePath] = {
    id: configStorePath,
    filename: configStorePath,
    loaded: true,
    exports: {
      loadPaymentTypeGatewayConfig: loadConfig || (async () => {
        throw new Error('loadPaymentTypeGatewayConfig stub not configured');
      }),
    },
  };
}

function loadDriver() {
  const modPath = require.resolve('./paypal.gateway.js');
  delete require.cache[modPath];
  return require('./paypal.gateway.js');
}

test('handleWebhook REJECTS when metadata.paymentTypeId is missing (the bypass vector)', async () => {
  let verifyCalled = false;
  let configCalled = false;
  installStubs({
    verifyWebhook: async () => { verifyCalled = true; return true; },
    loadConfig: async () => { configCalled = true; return { credentials: {} }; },
  });
  const { PaypalGateway } = loadDriver();
  const gw = new PaypalGateway();
  const result = await gw.handleWebhook({
    body: {
      id: 'evt_1',
      event_type: 'CHECKOUT.ORDER.APPROVED',
      resource: { id: 'order_INV001' },
      metadata: {}, // No paymentTypeId — this used to bypass signature verification.
    },
    headers: {},
    signature: null,
    rawBody: '{"id":"evt_1"}',
  });
  assert.equal(result.status, 'rejected', 'must be REJECTED, not RECEIVED');
  assert.equal(result.normalizedData.signatureValid, false);
  assert.equal(result.normalizedData.signatureVerificationSkipped, true);
  assert.equal(verifyCalled, false, 'verifyWebhook must NOT be called when paymentTypeId is missing');
  assert.equal(configCalled, false, 'loadPaymentTypeGatewayConfig must NOT be called when paymentTypeId is missing');
});

test('handleWebhook REJECTS when paymentTypeId present but webhookId not configured', async () => {
  let verifyCalled = false;
  installStubs({
    verifyWebhook: async () => { verifyCalled = true; return true; },
    loadConfig: async () => ({ credentials: {} }), // no webhookId
  });
  const { PaypalGateway } = loadDriver();
  const gw = new PaypalGateway();
  const result = await gw.handleWebhook({
    body: {
      id: 'evt_2',
      event_type: 'CHECKOUT.ORDER.APPROVED',
      resource: { id: 'order_INV002' },
      metadata: { paymentTypeId: 'payment_type_1' },
    },
    headers: {},
    signature: null,
    rawBody: '{"id":"evt_2"}',
  });
  assert.equal(result.status, 'rejected');
  assert.equal(result.normalizedData.signatureValid, false);
  assert.equal(verifyCalled, false, 'verifyWebhook must NOT be called without a webhookId');
});

test('handleWebhook accepts unsigned webhooks only when PAYPAL_ALLOW_UNSIGNED_WEBHOOKS=true', async () => {
  process.env.PAYPAL_ALLOW_UNSIGNED_WEBHOOKS = 'true';
  try {
    installStubs({
      verifyWebhook: async () => { throw new Error('should not be called'); },
      loadConfig: async () => { throw new Error('should not be called'); },
    });
    const { PaypalGateway } = loadDriver();
    const gw = new PaypalGateway();
    const result = await gw.handleWebhook({
      body: {
        id: 'evt_3',
        event_type: 'CHECKOUT.ORDER.APPROVED',
        resource: { id: 'order_INV003' },
        metadata: {},
      },
      headers: {},
      signature: null,
      rawBody: '{"id":"evt_3"}',
    });
    assert.equal(result.status, 'received', 'unsigned webhook accepted under explicit dev opt-in');
    assert.equal(result.normalizedData.signatureValid, true);
  } finally {
    delete process.env.PAYPAL_ALLOW_UNSIGNED_WEBHOOKS;
  }
});

test('handleWebhook default (no env, no paymentTypeId) is REJECTED', async () => {
  delete process.env.PAYPAL_ALLOW_UNSIGNED_WEBHOOKS;
  installStubs({
    verifyWebhook: async () => { throw new Error('should not be called'); },
    loadConfig: async () => { throw new Error('should not be called'); },
  });
  const { PaypalGateway } = loadDriver();
  const gw = new PaypalGateway();
  const result = await gw.handleWebhook({
    body: { id: 'evt_4', event_type: 'CHECKOUT.ORDER.APPROVED', resource: { id: 'order_X' }, metadata: {} },
    headers: {},
    signature: null,
    rawBody: '{}',
  });
  assert.equal(result.status, 'rejected');
});
