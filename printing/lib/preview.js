'use strict';

const { formatMoney, normalizeConfig, normalizeSections, formatPrintingTimestamp } = require('./receipt-helpers');
const { mapOrderToTemp, mapOrderToFinal, mapOrderToDelivery, mapOrderToRefund } = require('./order-mapping');
const { computeSummary, formatNum } = require('./summary-mapping');

/**
 * Single-discount header: "Discount (Summer Sale 10%)".
 * @param {string|null|undefined} name
 * @param {string|null|undefined} valueType
 * @param {number|null|undefined} rate
 * @param {string} [fallback='Discount']
 * @returns {string}
 */
function formatDiscountMinimalPreview(name, valueType, rate, fallback) {
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

function sectionAlignClass(align) {
  if (align === 'left') return 'left';
  if (align === 'right') return 'right';
  return 'center';
}

function sectionSizeClass(size) {
  if (size === 'large') return 'size-large';
  if (size === 'medium') return 'size-medium';
  return 'size-normal';
}

function renderSectionsToHtml(sections) {
  const parts = [];
  normalizeSections(sections).filter((section) => section.enabled).forEach((section) => {
    const alignCls = sectionAlignClass(section.align);
    if (section.type === 'image' && section.content) {
      const src = /^data:/.test(section.content) ? section.content : `data:image/png;base64,${section.content}`;
      parts.push(`<div class="section ${alignCls}"><img class="receipt-img" src="${escapeHtml(src)}" alt="" /></div>`);
    } else if (section.type === 'text' && section.content) {
      parts.push(`<div class="section ${alignCls} ${sectionSizeClass(section.size)}">${escapeHtml(section.content)}</div>`);
    }
  });
  return parts.join('\n  ');
}

/**
 * Stacked fiscal logos + QR placeholders (matches print: logo then QR).
 * @param {Array|{value?:string,description?:string,logo?:string}|string|undefined} qrcodes
 * @param {string|undefined} qrcode
 */
function renderFiscalQrToHtml(qrcodes, qrcode) {
  const items = [];
  if (Array.isArray(qrcodes) && qrcodes.length) {
    qrcodes.forEach((item) => {
      if (item == null) return;
      if (typeof item === 'string') {
        const v = item.trim();
        if (v) items.push({ value: v, description: '', logo: '' });
        return;
      }
      const value = String(item.value ?? item.qrcode ?? '').trim();
      if (!value) return;
      items.push({
        value,
        description: String(item.description ?? '').trim(),
        logo: item.logo != null ? String(item.logo).trim() : '',
      });
    });
  } else if (qrcode != null && String(qrcode).trim()) {
    items.push({ value: String(qrcode).trim(), description: '', logo: '' });
  }
  if (!items.length) return '';

  return items.map((item) => {
    const logoHtml = item.logo
      ? `<div class="center fiscal-logo"><img class="receipt-img" src="${escapeHtml(/^data:/.test(item.logo) ? item.logo : `data:image/png;base64,${item.logo}`)}" alt="Provider" /></div>`
      : '';
    const qrPlaceholder = `<div class="center fiscal-qr">[QR] ${escapeHtml(item.value.slice(0, 28))}${item.value.length > 28 ? '…' : ''}</div>`;
    const desc = item.description
      ? String(item.description)
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => `<div class="center">${escapeHtml(line)}</div>`)
        .join('')
      : '';
    return `<div class="fiscal-block">${logoHtml}${qrPlaceholder}${desc}</div>`;
  }).join('');
}

function renderBrandingHeader(cfg) {
  const parts = [];
  if (cfg.showLogo && cfg.logo && String(cfg.logo).trim()) {
    const src = /^data:/.test(cfg.logo) ? cfg.logo : `data:image/png;base64,${cfg.logo}`;
    parts.push(`<div class="logo"><img class="receipt-img" src="${escapeHtml(src)}" alt="Logo" /></div>`);
  }
  const headerSections = renderSectionsToHtml(cfg.headerSections);
  if (headerSections) parts.push(headerSections);
  return parts.join('\n  ');
}

