'use strict';

const { StripeGateway } = require('./drivers/stripe.gateway');
const { PaypalGateway } = require('./drivers/paypal.gateway');
const { RazorpayGateway } = require('./drivers/razorpay.gateway');
const { JazzcashGateway } = require('./drivers/jazzcash.gateway');
const { MpesaGateway } = require('./drivers/mpesa.gateway');
const { TelebirrGateway } = require('./drivers/telebirr.gateway');

const GATEWAY_REGISTRY = Object.freeze({
  stripe: () => new StripeGateway(),
  paypal: () => new PaypalGateway(),
  razorpay: () => new RazorpayGateway(),
  jazzcash: () => new JazzcashGateway(),
  mpesa: () => new MpesaGateway(),
  telebirr: () => new TelebirrGateway(),
});

function listGateways() {
  return Object.keys(GATEWAY_REGISTRY);
}

function getGatewayDriver(gateway) {
  const id = String(gateway || '').toLowerCase();
  const factory = GATEWAY_REGISTRY[id];
  if (!factory) {
    throw new Error(`Unsupported payment gateway: ${gateway}`);
  }
  return factory();
}

module.exports = {
  GATEWAY_REGISTRY,
  listGateways,
  getGatewayDriver,
};
