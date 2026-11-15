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
 * Kitchen print builder (KOT).
 * Expects data: { order, items, kitchenName?, table?, isAddOn?, duplicate? }
 */
function build(printer, data = {}, config = {}) {
  const order = data.order;
  const items = Array.isArray(data.items) ? data.items : [];
  const kitchenName = data.kitchenName || '';
  const isAddOn = !!data.isAddOn;
  const isDuplicate = !!data.duplicate;
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
  const bannerLabel = isDuplicate
    ? (L.duplicateKot || 'COPY')
    : (isAddOn ? (L.addon || 'ADDON') : (L.newOrder || 'NEW'));

  return printReceiptHeader(printer, cfg).then(() => {
    printKotHeader(printer, {
      kitchenName,
      bannerLabel,
      orderId,
      table,
      orderType,
      orderTaker,
      createdAt,
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
