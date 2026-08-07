'use strict';

const {
  printCenteredText,
  printFixedLine,
  printLineLeftRight,
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

  // One line: "Order# 42 | New Order" (ASCII separator only — middot garble on thermal printers)
  const orderPart = orderId ? `${orderNumberLabel} ${orderId}` : '';
  const bannerPart = bannerLabel ? String(bannerLabel) : '';
  let orderBannerLine = '';
  if (orderPart && bannerPart) {
    orderBannerLine = `${orderPart} | ${bannerPart}`;
  } else {
    orderBannerLine = orderPart || bannerPart;
  }
  if (orderBannerLine) {
    printCenteredText(printer, orderBannerLine, { style: 'bold', size: 'medium' });
  }

  // Two meta lines: Table | Order Type, Order Taker | Time
  const tableLeft = table ? `${tableLabel}: ${table}` : '';
  const typeRight = orderType ? `${orderTypeLabel}: ${orderType}` : '';
  if (tableLeft || typeRight) {
    printLineLeftRight(printer, tableLeft, typeRight);
  }

  const takerLeft = orderTaker ? `${orderTakerLabel}: ${orderTaker}` : '';
  const timeRight = createdAt != null && createdAt !== '' ? `${timeLabel}: ${createdAt}` : '';
  if (takerLeft || timeRight) {
    printLineLeftRight(printer, takerLeft, timeRight);
  }

  extraLines.forEach((line) => {
    if (line && line.value) {
      printFixedLine(printer, `${line.label}: ${String(line.value).slice(0, 40)}`, { align: 'left' });
    }
  });

  printDivider(printer);
}

module.exports = { printKotHeader };
