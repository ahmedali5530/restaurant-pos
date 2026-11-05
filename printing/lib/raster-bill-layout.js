'use strict';

const {
  formatMoney,
  buildItemRowStrings,
  buildItemHeaderString,
} = require('./receipt-helpers');
const { formatDiscountMinimalPrint } = require('./bill-layout');

/**
 * Paint bill layout on a ReceiptCanvas — mirrors printBillLayout (ESC/POS) field order and strings.
 * @param {import('./raster-render').ReceiptCanvas} rc
 * @param {Object} bill
 * @param {Object} config
 * @param {Object} opts
 */
function paintBillLayoutRaster(rc, bill, config, opts) {
  const cfg = config || {};
  const L = cfg.labels || {};
  const sym = cfg.currencySymbol ?? '$';
  const o = opts || {};

  const {
    title,
    address,
    phone,
    customerName,
    deliveryTime,
    notes,
    thankYou,
    showPayments = false,
    showChange = false,
    showDeliveryLine = false,
  } = o;

  const invoiceLabel = L.invoice || 'Invoice#';
  const tableLabel = L.table || 'Table';
  const orderTypeLabel = L.orderType || 'Order Type';
  const cashierLabel = L.cashier || 'Cashier';
  const customerLabel = L.customer || 'Customer';
  const phoneLabel = L.phone || 'Phone';
  const addressLabel = L.address || 'Address';
  const deliveryTimeLabel = L.deliveryTime || 'Delivery Time';
  const itemsLabel = L.items || 'Items';
  const taxLabel = L.tax || 'Tax';
  const discountLabel = L.discount || 'Discount';
  const extraLabel = L.extra || 'Extra';
  const tipLabel = L.tip || 'Tip';
  const deliveryChargesLabel = L.deliveryCharges || 'Delivery Charges';
  const totalLabel = L.total || 'Total';
  const paymentLabel = L.payment || 'Payment';
  const changeLabel = L.change || 'Change';
  const notesLabel = L.notes || 'Notes';
  rc.centered(title || L.bill || 'Bill', { size: 'normal', style: 'bold-underline' });
  rc.feed(1);
  if (cfg.showVatNumber && cfg.vatNumber) {
    rc.centered(`${cfg.vatName}: ${cfg.vatNumber}`, { size: 'normal' });
  }

  rc.lineLeftRight(`${invoiceLabel} ${bill.orderId || ''}`, bill.date || '');
  const tableLeft = cfg.showTableName !== false
    ? `${tableLabel}: ${bill.table || '-'}`
    : '';
  const orderTypeRight = cfg.showOrderType !== false && bill.orderType
    ? `${orderTypeLabel}: ${bill.orderType}`
    : '';
  if (tableLeft || orderTypeRight) {
    rc.lineLeftRight(tableLeft, orderTypeRight);
  }
  rc.lineLeftRight(`${cashierLabel}: ${bill.userName || '-'}`, '');
  if (deliveryTime) rc.fixedLine(`${deliveryTimeLabel}: ${String(deliveryTime)}`, { align: 'left' });
  rc.divider();

  rc.fixedLine(buildItemHeaderString(cfg), { align: 'left', style: 'bold', wrap: false });
  (bill.items || []).forEach((it) => {
    buildItemRowStrings(it, cfg).forEach((row) => {
      rc.fixedLine(row, { align: 'left', wrap: false });
    });
    if (Array.isArray(it.modifierLines) && it.modifierLines.length) {
      it.modifierLines.forEach((line) => {
        if (!line || line.name == null) return;
        const depth = typeof line.depth === 'number' ? line.depth : 0;
        const indent = '  '.repeat(1 + Math.max(0, depth));
        rc.fixedLine(indent + String(line.name).trim(), { align: 'left' });
      });
    }
  });
  rc.divider();

  rc.lineLeftRight(`${itemsLabel} (${bill.itemsCount || 0})`, formatMoney(bill.itemsTotal, sym, cfg));
  if (bill.tax != null && Number(bill.tax) !== 0) {
    rc.lineLeftRight(`${taxLabel} (${bill.taxLabel || taxLabel})`, formatMoney(bill.tax, sym, cfg));
    if (Array.isArray(bill.taxLines) && bill.taxLines.length > 0) {
      bill.taxLines.forEach((t) => {
        rc.lineLeftRight(t.label || taxLabel, formatMoney(t.amount, sym, cfg));
      });
    }
  }
  if (Array.isArray(bill.discountLines) && bill.discountLines.length === 1) {
    const d = bill.discountLines[0];
    const singleLabel = formatDiscountMinimalPrint(d.rawName, d.valueType, d.rate, discountLabel);
    rc.lineLeftRight(singleLabel, '-' + formatMoney(d.amount, sym, cfg));
  } else if (Array.isArray(bill.discountLines) && bill.discountLines.length > 1) {
    rc.lineLeftRight(discountLabel, '-' + formatMoney(bill.discountAmount, sym, cfg));
    bill.discountLines.forEach((d) => {
      rc.lineLeftRight('  ' + (d.name || discountLabel), '-' + formatMoney(d.amount, sym, cfg));
    });
  } else if (bill.discountAmount != null && Number(bill.discountAmount) !== 0) {
    rc.lineLeftRight(bill.discountLabel || discountLabel, '-' + formatMoney(bill.discountAmount, sym, cfg));
  }
  if (bill.serviceChargeLabel && bill.serviceChargeAmount != null && Number(bill.serviceChargeAmount) !== 0) {
    rc.lineLeftRight(bill.serviceChargeLabel, formatMoney(bill.serviceChargeAmount, sym, cfg));
  }
  (bill.extras || []).forEach((e) => {
    rc.lineLeftRight(e.name || extraLabel, formatMoney(e.value, sym, cfg));
  });
  if (bill.tipAmount != null && Number(bill.tipAmount) !== 0) {
    rc.lineLeftRight(bill.tipLabel || tipLabel, formatMoney(bill.tipAmount, sym, cfg));
  }
  if (showDeliveryLine && bill.deliveryCharges != null && Number(bill.deliveryCharges) !== 0) {
    rc.lineLeftRight(deliveryChargesLabel, formatMoney(bill.deliveryCharges, sym, cfg));
  }
  rc.divider();

  if (Array.isArray(bill.totalRows) && bill.totalRows.length > 0) {
    bill.totalRows.forEach((row) => {
      rc.lineLeftRight(row.label || totalLabel, formatMoney(row.amount, sym, cfg));
    });
  } else {
    rc.lineLeftRight(totalLabel, formatMoney(bill.total, sym, cfg), { style: 'bold' });
  }

  if (showPayments && Array.isArray(bill.payments) && bill.payments.length > 0) {
    rc.divider();
    bill.payments.forEach((p) => {
      rc.lineLeftRight(p.method || paymentLabel, formatMoney(p.amount, sym, cfg));
    });
  }
  if (showChange && bill.change != null && Number(bill.change) !== 0) {
    rc.divider();
    rc.lineLeftRight(changeLabel, formatMoney(bill.change, sym, cfg), { style: 'bold' });
  }

  if (notes) {
    rc.divider();
    rc.fixedLine(`${notesLabel}: ${String(notes)}`, { align: 'left' });
  }
  if (thankYou) {
    rc.feed(1);
    rc.centered(String(thankYou), { size: 'normal' });
  }

  // Customer after settlement block, immediately before custom footer sections
  if (cfg.showCustomer !== false && (customerName || phone || address)) {
    rc.divider();
    if (customerName) rc.fixedLine(`${customerLabel}: ${String(customerName)}`, { align: 'left' });
    if (phone) rc.fixedLine(`${phoneLabel}: ${String(phone)}`, { align: 'left' });
    if (address) rc.fixedLine(`${addressLabel}: ${String(address)}`, { align: 'left' });
  }
}

module.exports = { paintBillLayoutRaster };
