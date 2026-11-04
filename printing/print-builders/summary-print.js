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
const { computeSummary, formatNum } = require('../lib/summary-mapping');

function pct(x, of) {
  const n = Number(of);
  return Number.isFinite(n) && n > 0 ? (Number(x) / n) * 100 : 0;
}

function sect(printer, title) {
  printer.drawLine();
  printer.align('ct').style('bu').text(title).style('normal');
  printer.align('lt');
}

function printMixRow(printer, left, qty, total, share, sym, options = {}) {
  const { bold = false, indent = 0 } = options;
  const pad = ' '.repeat(indent);
  const label = `${pad}${String(left).slice(0, 22)}`;
  const right = `${formatNum(qty)}  ${formatMoney(total, sym, cfg)}  ${formatNum(share)}%`;
  if (bold) {
    printer.style('bu');
  }
  printLineLeftRight(printer, label, right);
  if (bold) {
    printer.style('normal');
  }
}

function printProductMix(printer, categoryMix, exclusiveSales, sym, L) {
  const itemLabel = L.item || 'Item';
  const mixHeader = L.mixHeaderQtyTotal || 'Qty   Total   %';
  printLineLeftRight(printer, itemLabel, mixHeader);
  if (!categoryMix || categoryMix.length === 0) {
    printer.text(L.noCategoryData || 'No category data for this date.');
    return;
  }

  const ex = exclusiveSales;
  categoryMix.forEach((category) => {
    printMixRow(
      printer,
      category.name,
      category.quantity,
      category.total,
      pct(category.total, ex),
      sym,
      { bold: true }
    );

    (category.dishes || []).forEach((dish) => {
      printMixRow(
        printer,
        dish.name,
        dish.quantity,
        dish.total,
        pct(dish.total, ex),
        sym,
        { indent: 2 }
      );

      (dish.modifiers || []).forEach((modifier) => {
        const depth = Number.isFinite(Number(modifier.depth)) ? Number(modifier.depth) : 1;
        const indent = 2 + depth * 2;
        const modLabel = `- ${modifier.name}`;
        printLineLeftRight(
          printer,
          `${' '.repeat(indent)}${String(modLabel).slice(0, 20)}`,
          `${formatNum(modifier.quantity)}  ${formatNum(modifier.price)}`
        );
      });
    });
  });
}

function printPaymentTypes(printer, paymentTypes, amountDue, sym, line, L) {
  const rows = (paymentTypes || []).filter((payment) => safeNumber(payment.total) > 0);
  if (rows.length === 0) {
    printer.text(L.noPaymentData || 'No payment data for this date.');
    return;
  }
  rows.forEach((payment) => {
    const share = formatNum(pct(payment.total, amountDue)) + '%';
    line(payment.name, `${formatMoney(payment.total, sym, cfg)}  ${share}`);
  });
}

function safeNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function printDailySalesSummary(printer, data, cfg) {
  const sym = cfg.currencySymbol ?? '$';
  const L = cfg.labels || {};
  const s = computeSummary({
    ...data,
    timezone: cfg.timezone,
    locale: cfg.locale,
    dateFormat: cfg.dateFormat,
    timeFormat: cfg.timeFormat,
  });
  const line = (left, right) => printLineLeftRight(printer, left, right);

  const titleTemplate = L.summaryTitle || 'Daily sales summary — {{date}}';
  const title = titleTemplate.replace('{{date}}', s.date);

  printer.align('ct').style('bu').text(title).style('normal');
  printer.align('lt');
  printer.drawLine();

  sect(printer, L.salesRevenue || '1. Sales revenue');
  line(L.exclusiveSales || 'Exclusive sales', formatMoney(s.exclusiveSales, sym, cfg));
  line(L.extras || 'Extras', formatMoney(s.totalExtras, sym, cfg));
  line(L.grossSales || 'Gross sales', formatMoney(s.grossSales, sym, cfg));
  line(L.itemDiscounts || 'Item discounts', formatMoney(s.itemDiscounts, sym, cfg));
  line(L.subtotalDiscounts || 'Subtotal discounts', formatMoney(s.subtotalDiscounts, sym, cfg));
  line(L.couponDiscounts || 'Coupon discounts', formatMoney(s.couponDiscounts, sym, cfg));
  line(L.discountsMinus || '(-) Discounts', formatMoney(s.discounts, sym, cfg));
  line(L.netSales || 'Net sales', formatMoney(s.netSales, sym, cfg));

  sect(printer, L.surchargesTaxes || '2. Surcharges and taxes');
  line(L.serviceCharges || 'Service charges', formatMoney(s.serviceCharges, sym, cfg));
  line(L.taxes || 'Taxes', formatMoney(s.taxCollected, sym, cfg));
  printer.style('bu');
  line(L.totalRevenue || 'Total revenue', formatMoney(s.totalRevenue, sym, cfg));
  printer.style('normal');

  sect(printer, L.settlementCashier || '3. Settlement and cashier');
  line(L.amountDueBeforeTips || 'Amount due (before tips)', formatMoney(s.amountDue, sym, cfg));
  line(L.tips || 'Tips', formatMoney(s.tips, sym, cfg));
  printer.style('bu');
  line(L.grandTotalDue || 'Grand total (due)', formatMoney(s.grandTotalDue, sym, cfg));
  printer.style('normal');
  line(L.amountCollected || 'Amount collected', formatMoney(s.amountCollected, sym, cfg));
  line(L.rounding || 'Rounding', formatMoney(s.rounding, sym, cfg));
  line(L.changeVariance || 'Change / variance', formatMoney(s.changeGiven, sym, cfg));

  sect(printer, L.operationalControls || '4. Operational controls');
  line(L.voids || 'Voids', formatMoney(s.voids, sym, cfg));
  line(L.refunds || 'Refunds', formatMoney(s.refunds, sym, cfg));
  line(L.covers || 'Covers', formatNum(s.covers));
  line(L.averageCover || 'Average cover', formatMoney(s.averageCover, sym, cfg));
  line(L.ordersChecks || 'Orders / checks', formatNum(s.ordersCount));
  line(L.averageOrderCheck || 'Average order / check', formatMoney(s.averageOrderCheck, sym, cfg));

  sect(printer, L.productMix || '5. Product mix');
  printProductMix(printer, s.categoryMix, s.exclusiveSales, sym, L);

  sect(printer, L.paymentTypes || '6. Payment types');
  printPaymentTypes(printer, s.paymentTypes, s.amountDue, sym, line, L);

  sect(printer, L.taxesBreakdown || '7. Taxes breakdown');
  if (!s.taxesList || s.taxesList.length === 0) {
    printer.text(L.noTaxRows || 'No tax rows for this date.');
  } else {
    s.taxesList.forEach((tax) => {
      const share = formatNum(pct(tax.total, s.taxCollected)) + '%';
      line(`${tax.name}%`, `${formatMoney(tax.total, sym, cfg)}  ${share}`);
    });
  }

  sect(printer, L.discountsBreakdown || '8. Discounts breakdown');
  if (!s.discountsList || s.discountsList.length === 0) {
    printer.text(L.noDiscountRows || 'No discount rows for this date.');
  } else {
    s.discountsList.forEach((discount) => {
      const share = formatNum(pct(discount.total, s.discounts)) + '%';
      line(discount.name, `${formatMoney(discount.total, sym, cfg)}  ${share}`);
    });
  }

  sect(printer, L.extrasBreakdown || '9. Extras breakdown');
  if (!s.extrasList || s.extrasList.length === 0) {
    printer.text(L.noExtras || 'No extras found for this date.');
  } else {
    s.extrasList.forEach((extra) => {
      const share = formatNum(pct(extra.total, s.totalExtras)) + '%';
      line(extra.name, `${formatMoney(extra.total, sym, cfg)}  ${share}`);
    });
  }

  sect(printer, L.couponsBreakdown || '10. Coupons breakdown');
  if (!s.couponsList || s.couponsList.length === 0) {
    printer.text(L.noCoupons || 'No coupon usage for this date.');
  } else {
    s.couponsList.forEach((coupon) => {
      line(coupon.name, formatMoney(coupon.total, sym, cfg));
    });
  }

  printVatLine(printer, cfg);
  feedBottomMargin(printer, cfg);
  printPrintingTimestamp(printer, cfg);
  printer.cut();
}

function build(printer, data = {}, config = {}) {
  const orders = data && data.orders;
  const hasArray = Array.isArray(orders);
  const hasDataArray = orders && Array.isArray(orders.data);
  if (!hasArray && !hasDataArray) {
    return Promise.reject(new Error('data.orders (Order[]) is required for summary print'));
  }

  const cfg = normalizeConfig(config);

  return printReceiptHeader(printer, cfg).then(() => {
    printDailySalesSummary(printer, data, cfg);
    return printer;
  });
}

module.exports = { build };
