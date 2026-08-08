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
  printFiscalQrRow,
  printPrintingTimestamp,
} = require('./receipt-helpers');

/**
 * Single-discount header: "Discount (Summer Sale 10%)".
 * @param {string|null|undefined} name
 * @param {string|null|undefined} valueType
 * @param {number|null|undefined} rate
 * @param {string} [fallback='Discount']
 * @returns {string}
 */
function formatDiscountMinimalPrint(name, valueType, rate, fallback) {
  const label = fallback || 'Discount';
  const n = Number(rate || 0);
  const isPercent = valueType === 'percent' || (!valueType && n > 0);
  if (name && isPercent && n > 0) {
    return label + ' (' + name + ' ' + n + '%)';
  }
  if (name) {
    return label + ' (' + name + ')';
  }
  if (isPercent && n > 0) {
    return label + ' (' + n + '%)';
  }
  return label;
}

/**
 * Print bill layout for ESC/POS final/temp/delivery receipts.
 * @param {Object} printer - escpos Printer
 * @param {Object} bill - from mapOrderToTemp/Final/Delivery
 * @param {Object} config - normalized config (currencySymbol, showVatNumber, vatName, vatNumber, labels, locale)
 * @param {Object} opts - { title, address?, phone?, notes?, thankYou?, showPayments?, showChange?, showDeliveryLine?, isFinal?, qrcode?, qrcodes? }
 * @returns {Promise<void>}
 */
function printBillLayout(printer, bill, config, opts) {
  const cfg = config || {};
  const L = cfg.labels || {};
  const sym = cfg.currencySymbol ?? '$';
  const {
    title,
    address,
    phone,
    customerName,
    deliveryTime,
    qrcode,
    qrcodes,
    notes,
    thankYou,
    showPayments = false,
    showChange = false,
    showDeliveryLine = false,
    isFinal = false,
  } = opts || {};

  hardResetLayout(printer);
  printCenteredText(printer, title || L.bill || 'Bill', { style: 'bold-underline' });
  printer.feed(1);
  printVatLine(printer, cfg);
  hardResetLayout(printer);

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
  const checkClosedLabel = L.checkClosed || 'Check Closed';

  printLineLeftRight(printer, `${invoiceLabel} ${bill.orderId || ''}`, bill.date || '');
  printLineLeftRight(printer, `${tableLabel}: ${bill.table || '-'}`, `${orderTypeLabel}: ${bill.orderType || '-'}`);
  printLineLeftRight(printer, `${cashierLabel}: ${bill.userName || '-'}`, '');
  if (customerName) printFixedLine(printer, `${customerLabel}: ${String(customerName)}`, { align: 'left' });
  if (phone) printFixedLine(printer, `${phoneLabel}: ${String(phone)}`, { align: 'left' });
  if (address) printFixedLine(printer, `${addressLabel}: ${String(address).slice(0, 40)}`, { align: 'left' });
  if (deliveryTime) printFixedLine(printer, `${deliveryTimeLabel}: ${String(deliveryTime)}`, { align: 'left' });
  printDivider(printer);

  printFixedLine(printer, buildItemHeaderString(cfg), { align: 'left', style: 'bold' });
  (bill.items || []).forEach((it) => {
    printFixedLine(printer, buildItemRowString(it, cfg), { align: 'left' });
    printModifierLines(printer, it.modifierLines);
  });
  printDivider(printer);

  printLineLeftRight(printer, `${itemsLabel} (${bill.itemsCount || 0})`, formatMoney(bill.itemsTotal, sym));
  if (bill.tax != null && Number(bill.tax) !== 0) {
    printLineLeftRight(printer, `${taxLabel} (${bill.taxLabel || taxLabel})`, formatMoney(bill.tax, sym));
    if (Array.isArray(bill.taxLines) && bill.taxLines.length > 0) {
      bill.taxLines.forEach((t) => {
        printLineLeftRight(printer, t.label || taxLabel, formatMoney(t.amount, sym));
      });
    }
  }
  if (Array.isArray(bill.discountLines) && bill.discountLines.length === 1) {
    const d = bill.discountLines[0];
    const singleLabel = formatDiscountMinimalPrint(d.rawName, d.valueType, d.rate, discountLabel);
    printLineLeftRight(printer, singleLabel, '-' + formatMoney(d.amount, sym));
  } else if (Array.isArray(bill.discountLines) && bill.discountLines.length > 1) {
    printLineLeftRight(printer, discountLabel, '-' + formatMoney(bill.discountAmount, sym));
    bill.discountLines.forEach((d) => {
      printLineLeftRight(printer, '  ' + (d.name || discountLabel), '-' + formatMoney(d.amount, sym));
    });
  } else if (bill.discount && bill.discountAmount != null && Number(bill.discountAmount) !== 0) {
    printLineLeftRight(printer, bill.discountLabel || discountLabel, formatMoney(bill.discountAmount, sym));
  }
  if (bill.serviceChargeLabel && bill.serviceChargeAmount != null && Number(bill.serviceChargeAmount) !== 0) {
    printLineLeftRight(printer, bill.serviceChargeLabel, formatMoney(bill.serviceChargeAmount, sym));
  }
  (bill.extras || []).forEach((e) => {
    printLineLeftRight(printer, e.name || extraLabel, formatMoney(e.value, sym));
  });
  if (bill.tipAmount != null && Number(bill.tipAmount) !== 0) {
    printLineLeftRight(printer, bill.tipLabel || tipLabel, formatMoney(bill.tipAmount, sym));
  }
  if (showDeliveryLine && bill.deliveryCharges != null && Number(bill.deliveryCharges) !== 0) {
    printLineLeftRight(printer, deliveryChargesLabel, formatMoney(bill.deliveryCharges, sym));
  }
  printDivider(printer);

  if (Array.isArray(bill.totalRows) && bill.totalRows.length > 0) {
    bill.totalRows.forEach((row) => {
      printLineLeftRight(printer, row.label || totalLabel, formatMoney(row.amount, sym));
    });
  } else {
    printLineLeftRight(printer, totalLabel, formatMoney(bill.total, sym), { style: 'bold' });
    hardResetLayout(printer);
  }

  if (showPayments && Array.isArray(bill.payments) && bill.payments.length > 0) {
    printDivider(printer);
    bill.payments.forEach((p) => {
      printLineLeftRight(printer, p.method || paymentLabel, formatMoney(p.amount, sym));
    });
  }
  if (showChange && bill.change != null && Number(bill.change) !== 0) {
    printDivider(printer);
    printLineLeftRight(printer, changeLabel, formatMoney(bill.change, sym), { style: 'bold' });
  }

  if (notes) {
    printDivider(printer);
    printFixedLine(printer, `${notesLabel}: ${String(notes).slice(0, 48)}`, { align: 'left' });
  }
  if (thankYou) {
    printer.feed(1);
    printCenteredText(printer, thankYou);
    printer.feed(2);
  }

  const qrItems = normalizeQrItems(qrcodes, qrcode);
  return printFooterSections(printer, cfg).then(() => {
    feedBottomMargin(printer, cfg);

    if (isFinal) {
      printDivider(printer);
      printCenteredText(printer, checkClosedLabel, { style: 'bold' });
    }

    return printQrCodes(printer, qrItems).then(() => {
      printPrintingTimestamp(printer, cfg);
      printer.cut();
    });
  });
}

