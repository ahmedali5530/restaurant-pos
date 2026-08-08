'use strict';

const {
  normalizeConfig,
  printReceiptHeader,
  feedBottomMargin,
  buildItemRowString,
  buildItemHeaderString,
  printModifierLines,
  printFixedLine,
  printPrintingTimestamp,
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
    printPrintingTimestamp(printer, cfg);
    printer.cut();
    return printer;
  });
}

module.exports = { build };