const receiptPreviewStyles = `
    body { margin: 0; padding: 16px; background: #f0f0f0; font-family: 'Courier New', Consolas, monospace; }
    .receipt { width: 280px; margin: 0 auto; padding: 12px; background: #fff; box-shadow: 0 1px 4px rgba(0,0,0,0.15); font-size: 12px; line-height: 1.4; }
    .title, .center { text-align: center; }
    .left { text-align: left; }
    .right { text-align: right; }
    .title { font-weight: bold; margin-bottom: 8px; }
    .title.size-medium { font-size: 14px; text-decoration: underline; }
    .feed-spacer { height: 8px; }
    .row { display: flex; justify-content: space-between; gap: 12px; }
    .row span:last-child { text-align: right; }
    .bold { font-weight: bold; }
    .thankyou { margin-top: 8px; }
    .section { margin: 2px 0; }
    .size-medium { font-size: 14px; }
    .size-large { font-size: 16px; font-weight: bold; }
    hr { border: none; border-top: 1px dashed #333; margin: 6px 0; }
    .logo { text-align: center; margin-bottom: 4px; }
    .receipt-img { width: 150px; height: 150px; max-width: 100%; object-fit: contain; display: inline-block; vertical-align: middle; }
    .fiscal-block { margin: 8px 0; text-align: center; }
    .fiscal-qr { font-size: 10px; border: 1px solid #999; padding: 12px 8px; margin: 4px auto; max-width: 150px; }
    .fiscal-logo { margin-bottom: 4px; }
`;