/**
 * @param {unknown} qrcodes
 * @param {unknown} qrcode
 * @returns {{ value: string, description: string, logo?: string }[]}
 */
function normalizeQrItems(qrcodes, qrcode) {
  if (Array.isArray(qrcodes) && qrcodes.length > 0) {
    return qrcodes
      .map((item) => {
        if (item == null) return null;
        if (typeof item === 'string') {
          const value = item.trim();
          return value ? { value, description: '' } : null;
        }
        const value = String(item.value ?? item.qrcode ?? '').trim();
        if (!value) return null;
        const description = String(item.description ?? '').trim();
        const logoRaw = item.logo ?? item.image;
        const logo =
          logoRaw != null && String(logoRaw).trim() ? String(logoRaw).trim() : undefined;
        return { value, description, ...(logo ? { logo } : {}) };
      })
      .filter(Boolean);
  }

  const qrValue = qrcode != null ? String(qrcode).trim() : '';
  return qrValue ? [{ value: qrValue, description: '' }] : [];
}

function printQrDescription(printer, description) {
  if (!description) return;
  // Multi-line captions e.g. invoice number + verification line.
  String(description)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .forEach((line) => printCenteredText(printer, line));
}

function printQrCodes(printer, items) {
  if (!items || items.length === 0) return Promise.resolve();

  return items.reduce((chain, item, index) => {
    return chain.then(() =>
      printQrCode(printer, item.value, item.logo).then(() => {
        printQrDescription(printer, item.description);
        if (index < items.length - 1) {
          printer.feed(2);
        }
      })
    );
  }, Promise.resolve());
}

/**
 * Provider logo then QR on consecutive lines (always stacked).
 * @param {Object} printer
 * @param {string} value
 * @param {string} [logo]
 */
function printQrCode(printer, value, logo) {
  if (!value) return Promise.resolve();

  return printFiscalQrRow(printer, value, logo).then(() => {
    try {
      printer.feed(1);
    } catch (e) {
      // ignore
    }
  });
}

module.exports = { printBillLayout };
