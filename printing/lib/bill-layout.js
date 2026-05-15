'use strict';

const {
  printLineLeftRight,
  formatMoney,
  printVatLine,
  feedBottomMargin,
  printBottomDescription,
  buildItemRowString,
  buildItemHeaderString,
  printModifierLines,
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

  // --- Header (CommonBillParts) ---
  printer.align('ct').style('bu').text(title || 'Bill').style('normal');
  printVatLine(printer, cfg);

  printer.style('normal');
  printLineLeftRight(printer, `Invoice# ${bill.orderId || ''}`, bill.date || '');
  printLineLeftRight(printer, `Table: ${bill.table || '-'}`, `Order Type: ${bill.orderType || '-'}`);
  printLineLeftRight(printer, `Cashier: ${bill.userName || '-'}`, '');
  if (customerName) printer.text(`Customer: ${String(customerName)}`);
  if (phone) printer.text(`Phone: ${String(phone)}`);
  if (address) printer.text(`Address: ${String(address).slice(0, 40)}`);
  if (deliveryTime) printer.text(`Delivery Time: ${String(deliveryTime)}`);
  printer.drawLine();

  // --- Items ---
  printer.align('lt');
  printer.style('b').text(buildItemHeaderString(cfg)).style('normal');
  (bill.items || []).forEach((it) => {
    printer.text(buildItemRowString(it, cfg));
    printModifierLines(printer, it.modifierLines);
  });
  printer.drawLine();

  // --- Summary (CommonBillParts order): Items(n), Tax, Discount, Service charges, extras, Tip; optionally Delivery ---
  printLineLeftRight(printer, `Items (${bill.itemsCount || 0})`, formatMoney(bill.itemsTotal, sym));
  if (bill.tax != null && Number(bill.tax) !== 0) {
    // Aggregate tax line
    printLineLeftRight(printer, `Tax (${bill.taxLabel || 'Tax'})`, formatMoney(bill.tax, sym));
    // When detailed taxes are provided (taxes array on order), print each tax line under the total.
    if (Array.isArray(bill.taxLines) && bill.taxLines.length > 0) {
      bill.taxLines.forEach((t) => {
        printLineLeftRight(printer, t.label || 'Tax', formatMoney(t.amount, sym));
      });
    }
  }
  if (bill.discount && bill.discountAmount != null && Number(bill.discountAmount) !== 0) {
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
  printer.drawLine();

  // --- Total (bold) ---
  if (Array.isArray(bill.totalRows) && bill.totalRows.length > 0) {
    // Temp print: when totalRows is provided, show per-tax totals instead of a single Total line.
    bill.totalRows.forEach((row) => {
      printLineLeftRight(printer, row.label || 'Total', formatMoney(row.amount, sym));
    });
  } else {
    printer.style('bu');
    printLineLeftRight(printer, 'Total', formatMoney(bill.total, sym));
    printer.style('normal');
  }

  // --- Payments and Change (final.bill: each payment, then Change) ---
  if (showPayments && Array.isArray(bill.payments) && bill.payments.length > 0) {
    printer.drawLine();
    bill.payments.forEach((p) => {
      printLineLeftRight(printer, p.method || 'Payment', formatMoney(p.amount, sym));
    });
  }
  if (showChange) {
    printer.drawLine();
    printer.style('bu');
    printLineLeftRight(printer, 'Change', formatMoney(bill.change, sym));
    printer.style('normal');
  }

  if (notes) {
    printer.drawLine();
    printer.text(`Notes: ${String(notes).slice(0, 48)}`);
  }
  if (thankYou) {
    printer.feed(1).align('ct').text(thankYou).feed(2);
  }

  printBottomDescription(printer, cfg);
  feedBottomMargin(printer, cfg);

  if (isFinal) {
    printer.drawLine();
    printer.align('ct').style('b').text('Check Closed').style('normal');
  }

  const qrValue = qrcode != null ? String(qrcode).trim() : '';
  return printQrCode(printer, qrValue).then(() => {
    // --- Timestamp: always last before cut ---
    const now = new Date();
    const ts = now.toLocaleString('en-US', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: true });
    printer.align('ct').text(ts);

    printer.feed(1).cut();
  });
}

function printQrCode(printer, value) {
  if (!value) return Promise.resolve();

  return new Promise((resolve) => {
    let settled = false;
    const done = () => {
      if (settled) return;
      settled = true;
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
      if (typeof printer.qrimage === 'function') {
        printer.align('ct').qrimage(value, { type: 'png', mode: 'dhdw' }, () => finalize());
        setTimeout(finalize, 2000);
        return;
      }
    } catch (e) {
      // fallback below
    }

    try {
      printer.align('ct').qrcode(value);
    } catch (e) {
      // ignore
    }
    finalize();
  });
}

module.exports = { printBillLayout };
