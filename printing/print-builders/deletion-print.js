'use strict';

const {
  normalizeConfig,
  printReceiptHeader,
  feedBottomMargin,
  buildItemRowString,
  buildItemHeaderString,
  printModifierLines,
  printFixedLine,
} = require('../lib/receipt-helpers');
const { printKotHeader } = require('../lib/kot-layout');
const {
  getOrderId,
  getOrderCreatedAt,
  getOrderItemModifierLines,
  getOrderUserName,
  getOrderType,
} = require('../lib/order-mapping');

function mapPrintItems(items) {
  return items.map((it) => {
    const dish = it.item || it.dish || {};
    return {
      name: dish.name || dish.title || '',
      qty: it.quantity != null ? it.quantity : 1,
      price: Number(it.price || 0),
      total: Number(it.price || 0) * (it.quantity != null ? it.quantity : 1),
      notes: it.comments || '',
      modifierLines: getOrderItemModifierLines(it),
    };
  });
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

  const dateOpts = { timezone: cfg.timezone, locale: cfg.locale };
  const orderId = order ? getOrderId(order) : '';
  const createdAt = order
    ? getOrderCreatedAt(order, dateOpts)
    : getOrderCreatedAt(null, dateOpts);
  const orderTaker = order ? getOrderUserName(order) : '';
  const orderType = order ? getOrderType(order) : '';
  const table = getTableLabel(data);
  const printItems = mapPrintItems(items);

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
    });

    printFixedLine(printer, buildItemHeaderString(cfg), { align: 'left', style: 'bold' });
    printItems.forEach((it) => {
      printFixedLine(printer, buildItemRowString(it, cfg), { align: 'left' });
      if (it.notes) {
        printFixedLine(printer, ` >> ${it.notes.slice(0, 26)}`, { align: 'left' });
      }
      printModifierLines(printer, it.modifierLines);
    });

    feedBottomMargin(printer, cfg);
    printer.feed(2).cut();
    return printer;
  });
}

module.exports = { build };
