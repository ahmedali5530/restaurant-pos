'use strict';

const {
  normalizeConfig,
  printReceiptHeader,
  feedBottomMargin,
  buildItemRowString,
  buildItemHeaderString,
  printModifierLines,
} = require('../lib/receipt-helpers');
const { getOrderId, getOrderCreatedAt, getOrderItemModifierLines } = require('../lib/order-mapping');

/**
 * Deletion print builder.
 * Expects data: { order, items, kitchenName?, table?, reason?, comments? }
 *   - order:       normalized order object (with invoice_number etc.)
 *   - items:       kitchen-specific items with { item (Dish), quantity }
 *   - kitchenName: name of the kitchen station
 *   - table:       table object with name/number
 *   - reason:      void reason string
 *   - comments:    optional comments
 */
function build(printer, data = {}, config = {}) {
  const order = data.order;
  const items = Array.isArray(data.items) ? data.items : [];
  const kitchenName = data.kitchenName || '';
  const reason = data.reason || '';
  const comments = data.comments || '';
  const cfg = normalizeConfig(config);

  const orderId = order ? getOrderId(order) : '';
  const createdAt = order ? getOrderCreatedAt(order) : new Date().toLocaleTimeString();

  const table = data.table
    ? String(data.table.name || '') + String(data.table.number || '')
    : '';

  const printItems = items.map((it) => {
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

  return printReceiptHeader(printer, cfg).then(() => {
    printer.align('ct').style('bu');
    printer.text(kitchenName || 'KITCHEN');
    printer.style('normal');
    printer.drawLine();

    printer.align('ct').style('b').text('*** DELETION ***').style('normal');

    if (orderId) printer.text(`Order# ${orderId}`);
    if (table) printer.text(`Table: ${table}`);
    printer.text(`Time: ${createdAt}`);
    if (reason) printer.text(`Reason: ${reason}`);
    if (comments) printer.text(`Note: ${comments.slice(0, 40)}`);
    printer.drawLine();

    printer.align('lt');
    printer.style('b').text(buildItemHeaderString(cfg)).style('normal');
    printItems.forEach((it) => {
      printer.text(buildItemRowString(it, cfg));
      if (it.notes) {
        printer.text(` >> ${it.notes.slice(0, 26)}`);
      }
      printModifierLines(printer, it.modifierLines);
    });

    feedBottomMargin(printer, cfg);
    printer.feed(2).cut();
    return printer;
  });
}

module.exports = { build };
