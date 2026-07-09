'use strict';

const {
  printLineLeftRight,
  formatMoney,
  printVatLine,
  feedBottomMargin,
  printFooterSections,
  buildItemRowString,
  buildItemHeaderString,
  printModifierLines,
  printCenteredText,
  hardResetLayout,
  printFixedLine,
  printDivider,
} = require('./receipt-helpers');

/**
 * Print bill layout aligned with _common.bill.tsx and final.bill.tsx / presale.bill.tsx.
 * @param {Object} printer - escpos Printer
 * @param {Object} bill - from mapOrderToTemp/Final/Delivery
 * @param {Object} config - normalized config (currencySymbol, showVatNumber, vatName, vatNumber)
 * @param {Object} opts - { title, address?, phone?, notes?, thankYou?, showPayments?, showChange?, showDeliveryLine?, isFinal? }
 * @returns {Promise<void>}
 */
function printBillLayout(printer, bill, config, opts) {
  const cfg = config || {};
  const sym = cfg.currencySymbol || '$';
  const {
    title,
    address,
    phone,
    customerName,
    deliveryTime,
    qrcode,
    notes,
    thankYou,
    showPayments = false,
    showChange = false,
    showDeliveryLine = false,
    isFinal = false,
  } = opts || {};

  hardResetLayout(printer);
  printCenteredText(printer, title || 'Bill', { style: 'bold-underline' });
  printer.feed(1);
  printVatLine(printer, cfg);
  hardResetLayout(printer);

  printLineLeftRight(printer, `Invoice# ${bill.orderId || ''}`, bill.date || '');
  printLineLeftRight(printer, `Table: ${bill.table || '-'}`, `Order Type: ${bill.orderType || '-'}`);
  printLineLeftRight(printer, `Cashier: ${bill.userName || '-'}`, '');
  if (customerName) printFixedLine(printer, `Customer: ${String(customerName)}`, { align: 'left' });
  if (phone) printFixedLine(printer, `Phone: ${String(phone)}`, { align: 'left' });
  if (address) printFixedLine(printer, `Address: ${String(address).slice(0, 40)}`, { align: 'left' });
  if (deliveryTime) printFixedLine(printer, `Delivery Time: ${String(deliveryTime)}`, { align: 'left' });
  printDivider(printer);

  printFixedLine(printer, buildItemHeaderString(cfg), { align: 'left', style: 'bold' });
  (bill.items || []).forEach((it) => {
    printFixedLine(printer, buildItemRowString(it, cfg), { align: 'left' });
    printModifierLines(printer, it.modifierLines);
  });
  printDivider(printer);

  printLineLeftRight(printer, `Items (${bill.itemsCount || 0})`, formatMoney(bill.itemsTotal, sym));
  if (bill.tax != null && Number(bill.tax) !== 0) {
    printLineLeftRight(printer, `Tax (${bill.taxLabel || 'Tax'})`, formatMoney(bill.tax, sym));
    if (Array.isArray(bill.taxLines) && bill.taxLines.length > 0) {
      bill.taxLines.forEach((t) => {
        printLineLeftRight(printer, t.label || 'Tax', formatMoney(t.amount, sym));
      });
    }
  }
  if (Array.isArray(bill.discountLines) && bill.discountLines.length > 0) {
    bill.discountLines.forEach((d) => {
      printLineLeftRight(printer, d.name || 'Discount', '-' + formatMoney(d.amount, sym));
    });
  } else if (bill.discount && bill.discountAmount != null && Number(bill.discountAmount) !== 0) {
    printLineLeftRight(printer, 'Discount', formatMoney(bill.discountAmount, sym));
  }
  if (bill.serviceChargeLabel && bill.serviceChargeAmount != null && Number(bill.serviceChargeAmount) !== 0) {
    printLineLeftRight(printer, bill.serviceChargeLabel, formatMoney(bill.serviceChargeAmount, sym));
  }
  (bill.extras || []).forEach((e) => {
    printLineLeftRight(printer, e.name || 'Extra', formatMoney(e.value, sym));
  });
  if (bill.tipAmount != null && Number(bill.tipAmount) !== 0) {
    printLineLeftRight(printer, bill.tipLabel || 'Tip', formatMoney(bill.tipAmount, sym));
  }
  if (showDeliveryLine && bill.deliveryCharges != null && Number(bill.deliveryCharges) !== 0) {
    printLineLeftRight(printer, 'Delivery Charges', formatMoney(bill.deliveryCharges, sym));
  }
  printDivider(printer);

  if (Array.isArray(bill.totalRows) && bill.totalRows.length > 0) {
    bill.totalRows.forEach((row) => {
      printLineLeftRight(printer, row.label || 'Total', formatMoney(row.amount, sym));
    });
  } else {
    printLineLeftRight(printer, 'Total', formatMoney(bill.total, sym), { style: 'bold' });
    hardResetLayout(printer);
  }

  if (showPayments && Array.isArray(bill.payments) && bill.payments.length > 0) {
    printDivider(printer);
    bill.payments.forEach((p) => {
      printLineLeftRight(printer, p.method || 'Payment', formatMoney(p.amount, sym));
    });
  }
  if (showChange && bill.change != null && Number(bill.change) !== 0) {
    printDivider(printer);
    printLineLeftRight(printer, 'Change', formatMoney(bill.change, sym), { style: 'bold' });
  }

  if (notes) {
    printDivider(printer);
    printFixedLine(printer, `Notes: ${String(notes).slice(0, 48)}`, { align: 'left' });
  }
  if (thankYou) {
    printer.feed(1);
    printCenteredText(printer, thankYou);
    printer.feed(2);
  }

  const qrValue = qrcode != null ? String(qrcode).trim() : '';
  return printFooterSections(printer, cfg).then(() => {
    feedBottomMargin(printer, cfg);

    if (isFinal) {
      printDivider(printer);
      printCenteredText(printer, 'Check Closed', { style: 'bold' });
    }

    return printQrCode(printer, qrValue).then(() => {
      const now = new Date();
      const ts = now.toLocaleString('en-US', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      });
      printer.feed(2);
      printCenteredText(printer, ts);
      printer.feed(2);
      printer.cut();
    });
  });
}

function printQrCode(printer, value) {
  if (!value) return Promise.resolve();

  return new Promise((resolve) => {
    let settled = false;
    const done = () => {
      if (settled) return;
      settled = true;
      hardResetLayout(printer);
      resolve();
    };

    const finalize = () => {
      try {
        printer.feed(1);
      } catch (e) {
        // ignore
      }
      done();
    };

    try {
      hardResetLayout(printer);
      if (typeof printer.qrimage === 'function') {
        printer.align('lt').qrimage(value, { type: 'png', mode: 'dhdw' }, () => finalize());
        setTimeout(finalize, 2000);
        return;
      }
    } catch (e) {
      // fallback below
    }

    try {
      hardResetLayout(printer);
      printer.align('lt').qrcode(value);
    } catch (e) {
      // ignore
    }
    finalize();
  });
}

module.exports = { printBillLayout };
