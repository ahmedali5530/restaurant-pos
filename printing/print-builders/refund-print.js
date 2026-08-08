'use strict';

const {
  normalizeConfig,
  printReceiptHeader,
  printLineLeftRight,
  formatMoney,
  printVatLine,
  feedBottomMargin,
  printPrintingTimestamp,
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
  const L = cfg.labels || {};
  const bill = mapOrderToRefund(refundOrder, originalOrder, {
    showInclusivePrices: !!cfg.showInclusivePrices,
    timezone: cfg.timezone,
    locale: cfg.locale,
  });

  const refundReceiptLabel = L.refundReceipt || 'REFUND RECEIPT';
  const originalInvoiceLabel = L.originalInvoice || 'Original Invoice#';
  const tableLabel = L.table || 'Table';
  const orderTypeLabel = L.orderType || 'Order Type';
  const cashierLabel = L.cashier || 'Cashier';
  const refundDateLabel = L.refundDate || 'Refund Date';
  const itemsLabel = L.items || 'Items';
  const taxLabel = L.tax || 'Tax';
  const discountLabel = L.discount || 'Discount';
  const extraLabel = L.extra || 'Extra';
  const tipLabel = L.tip || 'Tip';
  const refundTotalLabel = L.refundTotal || 'Refund Total';

  return printReceiptHeader(printer, cfg).then(() => {
    printer.align('ct').style('bu').text(refundReceiptLabel).style('normal');
    printLineLeftRight(printer, `${originalInvoiceLabel} ${bill.originalOrderId || ''}`, '');
    printLineLeftRight(printer, `${tableLabel}: ${bill.table || '-'}`, `${orderTypeLabel}: ${bill.orderType || '-'}`);
    printLineLeftRight(printer, `${cashierLabel}: ${bill.userName || '-'}`, '');
    printLineLeftRight(printer, `${refundDateLabel}: ${bill.refundDate || ''}`, '');
    printer.drawLine();

    (bill.items || []).forEach((it) => {
      const name = (it.name || it.title || '').slice(0, 28);
      const qty = it.qty != null ? it.qty : 1;
      const lineTotal = it.total != null ? Number(it.total) : (it.price || 0) * qty;
      printLineLeftRight(printer, `${name} x${qty}`, formatMoney(lineTotal, cfg.currencySymbol ?? '$'));
    });
    printer.drawLine();

    printLineLeftRight(printer, `${itemsLabel} (${bill.itemsCount || 0})`, formatMoney(bill.itemsTotal, cfg.currencySymbol ?? '$'));
    if (bill.tax != null && Number(bill.tax) !== 0) {
      printLineLeftRight(printer, `${taxLabel} (${bill.taxLabel || taxLabel})`, formatMoney(bill.tax, cfg.currencySymbol ?? '$'));
    }
    if (bill.discount && bill.discountAmount != null && Number(bill.discountAmount) !== 0) {
      printLineLeftRight(printer, discountLabel, formatMoney(bill.discountAmount, cfg.currencySymbol ?? '$'));
    }
    if (bill.serviceChargeLabel && bill.serviceChargeAmount != null && Number(bill.serviceChargeAmount) !== 0) {
      printLineLeftRight(printer, bill.serviceChargeLabel, formatMoney(bill.serviceChargeAmount, cfg.currencySymbol ?? '$'));
    }
    (bill.extras || []).forEach((e) => {
      printLineLeftRight(printer, e.name || extraLabel, formatMoney(e.value, cfg.currencySymbol ?? '$'));
    });
    if (bill.tipAmount != null && Number(bill.tipAmount) !== 0) {
      printLineLeftRight(printer, bill.tipLabel || tipLabel, formatMoney(bill.tipAmount, cfg.currencySymbol ?? '$'));
    }
    printer.drawLine();

    printer.style('bu');
    printLineLeftRight(printer, refundTotalLabel, formatMoney(bill.total, cfg.currencySymbol ?? '$'));
    printer.style('normal');

    printVatLine(printer, cfg);
    feedBottomMargin(printer, cfg);
    printPrintingTimestamp(printer, cfg);
    printer.cut();
    return printer;
  });
}

module.exports = { build };
