'use strict';

const {
  normalizeConfig,
  printReceiptHeader,
  feedBottomMargin,
  buildItemRowStrings,
  buildItemHeaderString,
  printModifierLines,
  printFixedLine,
  printPrintingTimestamp,
} = require('../lib/receipt-helpers');
const { printKotHeader } = require('../lib/kot-layout');
const {
  getOrderId,
  getOrderCreatedAt,
  getOrderUserName,
  getOrderType,
  mapOrderItemToPrintRow,
  accumulatePrintItems,
} = require('../lib/order-mapping');

function mapPrintItems(items, accumulateSameItems) {
  const rows = (items || []).map((it) => mapOrderItemToPrintRow(it, false));
  return accumulateSameItems ? accumulatePrintItems(rows) : rows;
}

function getTableLabel(data) {
  if (data.table) {
    return String(data.table.name || '') + String(data.table.number || '');
  }
  return '';
}

/**
 * Deletion print builder.
 * Expects data: { order, items, kitchenName?, table?, reason?, comments? }
 */
function build(printer, data = {}, config = {}) {
  const order = data.order;
  const items = Array.isArray(data.items) ? data.items : [];
  const kitchenName = data.kitchenName || '';
  const reason = data.reason || '';
  const comments = data.comments || '';
  const cfg = normalizeConfig(config);

  const dateOpts = { timezone: cfg.timezone, locale: cfg.locale, dateFormat: cfg.dateFormat, timeFormat: cfg.timeFormat };
  const orderId = order ? getOrderId(order) : '';
  const createdAt = order
    ? getOrderCreatedAt(order, dateOpts)
    : getOrderCreatedAt(null, dateOpts);
  const orderTaker = order ? getOrderUserName(order) : '';
  const orderType = order ? getOrderType(order) : '';
  const table = getTableLabel(data);
  const printItems = mapPrintItems(items, !!cfg.accumulateSameItems);

  const L = cfg.labels || {};
  const extraLines = [];
  if (reason) extraLines.push({ label: L.reason || 'Reason', value: reason });
  if (comments) extraLines.push({ label: L.note || 'Note', value: comments });

  return printReceiptHeader(printer, cfg).then(() => {
    printKotHeader(printer, {
      kitchenName,
      bannerLabel: L.deletion || 'DELETION',
      orderId,
      table,
      orderType,
      orderTaker,
      createdAt,
      extraLines,
      labels: L,
      showOrderType: cfg.showOrderType !== false,
      showTableName: cfg.showTableName !== false,
    });

    printFixedLine(printer, buildItemHeaderString(cfg), { align: 'left', style: 'bold', wrap: false });
    printItems.forEach((it) => {
      buildItemRowStrings(it, cfg).forEach((row) => {
        printFixedLine(printer, row, { align: 'left', wrap: false });
      });
      if (it.notes) {
        printFixedLine(printer, ` >> ${it.notes}`, { align: 'left' });
      }
      printModifierLines(printer, it.modifierLines);
    });

    feedBottomMargin(printer, cfg);
    printPrintingTimestamp(printer, cfg);
    printer.cut();
    return printer;
  });
}

module.exports = { build };
