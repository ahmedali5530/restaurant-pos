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
  } = opts || {};

  hardResetLayout(printer);
  printCenteredText(printer, kitchenName || 'KOT', { style: 'bold-underline', size: 'medium' });
  printDivider(printer);

  if (bannerLabel) {
    printCenteredText(printer, bannerLabel, { style: 'bold', size: 'medium' });
  }
  if (orderId) {
    printCenteredText(printer, `Order# ${orderId}`, { style: 'bold', size: 'medium' });
  }
  if (table) printFixedLine(printer, `Table: ${table}`, { align: 'left' });
  if (orderType) printFixedLine(printer, `Order Type: ${orderType}`, { align: 'left' });
  if (orderTaker) printFixedLine(printer, `Order Taker: ${orderTaker}`, { align: 'left' });
  printFixedLine(printer, `Time: ${createdAt}`, { align: 'left' });

  extraLines.forEach((line) => {
    if (line && line.value) {
      printFixedLine(printer, `${line.label}: ${String(line.value).slice(0, 40)}`, { align: 'left' });
    }
  });

  printDivider(printer);
}

module.exports = { printKotHeader };
