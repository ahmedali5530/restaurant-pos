'use strict';

const { PaymentGateway } = require('./gateway.types');
const { StripeGateway } = require('./drivers/stripe.gateway');
const { PaypalGateway } = require('./drivers/paypal.gateway');
const { RazorpayGateway } = require('./drivers/razorpay.gateway');
const { JazzcashGateway } = require('./drivers/jazzcash.gateway');
const { MpesaGateway } = require('./drivers/mpesa.gateway');

function getGatewayDriver(gateway) {
  switch ((gateway || '').toLowerCase()) {
    case PaymentGateway.STRIPE:
      return new StripeGateway();
    case PaymentGateway.PAYPAL:
      return new PaypalGateway();
    case PaymentGateway.RAZORPAY:
      return new RazorpayGateway();
    case PaymentGateway.JAZZCASH:
      return new JazzcashGateway();
    case PaymentGateway.MPESA:
      return new MpesaGateway();
    default:
      throw new Error(`Unsupported payment gateway: ${gateway}`);
  }
}

module.exports = { getGatewayDriver };
