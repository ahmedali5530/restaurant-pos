'use strict';

const {
  normalizeConfig,
  printReceiptHeader,
  printLineLeftRight,
  formatMoney,
  printVatLine,
  feedBottomMargin,
} = require('../lib/receipt-helpers');
const { mapOrderToRefund } = require('../lib/order-mapping');

/**
 * Refund print – REFUND RECEIPT. Matches refund.bill.tsx.
 * Expects data: { order: refundOrder, originalOrder }.
 * refundOrder: items (selected to refund), tax_amount, discount_amount, service_charge_amount, tip_amount, extras.
 */
function build(printer, data = {}, config = {}) {
  const refundOrder = data && data.order;
  const originalOrder = data && data.originalOrder;
  if (!refundOrder) {
    return Promise.reject(new Error('data.order (refund order) is required for refund print'));
  }

  const cfg = normalizeConfig(config);
  const bill = mapOrderToRefund(refundOrder, originalOrder, {
    showInclusivePrices: !!cfg.showInclusivePrices,
  });

  return printReceiptHeader(printer, cfg).then(() => {
    // --- REFUND RECEIPT header ---
    printer.align('ct').style('bu').text('REFUND RECEIPT').style('normal');
    printLineLeftRight(printer, `Original Invoice# ${bill.originalOrderId || ''}`, '');
    printLineLeftRight(printer, `Table: ${bill.table || '-'}`, `Order Type: ${bill.orderType || '-'}`);
    printLineLeftRight(printer, `Cashier: ${bill.userName || '-'}`, '');
    printLineLeftRight(printer, `Refund Date: ${bill.refundDate || ''}`, '');
    printer.drawLine();

    // --- Items ---
    (bill.items || []).forEach((it) => {
      const name = (it.name || it.title || '').slice(0, 28);
      const qty = it.qty != null ? it.qty : 1;
      const lineTotal = it.total != null ? Number(it.total) : (it.price || 0) * qty;
      printLineLeftRight(printer, `${name} x${qty}`, formatMoney(lineTotal, cfg.currencySymbol || '$'));
    });
    printer.drawLine();

    // --- Summary: Items(n), Tax, Discount, Service, extras, Tip ---
    printLineLeftRight(printer, `Items (${bill.itemsCount || 0})`, formatMoney(bill.itemsTotal, cfg.currencySymbol || '$'));
    if (bill.tax != null && Number(bill.tax) !== 0) {
      printLineLeftRight(printer, `Tax (${bill.taxLabel || 'Tax'})`, formatMoney(bill.tax, cfg.currencySymbol || '$'));
    }
    if (bill.discount && bill.discountAmount != null && Number(bill.discountAmount) !== 0) {
      printLineLeftRight(printer, 'Discount', formatMoney(bill.discountAmount, cfg.currencySymbol || '$'));
    }
    if (bill.serviceChargeLabel && bill.serviceChargeAmount != null && Number(bill.serviceChargeAmount) !== 0) {
      printLineLeftRight(printer, bill.serviceChargeLabel, formatMoney(bill.serviceChargeAmount, cfg.currencySymbol || '$'));
    }
    (bill.extras || []).forEach((e) => {
      printLineLeftRight(printer, e.name || 'Extra', formatMoney(e.value, cfg.currencySymbol || '$'));
    });
    if (bill.tipAmount != null && Number(bill.tipAmount) !== 0) {
      printLineLeftRight(printer, bill.tipLabel || 'Tip', formatMoney(bill.tipAmount, cfg.currencySymbol || '$'));
    }
    printer.drawLine();

    // --- Refund Total (bold) ---
    printer.style('bu');
    printLineLeftRight(printer, 'Refund Total', formatMoney(bill.total, cfg.currencySymbol || '$'));
    printer.style('normal');

    printVatLine(printer, cfg);
    feedBottomMargin(printer, cfg);
    printer.feed(1).cut();
    return printer;
  });
}

module.exports = { build };
