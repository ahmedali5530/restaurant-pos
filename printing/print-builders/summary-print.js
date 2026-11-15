'use strict';

const {
  normalizeConfig,
  printReceiptHeader,
  printLineLeftRight,
  formatMoney,
  printVatLine,
  feedBottomMargin,
  printPrintingTimestamp,
  toPrinterText,
} = require('../lib/receipt-helpers');
const { computeSummary, formatNum, formatMixRightColumns } = require('../lib/summary-mapping');

function pct(x, of) {
  const n = Number(of);
  return Number.isFinite(n) && n > 0 ? (Number(x) / n) * 100 : 0;
}

function qtyBracket(count) {
  if (count == null) return '';
  return ` (${formatNum(count)})`;
}

function sect(printer, title) {
  printer.drawLine();
  printer.align('ct').style('bu').text(toPrinterText(title)).style('normal');
  printer.align('lt');
}

function printText(printer, text) {
  printer.text(toPrinterText(text));
}

function printMixRow(printer, left, qty, total, share, sym, options = {}, cfg) {
  const { bold = false, indent = 0 } = options;
  const pad = ' '.repeat(indent);
  const label = toPrinterText(`${pad}${String(left).slice(0, 22)}`);
  const right = formatMixRightColumns(
    formatNum(qty),
    formatMoney(total, sym, cfg),
    `${formatNum(share)}%`
  );
  if (bold) {
    printer.style('b');
  }
  printLineLeftRight(printer, label, right);
  if (bold) {
    printer.style('normal');
  }
}

function printModifierRow(printer, modifier, exclusiveSales, dishIndent = 2) {
  const depth = Number.isFinite(Number(modifier.depth)) ? Math.max(1, Number(modifier.depth)) : 1;
  // Nest under the dish name: dish uses dishIndent spaces; each depth adds 2 more.
  const indent = dishIndent + depth * 2;
  const pad = ' '.repeat(indent);
  const label = toPrinterText(`${pad}- ${String(modifier.name || '').slice(0, 20)}`);
  const modTotal = safeNumber(modifier.price) * safeNumber(modifier.quantity);
  const right = formatMixRightColumns(
    formatNum(modifier.quantity),
    formatNum(modifier.price),
    `${formatNum(pct(modTotal, exclusiveSales))}%`
  );
  printLineLeftRight(printer, label, right, { small: true });
}

function printProductMix(printer, categoryMix, exclusiveSales, sym, L, cfg) {
  const itemLabel = L.item || 'Item';
  printLineLeftRight(
    printer,
    toPrinterText(itemLabel),
    formatMixRightColumns('Qty', 'Total', '%')
  );
  if (!categoryMix || categoryMix.length === 0) {
    printText(printer, L.noCategoryData || 'No category data for this date.');
    return;
  }

  const ex = exclusiveSales;
  const dishIndent = 2;
  categoryMix.forEach((category) => {
    printMixRow(
      printer,
      category.name,
      category.quantity,
      category.total,
      pct(category.total, ex),
      sym,
      { bold: true },
      cfg
    );

    (category.dishes || []).forEach((dish) => {
      printMixRow(
        printer,
        dish.name,
        dish.quantity,
        dish.total,
        pct(dish.total, ex),
        sym,
        { indent: dishIndent },
        cfg
      );

      (dish.modifiers || []).forEach((modifier) => {
        printModifierRow(printer, modifier, ex, dishIndent);
      });
    });
  });
}

function printPaymentTypes(printer, paymentTypes, grandTotalDue, sym, line, L, cfg) {
  const rows = (paymentTypes || []).filter((payment) => safeNumber(payment.total) > 0);
  if (rows.length === 0) {
    printText(printer, L.noPaymentData || 'No payment data for this date.');
    return;
  }
  rows.forEach((payment) => {
    const share = formatNum(pct(payment.total, grandTotalDue)) + '%';
    line(
      `${payment.name}${qtyBracket(payment.count)}`,
      `${formatMoney(payment.total, sym, cfg)}  ${share}`
    );
  });
}

function printSaleGroups(printer, rows, emptyLabel, line, sym, cfg) {
  if (!rows || rows.length === 0) {
    printText(printer, emptyLabel);
    return;
  }
  rows.forEach((row) => {
    line(
      `${row.name}${qtyBracket(row.ordersCount)}`,
      formatMoney(row.total, sym, cfg)
    );
  });
}

function printTaxesBreakdown(printer, taxesList, taxCollected, sym, line, L, cfg) {
  if (!taxesList || taxesList.length === 0) {
    printText(printer, L.noTaxRows || 'No tax rows for this date.');
    return;
  }
  taxesList.forEach((tax) => {
    const share = formatNum(pct(tax.total, taxCollected)) + '%';
    line(
      `${tax.name}%${qtyBracket(tax.count)}`,
      `${formatMoney(tax.total, sym, cfg)}  ${share}`
    );
  });
}

