'use strict';

const PaymentGateway = Object.freeze({
  STRIPE: 'stripe',
  PAYPAL: 'paypal',
  RAZORPAY: 'razorpay',
  JAZZCASH: 'jazzcash',
  MPESA: 'mpesa',
  TELEBIRR: 'telebirr',
});

const PaymentStatus = Object.freeze({
  PENDING: 'pending',
  AUTHORIZED: 'authorized',
  PAID: 'paid',
  FAILED: 'failed',
  CANCELED: 'canceled',
});

const WebhookStatus = Object.freeze({
  RECEIVED: 'received',
  IGNORED: 'ignored',
  REJECTED: 'rejected',
});

module.exports = {
  PaymentGateway,
  PaymentStatus,
  WebhookStatus,
};
