'use strict';

const {
  normalizeConfig,
  printReceiptHeader,
  printLineLeftRight,
  formatMoney,
  printVatLine,
  feedBottomMargin,
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
  const right = `${formatNum(qty)}  ${formatMoney(total, sym)}  ${formatNum(share)}%`;
  if (bold) {
    printer.style('bu');
  }
  printLineLeftRight(printer, label, right);
  if (bold) {
    printer.style('normal');
  }
}

function printProductMix(printer, categoryMix, exclusiveSales, sym) {
  printLineLeftRight(printer, 'Item', 'Qty   Total   %');
  if (!categoryMix || categoryMix.length === 0) {
    printer.text('No category data for this date.');
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

function printPaymentTypes(printer, paymentTypes, amountDue, sym, line) {
  const rows = (paymentTypes || []).filter((payment) => safeNumber(payment.total) > 0);
  if (rows.length === 0) {
    printer.text('No payment data for this date.');
    return;
  }
  rows.forEach((payment) => {
    const share = formatNum(pct(payment.total, amountDue)) + '%';
    line(payment.name, `${formatMoney(payment.total, sym)}  ${share}`);
  });
}

function safeNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function printDailySalesSummary(printer, data, cfg) {
  const sym = cfg.currencySymbol || '$';
  const s = computeSummary(data);
  const line = (left, right) => printLineLeftRight(printer, left, right);

  printer.align('ct').style('bu').text(`Daily sales summary - ${s.date}`).style('normal');
  printer.align('lt');
  printer.drawLine();

  sect(printer, '1. Sales revenue');
  line('Exclusive sales', formatMoney(s.exclusiveSales, sym));
  line('Extras', formatMoney(s.totalExtras, sym));
  line('Gross sales', formatMoney(s.grossSales, sym));
  line('Item discounts', formatMoney(s.itemDiscounts, sym));
  line('Subtotal discounts', formatMoney(s.subtotalDiscounts, sym));
  line('Coupon discounts', formatMoney(s.couponDiscounts, sym));
  line('(-) Discounts', formatMoney(s.discounts, sym));
  line('Net sales', formatMoney(s.netSales, sym));

  sect(printer, '2. Surcharges and taxes');
  line('Service charges', formatMoney(s.serviceCharges, sym));
  line('Taxes', formatMoney(s.taxCollected, sym));
  printer.style('bu');
  line('Total revenue', formatMoney(s.totalRevenue, sym));
  printer.style('normal');

  sect(printer, '3. Settlement and cashier');
  line('Amount due (before tips)', formatMoney(s.amountDue, sym));
  line('Tips', formatMoney(s.tips, sym));
  printer.style('bu');
  line('Grand total (due)', formatMoney(s.grandTotalDue, sym));
  printer.style('normal');
  line('Amount collected', formatMoney(s.amountCollected, sym));
  line('Rounding', formatMoney(s.rounding, sym));
  line('Change / variance', formatMoney(s.changeGiven, sym));

  sect(printer, '4. Operational controls');
  line('Voids', formatMoney(s.voids, sym));
  line('Refunds', formatMoney(s.refunds, sym));
  line('Covers', formatNum(s.covers));
  line('Average cover', formatMoney(s.averageCover, sym));
  line('Orders / checks', formatNum(s.ordersCount));
  line('Average order / check', formatMoney(s.averageOrderCheck, sym));

  sect(printer, '5. Product mix');
  printProductMix(printer, s.categoryMix, s.exclusiveSales, sym);

  sect(printer, '6. Payment types');
  printPaymentTypes(printer, s.paymentTypes, s.amountDue, sym, line);

  sect(printer, '7. Taxes breakdown');
  if (!s.taxesList || s.taxesList.length === 0) {
    printer.text('No tax rows for this date.');
  } else {
    s.taxesList.forEach((tax) => {
      const share = formatNum(pct(tax.total, s.taxCollected)) + '%';
      line(`${tax.name}%`, `${formatMoney(tax.total, sym)}  ${share}`);
    });
  }

  sect(printer, '8. Discounts breakdown');
  if (!s.discountsList || s.discountsList.length === 0) {
    printer.text('No discount rows for this date.');
  } else {
    s.discountsList.forEach((discount) => {
      const share = formatNum(pct(discount.total, s.discounts)) + '%';
      line(discount.name, `${formatMoney(discount.total, sym)}  ${share}`);
    });
  }

  sect(printer, '9. Extras breakdown');
  if (!s.extrasList || s.extrasList.length === 0) {
    printer.text('No extras found for this date.');
  } else {
    s.extrasList.forEach((extra) => {
      const share = formatNum(pct(extra.total, s.totalExtras)) + '%';
      line(extra.name, `${formatMoney(extra.total, sym)}  ${share}`);
    });
  }

  sect(printer, '10. Coupons breakdown');
  if (!s.couponsList || s.couponsList.length === 0) {
    printer.text('No coupon usage for this date.');
  } else {
    s.couponsList.forEach((coupon) => {
      line(coupon.name, formatMoney(coupon.total, sym));
    });
  }

  printVatLine(printer, cfg);
  feedBottomMargin(printer, cfg);
  printer.feed(2).cut();
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