function printOperationalControls(printer, s, sym, line, L, cfg) {
  line(L.voids || 'Voids', formatMoney(s.voids, sym, cfg));
  line(L.refunds || 'Refunds', formatMoney(s.refunds, sym, cfg));
  line(
    L.covers || 'Covers',
    `${formatNum(s.covers)} / ${formatMoney(s.averageCover, sym, cfg)}`
  );
  line(
    L.ordersChecks || 'Orders / checks',
    `${formatNum(s.ordersCount)} / ${formatMoney(s.averageOrderCheck, sym, cfg)}`
  );
}

function safeNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function printSummaryHeader(printer, s, L) {
  const titleTemplate = L.summaryTitle || 'Daily sales summary - {{date}}';
  const title = toPrinterText(titleTemplate.replace('{{date}}', s.date));

  printer.align('ct').style('bu').text(title).style('normal');
  if (s.windowRange) {
    const rangeTemplate = L.windowRange || 'Period: {{range}}';
    printer.align('ct').text(toPrinterText(rangeTemplate.replace('{{range}}', String(s.windowRange))));
  }
  printer.align('lt');
  printer.drawLine();
}

function printSalesRevenue(printer, s, sym, line, L, sectionTitle, cfg) {
  sect(printer, sectionTitle || L.salesRevenue || '1. Sales revenue');
  line(L.exclusiveSales || 'Exclusive sales', formatMoney(s.exclusiveSales, sym, cfg));
  line(L.extras || 'Extras', formatMoney(s.totalExtras, sym, cfg));
  line(L.grossSales || 'Gross sales', formatMoney(s.grossSales, sym, cfg));
  line(L.itemDiscounts || 'Item discounts', formatMoney(s.itemDiscounts, sym, cfg));
  line(L.subtotalDiscounts || 'Subtotal discounts', formatMoney(s.subtotalDiscounts, sym, cfg));
  line(L.couponDiscounts || 'Coupon discounts', formatMoney(s.couponDiscounts, sym, cfg));
  line(L.discountsMinus || '(-) Discounts', formatMoney(s.discounts, sym, cfg));
  line(L.netSales || 'Net sales', formatMoney(s.netSales, sym, cfg));
}

function printSurchargesTaxes(printer, s, sym, line, L, sectionTitle, includeBreakdown, cfg) {
  sect(printer, sectionTitle || L.surchargesTaxes || '2. Surcharges and taxes');
  line(L.serviceCharges || 'Service charges', formatMoney(s.serviceCharges, sym, cfg));
  line(L.taxes || 'Taxes', formatMoney(s.taxCollected, sym, cfg));
  printer.style('bu');
  line(L.totalRevenue || 'Total revenue', formatMoney(s.totalRevenue, sym, cfg));
  printer.style('normal');
  if (includeBreakdown) {
    printTaxesBreakdown(printer, s.taxesList, s.taxCollected, sym, line, L, cfg);
  }
}

function printSettlementCashier(printer, s, sym, line, L, sectionTitle, cfg) {
  sect(printer, sectionTitle || L.settlementCashier || '3. Settlement and cashier');
  line(L.amountDueBeforeTips || 'Amount due (before tips)', formatMoney(s.amountDue, sym, cfg));
  line(L.tips || 'Tips', formatMoney(s.tips, sym, cfg));
  printer.style('bu');
  line(L.grandTotalDue || 'Grand total (due)', formatMoney(s.grandTotalDue, sym, cfg));
  printer.style('normal');
  line(L.amountCollected || 'Amount collected', formatMoney(s.amountCollected, sym, cfg));
  line(L.rounding || 'Rounding', formatMoney(s.rounding, sym, cfg));
  line(L.changeVariance || 'Change / variance', formatMoney(s.changeGiven, sym, cfg));
}

function printMinimalDailySalesSummary(printer, data, cfg) {
  const sym = cfg.currencySymbol ?? '$';
  const L = cfg.labels || {};
  const s = computeSummary({
    ...data,
    timezone: cfg.timezone,
    locale: cfg.locale,
    dateFormat: cfg.dateFormat,
    timeFormat: cfg.timeFormat,
  });
  const line = (left, right) => printLineLeftRight(printer, toPrinterText(left), toPrinterText(right));

  printSummaryHeader(printer, s, L);
  printSalesRevenue(printer, s, sym, line, L, L.minimalSalesRevenue || '1. Sales revenue', cfg);
  printSurchargesTaxes(
    printer,
    s,
    sym,
    line,
    L,
    L.minimalSurchargesTaxes || '2. Surcharges and taxes',
    true,
    cfg
  );
  printSettlementCashier(
    printer,
    s,
    sym,
    line,
    L,
    L.minimalSettlementCashier || '3. Settlement and cashier',
    cfg
  );
  sect(printer, L.minimalOperationalControls || '4. Operational controls');
  printOperationalControls(printer, s, sym, line, L, cfg);
  sect(printer, L.minimalPaymentTypes || '5. Payment types');
  printPaymentTypes(printer, s.paymentTypes, s.grandTotalDue, sym, line, L, cfg);

  printVatLine(printer, cfg);
  feedBottomMargin(printer, cfg);
  printPrintingTimestamp(printer, cfg);
  printer.cut();
}

