'use strict';

const { sendCashDrawerPulse } = require('../lib/receipt-helpers');

/**
 * Cash drawer pulse only — no receipt content or paper cut.
 */
function build(printer) {
  sendCashDrawerPulse(printer);
  return Promise.resolve(printer);
}

module.exports = { build };