function escapeHtml(s) {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Render bill as HTML (receipt-style) for preview. Mirrors bill-layout.js structure.
 */
function renderBillToHtml(bill, config, opts) {
  const cfg = config || {};
  const L = cfg.labels || {};
  const sym = cfg.currencySymbol ?? '$';
  const {
    title = L.bill || 'Bill',
    address,
    phone,
    notes,
    thankYou,
    showPayments = false,
    showChange = false,
    showDeliveryLine = false,
  } = opts || {};

  const invoiceLabel = L.invoice || 'Invoice#';
  const addressLabel = L.address || 'Address';
  const phoneLabel = L.phone || 'Phone';
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

  const row = (left, right) =>
    `<div class="row"><span>${escapeHtml(left)}</span><span>${escapeHtml(right)}</span></div>`;

  const parts = [];

  const brandingHeader = renderBrandingHeader(cfg);
  if (brandingHeader) parts.push(brandingHeader);

  parts.push(`<div class="title size-medium">${escapeHtml(title)}</div>`);
  parts.push('<div class="feed-spacer"></div>');
  if (cfg.showVatNumber && cfg.vatNumber) {
    parts.push(`<div class="center">${escapeHtml(cfg.vatName + ': ' + cfg.vatNumber)}</div>`);
  }
  parts.push(row(`${invoiceLabel} ${bill.orderId || ''}`, bill.date || ''));
  parts.push(row(bill.table || '', bill.userName || ''));
  if (address) parts.push(`<div class="row"><span>${escapeHtml(addressLabel)}: ${escapeHtml(String(address).slice(0, 40))}</span></div>`);
  if (phone) parts.push(`<div class="row"><span>${escapeHtml(phoneLabel)}: ${escapeHtml(String(phone))}</span></div>`);
  parts.push('<hr/>');

  // Items
  (bill.items || []).forEach((it) => {
    const name = (it.name || it.title || '').slice(0, 28);
    const qty = it.qty != null ? it.qty : 1;
    const lineTotal = it.total != null ? Number(it.total) : (it.price || 0) * qty;
    parts.push(row(`${name} x${qty}`, formatMoney(lineTotal, sym)));
  });
  parts.push('<hr/>');

  // Summary
  parts.push(row(`${itemsLabel} (${bill.itemsCount || 0})`, formatMoney(bill.itemsTotal, sym)));
  if (bill.tax != null && Number(bill.tax) !== 0) {
    parts.push(row(`${taxLabel} (${bill.taxLabel || taxLabel})`, formatMoney(bill.tax, sym)));
  }
  if (Array.isArray(bill.discountLines) && bill.discountLines.length === 1) {
    const d = bill.discountLines[0];
    const singleLabel = formatDiscountMinimalPreview(d.rawName, d.valueType, d.rate, discountLabel);
    parts.push(row(singleLabel, '-' + formatMoney(d.amount, sym)));
  } else if (Array.isArray(bill.discountLines) && bill.discountLines.length > 1) {
    parts.push(row(discountLabel, '-' + formatMoney(bill.discountAmount, sym)));
    bill.discountLines.forEach((d) => {
      parts.push(row('  ' + (d.name || discountLabel), '-' + formatMoney(d.amount, sym)));
    });
  } else if (bill.discount && bill.discountAmount != null && Number(bill.discountAmount) !== 0) {
    parts.push(row(bill.discountLabel || discountLabel, formatMoney(bill.discountAmount, sym)));
  }
  if (bill.serviceChargeLabel && bill.serviceChargeAmount != null && Number(bill.serviceChargeAmount) !== 0) {
    parts.push(row(bill.serviceChargeLabel, formatMoney(bill.serviceChargeAmount, sym)));
  }
  (bill.extras || []).forEach((e) => {
    parts.push(row(e.name || extraLabel, formatMoney(e.value, sym)));
  });
  if (bill.tipAmount != null && Number(bill.tipAmount) !== 0) {
    parts.push(row(bill.tipLabel || tipLabel, formatMoney(bill.tipAmount, sym)));
  }
  if (showDeliveryLine && bill.deliveryCharges != null && Number(bill.deliveryCharges) !== 0) {
    parts.push(row(deliveryChargesLabel, formatMoney(bill.deliveryCharges, sym)));
  }
  parts.push('<hr/>');

  // Total
  parts.push(`<div class="row bold"><span>${escapeHtml(totalLabel)}</span><span>${escapeHtml(formatMoney(bill.total, sym))}</span></div>`);

  if (showPayments && Array.isArray(bill.payments) && bill.payments.length > 0) {
    parts.push('<hr/>');
    bill.payments.forEach((p) => {
      parts.push(row(p.method || paymentLabel, formatMoney(p.amount, sym)));
    });
  }
  if (showChange && bill.change != null && Number(bill.change) !== 0) {
    parts.push('<hr/>');
    parts.push(`<div class="row bold"><span>${escapeHtml(changeLabel)}</span><span>${escapeHtml(formatMoney(bill.change, sym))}</span></div>`);
  }

  if (notes) {
    parts.push('<hr/>');
    parts.push(`<div class="row"><span>${escapeHtml(notesLabel)}: ${escapeHtml(String(notes).slice(0, 48))}</span></div>`);
  }
  if (thankYou) {
    parts.push(`<div class="center thankyou">${escapeHtml(thankYou)}</div>`);
  }
  const fiscalHtml = renderFiscalQrToHtml(opts && opts.qrcodes, opts && opts.qrcode);
  if (fiscalHtml) parts.push(fiscalHtml);
  const footerSections = renderSectionsToHtml(cfg.footerSections);
  if (footerSections) parts.push(footerSections);
  parts.push(`<div class="center thankyou">${escapeHtml(formatPrintingTimestamp(cfg))}</div>`);

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Receipt preview</title>
  <style>${receiptPreviewStyles}
  </style>
</head>
<body>
  <div class="receipt">${parts.join('\n  ')}</div>
</body>
</html>`;
}

function pct(x, of) {
  const n = Number(of);
  return Number.isFinite(n) && n > 0 ? (Number(x) / n * 100) : 0;
}

/**
 * Render summary as HTML. Mirrors DailySalesSummaryReport (daily.sales.summary.report.tsx).
 * data: { orders: Order[] | { data: Order[] }, date?: string }
 */
function renderSummaryToHtml(data, config) {
  const cfg = normalizeConfig(config || {});
  const L = cfg.labels || {};
  const sym = cfg.currencySymbol ?? '$';
  const s = computeSummary({
    ...(data || {}),
    timezone: cfg.timezone,
    locale: cfg.locale,
  });
  const row = (a, b) => `<div class="row"><span>${escapeHtml(a)}</span><span>${escapeHtml(b)}</span></div>`;
  const sect = (t) => `<div class="sect">${escapeHtml(t)}</div>`;
  const ex = s.exclusiveSales;
  const titleTemplate = L.summaryTitle || 'Daily sales summary — {{date}}';
  const title = titleTemplate.replace('{{date}}', s.date);

  const parts = [];
  const brandingHeader = renderBrandingHeader(cfg);
  if (brandingHeader) parts.push(brandingHeader);
  parts.push(`<div class="title">${escapeHtml(title)}</div>`);
  parts.push('<hr/>');
  parts.push(sect(L.salesRevenue || '1. Sales revenue'));
  parts.push(row(L.exclusiveSales || 'Exclusive sales', formatMoney(s.exclusiveSales, sym)));
  parts.push(row(L.extras || 'Extras', formatMoney(s.totalExtras, sym)));
  parts.push(row(L.grossSales || 'Gross sales', formatMoney(s.grossSales, sym)));
  parts.push(row(L.itemDiscounts || 'Item discounts', formatMoney(s.itemDiscounts, sym)));
  parts.push(row(L.subtotalDiscounts || 'Subtotal discounts', formatMoney(s.subtotalDiscounts, sym)));
  parts.push(row(L.couponDiscounts || 'Coupon discounts', formatMoney(s.couponDiscounts, sym)));
  parts.push(row(L.discountsMinus || '(−) Discounts', formatMoney(s.discounts, sym)));
  parts.push(row(L.netSales || 'Net sales', formatMoney(s.netSales, sym)));
  parts.push('<hr/>');
  parts.push(sect(L.surchargesTaxes || '2. Surcharges and taxes'));
  parts.push(row(L.serviceCharges || 'Service charges', formatMoney(s.serviceCharges, sym)));
  parts.push(row(L.taxes || 'Taxes', formatMoney(s.taxCollected, sym)));
  parts.push(`<div class="row bold"><span>${escapeHtml(L.totalRevenue || 'Total revenue')}</span><span>${escapeHtml(formatMoney(s.totalRevenue, sym))}</span></div>`);
  parts.push('<hr/>');
  parts.push(sect(L.settlementCashier || '3. Settlement and cashier'));
  parts.push(row(L.amountDueBeforeTips || 'Amount due (before tips)', formatMoney(s.amountDue, sym)));
  parts.push(row(L.tips || 'Tips', formatMoney(s.tips, sym)));
  parts.push(`<div class="row bold"><span>${escapeHtml(L.grandTotalDue || 'Grand total (due)')}</span><span>${escapeHtml(formatMoney(s.grandTotalDue, sym))}</span></div>`);
  parts.push(row(L.amountCollected || 'Amount collected', formatMoney(s.amountCollected, sym)));
  parts.push(row(L.rounding || 'Rounding', formatMoney(s.rounding, sym)));
  parts.push(row(L.changeVariance || 'Change / variance', formatMoney(s.changeGiven, sym)));
  parts.push('<hr/>');
  parts.push(sect(L.operationalControls || '4. Operational controls'));
  parts.push(row(L.voids || 'Voids', formatMoney(s.voids, sym)));
  parts.push(row(L.refunds || 'Refunds', formatMoney(s.refunds, sym)));
  parts.push(row(L.covers || 'Covers', formatNum(s.covers)));
  parts.push(row(L.averageCover || 'Average cover', formatMoney(s.averageCover, sym)));
  parts.push(row(L.ordersChecks || 'Orders / checks', formatNum(s.ordersCount)));
  parts.push(row(L.averageOrderCheck || 'Average order / check', formatMoney(s.averageOrderCheck, sym)));
  parts.push('<hr/>');
  parts.push(sect(L.productMix || '5. Product mix'));
  parts.push(
    `<div class="row4"><span>${escapeHtml(L.item || 'Item')}</span><span>${escapeHtml(L.qty || 'Qty')}</span><span>${escapeHtml(L.total || 'Total')}</span><span>Share</span></div>`
  );
  if (!s.categoryMix || s.categoryMix.length === 0) {
    parts.push(`<p class="muted">${escapeHtml(L.noCategoryData || 'No category data for this date.')}</p>`);
  } else {
    s.categoryMix.forEach((category) => {
      const catShare = formatNum(pct(category.total, ex)) + '%';
      parts.push(
        `<div class="row4 boldish"><span>${escapeHtml(String(category.name))}</span><span>${formatNum(category.quantity)}</span><span>${escapeHtml(formatMoney(category.total, sym))}</span><span>${escapeHtml(catShare)}</span></div>`
      );
      (category.dishes || []).forEach((dish) => {
        const dishShare = formatNum(pct(dish.total, ex)) + '%';
        parts.push(
          `<div class="row4"><span class="pl">${escapeHtml(String(dish.name))}</span><span>${formatNum(dish.quantity)}</span><span>${escapeHtml(formatMoney(dish.total, sym))}</span><span>${escapeHtml(dishShare)}</span></div>`
        );
        (dish.modifiers || []).forEach((modifier) => {
          const depth = Number.isFinite(Number(modifier.depth)) ? Number(modifier.depth) : 1;
          const pl = Math.min(48, 8 + depth * 12);
          parts.push(
            `<div class="row4 mod"><span style="padding-left:${pl}px">- ${escapeHtml(String(modifier.name))}</span><span>${formatNum(modifier.quantity)}</span><span>${formatNum(modifier.price)}</span><span></span></div>`
          );
        });
      });
    });
  }
  parts.push('<hr/>');
  parts.push(sect(L.paymentTypes || '6. Payment types'));
  if (!s.paymentTypes || s.paymentTypes.length === 0) {
    parts.push(`<p class="muted">${escapeHtml(L.noPaymentData || 'No payment data for this date.')}</p>`);
  } else {
    s.paymentTypes.forEach((payment) => {
      const p = formatNum(pct(payment.total, s.amountDue)) + '%';
      parts.push(
        row(payment.name, `${formatMoney(payment.total, sym)}  ${p}`)
      );
    });
  }
  parts.push('<hr/>');
  parts.push(sect(L.taxesBreakdown || '7. Taxes breakdown'));
  if (!s.taxesList || s.taxesList.length === 0) {
    parts.push(`<p class="muted">${escapeHtml(L.noTaxRows || 'No tax rows for this date.')}</p>`);
  } else {
    s.taxesList.forEach((tax) => {
      const p = formatNum(pct(tax.total, s.taxCollected)) + '%';
      parts.push(row(`${tax.name}%`, `${formatMoney(tax.total, sym)}  ${p}`));
    });
  }
  parts.push('<hr/>');
  parts.push(sect(L.discountsBreakdown || '8. Discounts breakdown'));
  if (!s.discountsList || s.discountsList.length === 0) {
    parts.push(`<p class="muted">${escapeHtml(L.noDiscountRows || 'No discount rows for this date.')}</p>`);
  } else {
    s.discountsList.forEach((discount) => {
      const p = formatNum(pct(discount.total, s.discounts)) + '%';
      parts.push(row(discount.name, `${formatMoney(discount.total, sym)}  ${p}`));
    });
  }
  parts.push('<hr/>');
  parts.push(sect(L.extrasBreakdown || '9. Extras breakdown'));
  if (!s.extrasList || s.extrasList.length === 0) {
    parts.push(`<p class="muted">${escapeHtml(L.noExtras || 'No extras found for this date.')}</p>`);
  } else {
    s.extrasList.forEach((extra) => {
      const p = formatNum(pct(extra.total, s.totalExtras)) + '%';
      parts.push(row(extra.name, `${formatMoney(extra.total, sym)}  ${p}`));
    });
  }
  parts.push('<hr/>');
  parts.push(sect(L.couponsBreakdown || '10. Coupons breakdown'));
  if (!s.couponsList || s.couponsList.length === 0) {
    parts.push(`<p class="muted">${escapeHtml(L.noCoupons || 'No coupon usage for this date.')}</p>`);
  } else {
    s.couponsList.forEach((coupon) => {
      parts.push(row(coupon.name, formatMoney(coupon.total, sym)));
    });
  }
  if (cfg.showVatNumber && cfg.vatNumber) {
    parts.push('<hr/>');
    parts.push(`<div class="center">${escapeHtml(cfg.vatName + ': ' + cfg.vatNumber)}</div>`);
  }
  const footerSections = renderSectionsToHtml(cfg.footerSections);
  if (footerSections) {
    parts.push('<hr/>');
    parts.push(footerSections);
  }
  parts.push(`<div class="center">${escapeHtml(formatPrintingTimestamp(cfg))}</div>`);
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Summary preview</title>
  <style>
    body { margin: 0; padding: 16px; background: #f0f0f0; font-family: 'Courier New', Consolas, monospace; }
    .receipt { max-width: 420px; margin: 0 auto; padding: 12px; background: #fff; box-shadow: 0 1px 4px rgba(0,0,0,0.15); font-size: 12px; line-height: 1.4; }
    .title, .center { text-align: center; }
    .title { font-weight: bold; margin-bottom: 8px; font-size: 1.1rem; }
    .row { display: flex; justify-content: space-between; gap: 12px; }
    .row span:last-child { text-align: right; }
    .row4 { display: flex; justify-content: space-between; gap: 8px; }
    .row4 span:nth-child(1) { flex: 1.4; text-align: left; }
    .row4 span:nth-child(2) { width: 48px; text-align: right; }
    .row4 span:nth-child(3) { width: 72px; text-align: right; }
    .row4 span:nth-child(4) { width: 44px; text-align: right; }
    .bold { font-weight: bold; }
    .boldish { font-weight: 600; }
    .pl { padding-left: 12px; }
    .mod { font-size: 0.85rem; color: #4b5563; }
    .muted { font-size: 0.85rem; color: #6b7280; padding: 8px 0; margin: 0; }
    .sub { font-size: 0.75rem; color: #6b7280; margin: -2px 0 4px 0; }
    .sect { font-weight: bold; text-align: center; margin: 8px 0 4px 0; }
    hr { border: none; border-top: 1px solid #e5e7eb; margin: 6px 0; }
  </style>
</head>
<body>
  <div class="receipt">${parts.join('\n  ')}</div>
</body>
</html>`;
}

/**
 * Render kitchen ticket as HTML.
 */
function renderKitchenToHtml(data, config) {
  const cfg = normalizeConfig(config || {});
  const order = data && data.order;
  if (!order) return `<html><body><p>data.order required for kitchen preview</p></body></html>`;
  const { getOrderId, getOrderCreatedAt, getOrderUserName, getOrderType } = require('./order-mapping');
  const kitchenName = data.kitchenName || 'KOT';
  const isAddOn = !!data.isAddOn;
  const orderId = getOrderId(order);
  const createdAt = getOrderCreatedAt(order, { timezone: cfg.timezone, locale: cfg.locale });
  const orderTaker = getOrderUserName(order);
  const orderType = getOrderType(order);
  const table = data.table
    ? String(data.table.name || '') + String(data.table.number || '')
    : '';
  const items = Array.isArray(data.items) ? data.items : [];
  const parts = [];
  const brandingHeader = renderBrandingHeader(cfg);
  if (brandingHeader) parts.push(brandingHeader);
  parts.push(`<div class="title size-medium">${escapeHtml(kitchenName)}</div>`);
  parts.push('<hr/>');
  const bannerLabel = isAddOn ? 'ADDON' : 'New Order';
  const orderPart = orderId ? `Order# ${orderId}` : '';
  const orderBannerLine =
    orderPart && bannerLabel
      ? `${orderPart} | ${bannerLabel}`
      : orderPart || bannerLabel;
  if (orderBannerLine) {
    parts.push(`<div class="center bold">${escapeHtml(orderBannerLine)}</div>`);
  }
  if (table || orderType) {
    parts.push(
      `<div class="row"><span>${table ? `Table: ${escapeHtml(table)}` : ''}</span>` +
        `<span>${orderType ? `Order Type: ${escapeHtml(orderType)}` : ''}</span></div>`
    );
  }
  if (orderTaker || createdAt) {
    parts.push(
      `<div class="row"><span>${orderTaker ? `Order Taker: ${escapeHtml(orderTaker)}` : ''}</span>` +
        `<span>${createdAt ? `Time: ${escapeHtml(createdAt)}` : ''}</span></div>`
    );
  }
  parts.push('<hr/>');
  items.forEach((it) => {
    const dish = it.item || it.dish || {};
    const name = (dish.name || dish.title || '').slice(0, 28);
    const qty = it.quantity != null ? it.quantity : 1;
    parts.push(`<div class="row"><span>${escapeHtml(name)} x${qty}</span></div>`);
    if (it.comments) parts.push(`<div class="indent">>> ${escapeHtml(String(it.comments).slice(0, 26))}</div>`);
  });
  parts.push(`<div class="center" style="margin-top:8px">${escapeHtml(formatPrintingTimestamp(cfg))}</div>`);
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Kitchen preview</title>
  <style>
    body { margin: 0; padding: 16px; background: #f0f0f0; font-family: 'Courier New', Consolas, monospace; }
    .receipt { width: 280px; margin: 0 auto; padding: 12px; background: #fff; box-shadow: 0 1px 4px rgba(0,0,0,0.15); font-size: 12px; line-height: 1.4; }
    .title { text-align: center; font-weight: bold; margin-bottom: 8px; }
    .center { text-align: center; }
    .bold { font-weight: bold; }
    .size-medium { font-size: 14px; }
    .row { display: flex; justify-content: space-between; gap: 12px; }
    .indent { padding-left: 8px; }
    hr { border: none; border-top: 1px dashed #333; margin: 6px 0; }
  </style>
</head>
<body>
  <div class="receipt">${parts.join('\n  ')}</div>
</body>
</html>`;
}

/**
 * Render refund receipt as HTML. Matches refund.bill.tsx and refund-print.js.
 * data: { order: refundOrder, originalOrder }
 */
function renderRefundToHtml(data, config) {
  const cfg = normalizeConfig(config || {});
  const L = cfg.labels || {};
  const sym = cfg.currencySymbol ?? '$';
  const refundOrder = data && data.order;
  const originalOrder = data && data.originalOrder;
  if (!refundOrder) return `<html><body><p>data.order (refund order) is required for refund preview</p></body></html>`;
  const bill = mapOrderToRefund(refundOrder, originalOrder, {
    showInclusivePrices: !!cfg.showInclusivePrices,
    timezone: cfg.timezone,
    locale: cfg.locale,
  });
  const row = (left, right) =>
    `<div class="row"><span>${escapeHtml(left)}</span><span>${escapeHtml(right)}</span></div>`;

  const refundReceiptLabel = L.refundReceipt || 'REFUND RECEIPT';
  const originalInvoiceLabel = L.originalInvoice || 'Original Invoice#';
  const refundDateLabel = L.refundDate || 'Refund Date';
  const itemsLabel = L.items || 'Items';
  const taxLabel = L.tax || 'Tax';
  const discountLabel = L.discount || 'Discount';
  const extraLabel = L.extra || 'Extra';
  const tipLabel = L.tip || 'Tip';
  const refundTotalLabel = L.refundTotal || 'Refund Total';

  const parts = [];
  const brandingHeader = renderBrandingHeader(cfg);
  if (brandingHeader) parts.push(brandingHeader);
  parts.push(`<div class="title">${escapeHtml(refundReceiptLabel)}</div>`);
  if (cfg.showVatNumber && cfg.vatNumber) {
    parts.push(`<div class="center">${escapeHtml(cfg.vatName + ': ' + cfg.vatNumber)}</div>`);
  }
  parts.push(row(`${originalInvoiceLabel} ${bill.originalOrderId || ''}`, ''));
  parts.push(row(`${refundDateLabel}: ${bill.refundDate || ''}`, ''));
  parts.push('<hr/>');
  (bill.items || []).forEach((it) => {
    const name = (it.name || it.title || '').slice(0, 28);
    const qty = it.qty != null ? it.qty : 1;
    const lineTotal = it.total != null ? Number(it.total) : (it.price || 0) * qty;
    parts.push(row(`${name} x${qty}`, formatMoney(lineTotal, sym)));
  });
  parts.push('<hr/>');
  parts.push(row(`${itemsLabel} (${bill.itemsCount || 0})`, formatMoney(bill.itemsTotal, sym)));
  if (bill.tax != null && Number(bill.tax) !== 0) {
    parts.push(row(`${taxLabel} (${bill.taxLabel || taxLabel})`, formatMoney(bill.tax, sym)));
  }
  if (bill.discount && bill.discountAmount != null && Number(bill.discountAmount) !== 0) {
    parts.push(row(discountLabel, formatMoney(bill.discountAmount, sym)));
  }
  if (bill.serviceChargeLabel && bill.serviceChargeAmount != null && Number(bill.serviceChargeAmount) !== 0) {
    parts.push(row(bill.serviceChargeLabel, formatMoney(bill.serviceChargeAmount, sym)));
  }
  (bill.extras || []).forEach((e) => {
    parts.push(row(e.name || extraLabel, formatMoney(e.value, sym)));
  });
  if (bill.tipAmount != null && Number(bill.tipAmount) !== 0) {
    parts.push(row(bill.tipLabel || tipLabel, formatMoney(bill.tipAmount, sym)));
  }
  parts.push('<hr/>');
  parts.push(`<div class="row bold"><span>${escapeHtml(refundTotalLabel)}</span><span>${escapeHtml(formatMoney(bill.total, sym))}</span></div>`);
  const footerSections = renderSectionsToHtml(cfg.footerSections);
  if (footerSections) parts.push(footerSections);
  parts.push(`<div class="center thankyou">${escapeHtml(formatPrintingTimestamp(cfg))}</div>`);
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Refund preview</title>
  <style>${receiptPreviewStyles}
  </style>
</head>
<body>
  <div class="receipt">${parts.join('\n  ')}</div>
</body>
</html>`;
}

/**
 * Generate HTML preview for the given print type, data, and config.
 * @param {string} printType - temp | final | delivery | kitchen | summary | refund
 * @param {Object} data - { order?, originalOrder?, printType?, duplicate?, ... }
 * @param {Object} config - printer config
 * @returns {string} HTML
 */
function renderPreview(printType, data, config) {
  const cfg = normalizeConfig(config || {});
  const t = (printType || (data && data.printType) || 'final').toLowerCase();

  if (t === 'temp') {
    const order = data && data.order;
    if (!order) throw new Error('data.order is required for temp preview');
    const bill = mapOrderToTemp(order, {
      labels: cfg.labels,
      timezone: cfg.timezone,
      locale: cfg.locale,
      showInclusivePrices: !!cfg.showInclusivePrices,
    });
    return renderBillToHtml(bill, cfg, {
      title: bill.title,
      notes: bill.note || undefined,
      showPayments: false,
      showChange: false,
      showDeliveryLine: false,
      qrcodes: data && data.qrcodes,
      qrcode: data && data.qrcode,
    });
  }

  if (t === 'final') {
    const order = data && data.order;
    if (!order) throw new Error('data.order is required for final preview');
    const bill = mapOrderToFinal(order, {
      duplicate: !!data.duplicate,
      labels: cfg.labels,
      timezone: cfg.timezone,
      locale: cfg.locale,
      showInclusivePrices: !!cfg.showInclusivePrices,
    });
    return renderBillToHtml(bill, cfg, {
      title: bill.title,
      thankYou: bill.thankYou,
      showPayments: true,
      showChange: true,
      showDeliveryLine: false,
      qrcodes: data && data.qrcodes,
      qrcode: data && data.qrcode,
    });
  }

  if (t === 'delivery') {
    const order = data && data.order;
    if (!order) throw new Error('data.order is required for delivery preview');
    const bill = mapOrderToDelivery(order, {
      labels: cfg.labels,
      timezone: cfg.timezone,
      locale: cfg.locale,
      showInclusivePrices: !!cfg.showInclusivePrices,
    });
    return renderBillToHtml(bill, cfg, {
      title: bill.title,
      address: bill.address,
      phone: bill.phone,
      notes: bill.notes || undefined,
      showPayments: true,
      showChange: true,
      showDeliveryLine: true,
      qrcodes: data && data.qrcodes,
      qrcode: data && data.qrcode,
    });
  }

  if (t === 'kitchen') {
    return renderKitchenToHtml(data, config);
  }

  if (t === 'summary') {
    return renderSummaryToHtml(data, config);
  }

  if (t === 'refund') {
    return renderRefundToHtml(data, config);
  }

  throw new Error(`Unknown printType: ${printType}. Use: temp, final, delivery, kitchen, summary, refund`);
}

module.exports = { renderPreview, renderBillToHtml, renderSummaryToHtml, renderKitchenToHtml, renderRefundToHtml };