function printProductMixSummary(printer, data, cfg) {
  const sym = cfg.currencySymbol ?? '$';
  const L = cfg.labels || {};
  const s = computeSummary({
    ...data,
    timezone: cfg.timezone,
    locale: cfg.locale,
    dateFormat: cfg.dateFormat,
    timeFormat: cfg.timeFormat,
  });

  const titleTemplate = L.productMixTitle || 'Product mix - {{date}}';
  const title = toPrinterText(titleTemplate.replace('{{date}}', s.date));
  printer.align('ct').style('bu').text(title).style('normal');
  if (s.windowRange) {
    const rangeTemplate = L.windowRange || 'Period: {{range}}';
    printer.align('ct').text(toPrinterText(rangeTemplate.replace('{{range}}', String(s.windowRange))));
  }
  printer.align('lt');
  printer.drawLine();
  printProductMix(printer, s.categoryMix, s.exclusiveSales, sym, L, cfg);

  printVatLine(printer, cfg);
  feedBottomMargin(printer, cfg);
  printPrintingTimestamp(printer, cfg);
  printer.cut();
}

function printDailySalesSummary(printer, data, cfg) {
  if (data && data.variant === 'minimal') {
    printMinimalDailySalesSummary(printer, data, cfg);
    return;
  }
  if (data && data.variant === 'product_mix') {
    printProductMixSummary(printer, data, cfg);
    return;
  }

  const sym = cfg.currencySymbol ?? '$';
  const L = cfg.labels || {};
  const s = computeSummary({
    ...data,
    timezone: cfg.timezone,
    locale: cfg.locale,
    dateFormat: cfg.dateFormat,
    timeFormat: cfg.timeFormat,
  });
  const line = (left, right) => printLineLeftRight(printer, toPrinterText(left), toPrinterText(right));

  printSummaryHeader(printer, s, L);
  printSalesRevenue(printer, s, sym, line, L, undefined, cfg);
  printSurchargesTaxes(printer, s, sym, line, L, undefined, false, cfg);
  printSettlementCashier(printer, s, sym, line, L, undefined, cfg);

  sect(printer, L.operationalControls || '4. Operational controls');
  printOperationalControls(printer, s, sym, line, L, cfg);

  sect(printer, L.productMix || '5. Product mix');
  printProductMix(printer, s.categoryMix, s.exclusiveSales, sym, L, cfg);

  sect(printer, L.orderTypes || '6. Sale by order type');
  printSaleGroups(
    printer,
    s.orderTypes,
    L.noOrderTypes || 'No order type data for this date.',
    line,
    sym,
    cfg
  );

  sect(printer, L.orderTakers || '7. Sale by order taker');
  printSaleGroups(
    printer,
    s.orderTakers,
    L.noOrderTakers || 'No order taker data for this date.',
    line,
    sym,
    cfg
  );

  sect(printer, L.paymentTypes || '8. Payment types');
  printPaymentTypes(printer, s.paymentTypes, s.grandTotalDue, sym, line, L, cfg);

  sect(printer, L.taxesBreakdown || '9. Taxes breakdown');
  printTaxesBreakdown(printer, s.taxesList, s.taxCollected, sym, line, L, cfg);

  sect(printer, L.discountsBreakdown || '10. Discounts breakdown');
  if (!s.discountsList || s.discountsList.length === 0) {
    printText(printer, L.noDiscountRows || 'No discount rows for this date.');
  } else {
    s.discountsList.forEach((discount) => {
      const share = formatNum(pct(discount.total, s.discounts)) + '%';
      line(
        `${discount.name}${qtyBracket(discount.count)}`,
        `${formatMoney(discount.total, sym, cfg)}  ${share}`
      );
    });
  }

  sect(printer, L.tipsBreakdown || '11. Tips');
  line(
    `${L.tips || 'Tips'}${qtyBracket(s.tipsCount || 0)}`,
    formatMoney(s.tips, sym, cfg)
  );

  sect(printer, L.extrasBreakdown || '12. Extras breakdown');
  if (!s.extrasList || s.extrasList.length === 0) {
    printText(printer, L.noExtras || 'No extras found for this date.');
  } else {
    s.extrasList.forEach((extra) => {
      const share = formatNum(pct(extra.total, s.totalExtras)) + '%';
      line(
        `${extra.name}${qtyBracket(extra.count)}`,
        `${formatMoney(extra.total, sym, cfg)}  ${share}`
      );
    });
  }

  sect(printer, L.couponsBreakdown || '13. Coupons breakdown');
  if (!s.couponsList || s.couponsList.length === 0) {
    printText(printer, L.noCoupons || 'No coupon usage for this date.');
  } else {
    s.couponsList.forEach((coupon) => {
      line(
        `${coupon.name}${qtyBracket(coupon.count)}`,
        formatMoney(coupon.total, sym, cfg)
      );
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
  }).then(() => printer);
}

module.exports = { build };
