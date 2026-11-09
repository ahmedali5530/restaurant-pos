'use strict';

const { normalizeConfig, printReceiptHeader, sendCashDrawerPulse } = require('../lib/receipt-helpers');
const { printBillLayout } = require('../lib/bill-layout');
const { mapOrderToFinal } = require('../lib/order-mapping');

/**
 * Final print – Final Bill + payments + Change.
 * Expects data: { order: Order, duplicate?: boolean, qrcodes?: Array<{value, description}>, qrcode?: string }.
 */
function build(printer, data = {}, config = {}) {
  const order = data && data.order;
  if (!order) {
    return Promise.reject(new Error('data.order is required for final print'));
  }

  const cfg = normalizeConfig(config);
  const bill = mapOrderToFinal(order, {
    duplicate: !!data.duplicate,
    showInclusivePrices: !!cfg.showInclusivePrices,
    accumulateSameItems: !!cfg.accumulateSameItems,
    labels: cfg.labels,
    timezone: cfg.timezone,
    locale: cfg.locale,
  });

  return printReceiptHeader(printer, cfg).then(() => {
    return printBillLayout(printer, bill, cfg, {
      title: bill.title,
      customerName: bill.customerName,
      phone: bill.phone,
      address: bill.address,
      qrcode: data.qrcode,
      qrcodes: data.qrcodes,
      thankYou: bill.thankYou,
      showPayments: true,
      showChange: true,
      showDeliveryLine: false,
      isFinal: true,
    }).then(() => {
      sendCashDrawerPulse(printer);
      return printer;
    });
  });
}

module.exports = { build };
