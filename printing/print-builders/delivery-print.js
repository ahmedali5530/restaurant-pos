'use strict';

const { normalizeConfig, printReceiptHeader } = require('../lib/receipt-helpers');
const { printBillLayout } = require('../lib/bill-layout');
const { mapOrderToDelivery } = require('../lib/order-mapping');

/**
 * Delivery print – Duplicate Final Bill format with address/phone. Expects data: { order: Order }.
 * Order from src/api/model/order.ts.
 */
function build(printer, data = {}, config = {}) {
  const order = data && data.order;
  if (!order) {
    return Promise.reject(new Error('data.order is required for delivery print'));
  }

  const cfg = normalizeConfig(config);
  const bill = mapOrderToDelivery(order, {
    showInclusivePrices: !!cfg.showInclusivePrices,
    labels: cfg.labels,
  });

  return printReceiptHeader(printer, cfg).then(() => {
    return printBillLayout(printer, bill, cfg, {
      title: bill.title,
      qrcode: data.qrcode,
      qrcodes: data.qrcodes,
      address: bill.address,
      phone: bill.phone,
      customerName: bill.customerName || undefined,
      deliveryTime: bill.deliveryTime || undefined,
      notes: bill.notes || undefined,
      showPayments: true,
      showChange: true,
      showDeliveryLine: true,
    }).then(() => printer);
  });
}

module.exports = { build };
