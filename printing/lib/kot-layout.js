'use strict';

const {
  printCenteredText,
  printFixedLine,
  hardResetLayout,
  printDivider,
} = require('./receipt-helpers');

/**
 * Shared KOT / deletion ticket header block.
 * @param {Object} printer
 * @param {Object} opts
 * @param {string} opts.kitchenName
 * @param {string} [opts.bannerLabel] - e.g. "New Order", "ADDON", "DELETION"
 * @param {string} [opts.orderId]
 * @param {string} [opts.table]
 * @param {string} [opts.orderType]
 * @param {string} [opts.orderTaker]
 * @param {string} opts.createdAt
 * @param {Array<{ label: string, value: string }>} [opts.extraLines]
 * @param {Object} [opts.labels] - translated labels map
 */
function printKotHeader(printer, opts) {
  const {
    kitchenName,
    bannerLabel,
    orderId,
    table,
    orderType,
    orderTaker,
    createdAt,
    extraLines = [],
    labels = {},
  } = opts || {};

  const L = labels || {};
  const kotLabel = L.kot || 'KOT';
  const orderNumberLabel = L.orderNumber || 'Order#';
  const tableLabel = L.table || 'Table';
  const orderTypeLabel = L.orderType || 'Order Type';
  const orderTakerLabel = L.orderTaker || 'Order Taker';
  const timeLabel = L.time || 'Time';

  hardResetLayout(printer);
  printCenteredText(printer, kitchenName || kotLabel, { style: 'bold-underline', size: 'medium' });
  printDivider(printer);

  if (bannerLabel) {
    printCenteredText(printer, bannerLabel, { style: 'bold', size: 'medium' });
  }
  if (orderId) {
    printCenteredText(printer, `${orderNumberLabel} ${orderId}`, { style: 'bold', size: 'medium' });
  }
  if (table) printFixedLine(printer, `${tableLabel}: ${table}`, { align: 'left' });
  if (orderType) printFixedLine(printer, `${orderTypeLabel}: ${orderType}`, { align: 'left' });
  if (orderTaker) printFixedLine(printer, `${orderTakerLabel}: ${orderTaker}`, { align: 'left' });
  printFixedLine(printer, `${timeLabel}: ${createdAt}`, { align: 'left' });

  extraLines.forEach((line) => {
    if (line && line.value) {
      printFixedLine(printer, `${line.label}: ${String(line.value).slice(0, 40)}`, { align: 'left' });
    }
  });

  printDivider(printer);
}

module.exports = { printKotHeader };
