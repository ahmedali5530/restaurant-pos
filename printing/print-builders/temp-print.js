'use strict';

const { normalizeConfig, printReceiptHeader } = require('../lib/receipt-helpers');
const { printBillLayout } = require('../lib/bill-layout');
const { mapOrderToTemp } = require('../lib/order-mapping');

/**
 * Temp print – Pre-Sale Bill (no payments/change).
 * Expects data: { order: Order, qrcodes?, qrcode? }. Order from src/api/model/order.ts.
 */
function build(printer, data = {}, config = {}) {
  const order = data && data.order;
  if (!order) {
    return Promise.reject(new Error('data.order is required for temp print'));
  }

  const cfg = normalizeConfig(config);
  const bill = mapOrderToTemp(order, {
    showInclusivePrices: !!cfg.showInclusivePrices,
    labels: cfg.labels,
    timezone: cfg.timezone,
    locale: cfg.locale,
  });

  // If order has no tax but data.taxes is provided (array of Tax), compute per-tax rows
  // and replace the single Total line with per-tax totals (temp print only).
  const taxes = Array.isArray(data.taxes) ? data.taxes : [];
  let billToPrint = bill;

  if ((order.tax === undefined || order.tax === null) && taxes.length > 0) {
    const baseTotal = Number(bill.total || 0); // pre-tax total (from getOrderTotals: items + extras - discount + service + tip)
    const totalRows = [];

    taxes.forEach((t) => {
      const name = t && (t.name || t.title) ? (t.name || t.title) : 'Tax';
      const rate = t && typeof t.rate === 'number' ? t.rate : 0;
      const taxAmount = (baseTotal * rate) / 100;
      const taxLabel = rate ? `${name} @ ${rate}%` : name;

      // Line showing this tax and its amount
      totalRows.push({
        label: taxLabel,
        amount: taxAmount,
      });

      // Line showing total including this tax
      totalRows.push({
        label: `Total with ${taxLabel}`,
        amount: baseTotal + taxAmount,
      });
    });

    billToPrint = { ...bill, totalRows };
  }

  return printReceiptHeader(printer, cfg).then(() => {
    return printBillLayout(printer, billToPrint, cfg, {
      title: bill.title,
      qrcode: data.qrcode,
      qrcodes: data.qrcodes,
      notes: bill.note || undefined,
      showPayments: true,
      showChange: false,
      showDeliveryLine: false,
    }).then(() => printer);
  });
}

module.exports = { build };
