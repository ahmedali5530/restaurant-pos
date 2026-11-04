'use strict';

/**
 * Map Order (from src/api/model/order.ts) plain object to print-builder shapes.
 * Order: { invoice_number, split, created_at, table, items, tax_amount, discount_amount, service_charge_amount, tip_amount, payments, customer, delivery, order_type, tags, ... }
 * OrderItem: { item (Dish), quantity, price, comments, deleted_at, is_refunded, is_suspended, modifiers, ... }
 */

/**
 * Calculate MenuItem price including modifier groups (mirrors src/lib/cart.ts calculateCartItemPrice).
 * @param {Object} item - Cart/Menu item with { price, quantity, selectedGroups? }
 * @returns {number}
 */
function calculateCartItemPricePrint(item) {
  if (!item) return 0;
  const qty = item.quantity != null ? item.quantity : 1;
  let price = Number(item.price || 0) * qty;

  if (Array.isArray(item.selectedGroups)) {
    price += item.selectedGroups.reduce((prev, group) => {
      if (!group || !Array.isArray(group.selectedModifiers)) return prev;
      return (
        prev +
        group.selectedModifiers.reduce((mPrev, mItem) => {
          if (!mItem) return mPrev;
          return mPrev + calculateCartItemPricePrint(mItem);
        }, 0)
      );
    }, 0);
  }

  return price;
}

/**
 * Calculate OrderItem line total including modifiers (mirrors src/lib/cart.ts calculateOrderItemPrice).
 * @param {Object} item - OrderItem with { price, quantity, modifiers? }
 * @returns {number}
 */
function calculateOrderItemPricePrint(item) {
  if (!item) return 0;
  const qty = item.quantity != null ? item.quantity : 1;
  let price = Number(item.price || 0) * qty;

  if (Array.isArray(item.modifiers)) {
    price += item.modifiers.reduce((prev, modifier) => {
      const groups = modifier && modifier.selectedModifiers;
      if (!Array.isArray(groups)) return prev;
      return (
        prev +
        groups.reduce((smPrev, smG) => {
          if (!smG) return smPrev;
          return smPrev + calculateCartItemPricePrint(smG);
        }, 0)
      );
    }, 0);
  }

  return price;
}

const MODIFIER_WALK_MAX_DEPTH = 32;

/**
 * Depth-first modifier lines (matches OrderItemModifiers: selectedGroups nest per selected modifier).
 * @param {Object} group - OrderItemModifier-shaped { selectedModifiers? }
 * @param {Array<{ depth: number, name: string }>} out
 * @param {number} depth
 */
function walkModifierGroup(group, out, depth) {
  if (!group || depth > MODIFIER_WALK_MAX_DEPTH) return;
  if (!Array.isArray(group.selectedModifiers)) return;
  group.selectedModifiers.forEach((sel) => {
    if (!sel) return;
    const dish = sel.dish || sel.item;
    const n = (dish && (dish.name || dish.title)) || '';
    const name = String(n).trim();
    if (name) out.push({ depth, name });
    if (depth >= MODIFIER_WALK_MAX_DEPTH) return;
    const nested = sel.selectedGroups;
    if (!Array.isArray(nested)) return;
    nested.forEach((nestedGroup) => {
      walkModifierGroup(nestedGroup, out, depth + 1);
    });
  });
}

/**
 * Prefer groups that already look like OrderItem modifiers (selectedModifiers).
 * Cart lines store the same tree on selectedGroups; bare catalog modifier ids
 * on `modifiers` must not win over selectedGroups.
 * @param {Object} orderItem
 * @returns {Array}
 */
function resolveModifierGroups(orderItem) {
  if (!orderItem) return [];
  const fromModifiers = Array.isArray(orderItem.modifiers) ? orderItem.modifiers : null;
  if (fromModifiers && fromModifiers.length > 0) {
    const hasSelected = fromModifiers.some(
      (group) => group && Array.isArray(group.selectedModifiers)
    );
    if (hasSelected) return fromModifiers;
  }
  if (Array.isArray(orderItem.selectedGroups) && orderItem.selectedGroups.length > 0) {
    return orderItem.selectedGroups;
  }
  return fromModifiers || [];
}

/**
 * Modifier display lines from an order item (OrderItem) or cart line.
 * Names only, no price; any nesting depth. Accepts OrderItem.modifiers or
 * cart selectedGroups (first-punch kitchen print).
 * @param {Object} orderItem - raw order item with modifiers / selectedGroups
 * @returns {Array<{ depth: number, name: string }>}
 */
function getOrderItemModifierLines(orderItem) {
  const groups = resolveModifierGroups(orderItem);
  if (groups.length === 0) return [];
  const lines = [];
  groups.forEach((group) => {
    walkModifierGroup(group, lines, 0);
  });
  return lines;
}

function getOrderId(order) {
  if (!order) return '';
  if (typeof order.invoice_display === 'string' && order.invoice_display.trim()) {
    const n = order.invoice_display.trim();
    const s = order.split;
    return s != null && s !== '' ? `${n}/${s}` : `${n}`;
  }
  const n = order.invoice_number != null && Number.isFinite(Number(order.invoice_number))
    ? order.invoice_number
    : (order.local_invoice_code || '');
  const s = order.split;
  if (!n && (s == null || s === '')) return '';
  return s != null && s !== '' ? `${n}/${s}` : `${n}`;
}

/**
 * Inflate net amount to gross for inclusive-tax lines (display only).
 * @param {number} net
 * @param {Array<{ rate?: number }>|undefined|null} taxes
 * @param {number|undefined|null} originalPrice - unit gross for the main dish only
 * @param {number|undefined|null} dishNet - unit net for the main dish only
 * @returns {number}
 */
function inflateInclusiveAmount(net, taxes, originalPrice, dishNet) {
  const netAmount = Number(net || 0);
  if (Array.isArray(taxes) && taxes.length > 0) {
    const rateSum = taxes.reduce((sum, tax) => sum + Number(tax.rate || 0), 0);
    return Math.round(netAmount * (1 + rateSum / 100) * 100) / 100;
  }
  if (originalPrice != null && dishNet != null) {
    const modifiersNet = netAmount - Number(dishNet || 0);
    return Math.round((Number(originalPrice) + modifiersNet) * 100) / 100;
  }
  return netAmount;
}

/**
 * Filter order items: exclude deleted, refunded, suspended.
 * @param {Object} order
 * @param {boolean} [showInclusivePrices=false]
 * @returns {Array<{ name, qty, price, total, notes, modifierLines }>}
 */
function getOrderItems(order, showInclusivePrices) {
  if (!order || !Array.isArray(order.items)) return [];
  return order.items
    .filter((it) => !it.deleted_at && it.is_refunded !== true && it.is_suspended !== true)
    .map((it) => {
      const dish = it.item || it.dish;
      const name = (dish && (dish.name || dish.title)) || '';
      const qty = it.quantity != null ? it.quantity : 1;
      const netLineTotal = calculateOrderItemPricePrint(it);
      let lineTotal = netLineTotal;
      if (showInclusivePrices && (it.tax_mode || 'exclusive') === 'inclusive') {
        const unitNet = qty > 0 ? netLineTotal / qty : netLineTotal;
        const dishNet = Number(it.price || 0);
        const unitGross = inflateInclusiveAmount(unitNet, it.taxes, it.original_price, dishNet);
        lineTotal = Math.round(unitGross * qty * 100) / 100;
      }
      const price = qty > 0 ? lineTotal / qty : 0;
      const total = lineTotal;
      const notes = it.comments || '';
      const modifierLines = getOrderItemModifierLines(it);
      return { name, qty, price, total, notes, modifierLines };
    });
}

/**
 * Delivery charges from order.delivery_charges or order.delivery. Not from extras (extras are in extrasTotal).
 */
function getOrderDeliveryCharges(order) {
  if (!order) return 0;
  if (order.delivery_charges != null) return Number(order.delivery_charges);
  const d = order.delivery;
  if (d && (d.delivery_charges != null || d.charges != null)) return Number(d.delivery_charges || d.charges || 0);
  return 0;
}

function getOrderTaxLabel(order) {
  if (!order) return 'Tax';
  // Handle multiple taxes from order items
  const items = order.items || [];
  const taxLabels = [];
  items.forEach(item => {
    if (item.taxes && item.taxes.length > 0) {
      item.taxes.forEach(tax => {
        const name = tax.name || 'Tax';
        const rate = tax.rate;
        const label = rate != null ? `${name} ${rate}%` : name;
        if (!taxLabels.includes(label)) {
          taxLabels.push(label);
        }
      });
    }
  });
  // Fallback to legacy single tax at order level
  if (taxLabels.length === 0 && order.tax) {
    const t = order.tax;
    const name = t.name || 'Tax';
    const rate = t.rate;
    return rate != null ? `${name} ${rate}%` : name;
  }
  return taxLabels.length > 0 ? taxLabels.join(', ') : 'Tax';
}

/**
 * Service charge label to match _common.bill: "Service charges (X)" or "Service charges (X%)".
 */
function getOrderServiceChargeLabel(order) {
  if (!order || !(order.service_charge > 0)) return '';
  const val = order.service_charge;
  const isPercent = order.service_charge_type === 'Percent' || order.service_charge_type === '%';
  return `Service charges (${val}${isPercent ? '%' : ''})`;
}

/**
 * User display name (order.user to match CommonBillParts). _common.bill uses order.user.
 */
function getOrderUserName(order) {
  if (!order || !order.user) return '';
  const u = order.user;
  if (typeof u === 'string') {
    if (isBareRecordId(u)) return '';
    return u;
  }
  const f = (u.first_name || '').trim();
  const l = (u.last_name || '').trim();
  return [f, l].filter(Boolean).join(' ') || (u.name || u.login || '');
}

/**
 * Payment summary. change = sum(payment.amount) - total to match final.bill.
 * @param {Object} order
 * @param {number} total - bill total
 * @returns {{ payments: Array<{ method, amount }>, paymentsSum: number, change: number }}
 */
function getOrderPaymentSummary(order, total) {
  const payTotal = Number(total || 0);
  if (!order) return { payments: [], paymentsSum: 0, change: -payTotal };
  const ps = order.payments || [];
  const payments = ps.map((p) => ({
    method: (p.payment_type && (p.payment_type.name || p.payment_type.title)) || 'Payment',
    amount: Number(p.amount || 0),
  }));
  const paymentsSum = payments.reduce((s, p) => s + p.amount, 0);
  const change = paymentsSum - payTotal;
  return { payments, paymentsSum, change };
}

/**
 * Totals to match final.bill / _common.bill:
 * total = itemsTotal + extrasTotal - discount_amount + tax_amount + service_charge_amount + tip_amount.
 * totalWithDelivery = total + deliveryCharges (for delivery slip).
 * itemsTotal is always net (exclusive), even when display line amounts are gross.
 */
function getOrderTotals(order) {
  const filteredItems = !order || !Array.isArray(order.items)
    ? []
    : order.items.filter((it) => !it.deleted_at && it.is_refunded !== true && it.is_suspended !== true);
  const itemsTotal = filteredItems.reduce((s, it) => s + calculateOrderItemPricePrint(it), 0);
  const discountAmount = Number(order.discount_amount || 0);
  const extrasTotal = (order.extras || []).reduce((s, e) => s + Number(e?.value || 0), 0);
  
  // Handle multiple taxes from order items
  let tax = Number(order.tax_amount || 0);
  if (order.items && order.items.length > 0) {
    const itemsTax = order.items.reduce((sum, item) => {
      if (!item.deleted_at && item.is_refunded !== true && item.is_suspended !== true) {
        let itemTax = Number(item.tax || 0);
        if (item.taxes && item.taxes.length > 0) {
          const basePrice = Number(item.price || 0) * Number(item.quantity || 1);
          itemTax = item.taxes.reduce((taxSum, t) => taxSum + Number(t.rate || 0), 0) * basePrice / 100;
        }
        return sum + itemTax;
      }
      return sum;
    }, 0);
    tax = itemsTax > 0 ? itemsTax : tax;
  }
  
  const service = Number(order.service_charge_amount || 0);
  const deliveryCharges = getOrderDeliveryCharges(order);
  const tip = Number(order.tip_amount || 0);
  const total = itemsTotal + extrasTotal - discountAmount + tax + service + tip;
  const totalWithDelivery = total + deliveryCharges;
  return { itemsTotal, discountAmount, extrasTotal, tax, service, deliveryCharges, tip, total, totalWithDelivery };
}

/**
 * For final receipt: single string of payment methods and amounts.
 * @param {Object} order
 * @returns {string}
 */
function getOrderPaymentsString(order) {
  if (!order || !Array.isArray(order.payments) || order.payments.length === 0) return '';
  return order.payments
    .map((p) => {
      const method = (p.payment_type && (p.payment_type.name || p.payment_type.title)) || 'Payment';
      return `${method}: ${Number(p.amount || 0).toFixed(2)}`;
    })
    .join(', ');
}

/**
 * Table display to match _common.bill: table.name + table.number (no space).
 */
function getOrderTable(order) {
  if (!order || !order.table) return '';
  const t = order.table;
  return String(t.name || '') + String(t.number || '');
}

/**
 * Order type display from order.order_type (string or object).
 */
function isBareRecordId(value) {
  if (value == null || value === '') return false;
  const s = typeof value === 'object' && value.id != null ? String(value.id) : String(value);
  return /^[a-zA-Z0-9_]+:[\w-]+$/.test(s) && !s.includes(' ');
}

function getOrderType(order) {
  if (!order) return '';
  const ot = order.order_type;
  if (!ot) return '';
  if (typeof ot === 'string') {
    if (isBareRecordId(ot)) return '';
    return ot;
  }
  if (typeof ot === 'object') {
    const name = ot.name || ot.title || ot.type || '';
    if (name) return String(name);
    if (isBareRecordId(ot)) return '';
  }
  return '';
}

/**
 * @param {Object} order
 * @returns {string}
 */
function getOrderDeliveryAddress(order) {
  if (!order) return '';
  const d = order.delivery;
  const c = order.customer;
  return (d && d.place) || (d && d.address) || (c && c.address) || '';
}

function getOrderCustomerName(order) {
  if (!order || !order.customer || typeof order.customer !== 'object') return '';
  return order.customer.name || '';
}

/**
 * Customer street address only (not delivery place) for temp/final receipts.
 * @param {Object} order
 * @returns {string}
 */
function getOrderCustomerAddress(order) {
  if (!order || !order.customer || typeof order.customer !== 'object') return '';
  const a = order.customer.address;
  return a != null && String(a).trim() ? String(a).trim() : '';
}

function getOrderDeliveryTime(order) {
  if (!order || !order.delivery) return '';
  const dt = order.delivery.deliveryTime;
  if (!dt) return '';
  if (dt === 'now' || dt === 'asap') return 'ASAP';
  const d = dt instanceof Date ? dt : new Date(dt);
  if (isNaN(d.getTime())) return String(dt);
  const h = d.getHours();
  const min = String(d.getMinutes()).padStart(2, '0');
  const am = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${String(h12).padStart(2, '0')}:${min} ${am}`;
}

/**
 * @param {Object} order
 * @returns {string}
 */
function getOrderPhone(order) {
  if (!order || !order.customer || typeof order.customer !== 'object') return '';
  const p = order.customer.phone;
  return p != null && String(p).trim() ? String(p) : '';
}

/**
 * @param {Object} order
 * @returns {string}
 */
function getOrderDeliveryNotes(order) {
  if (!order) return '';
  const d = order.delivery;
  return (d && (d.notes || d.notes_extra)) || '';
}

/**
 * @param {unknown} value
 * @returns {Date}
 */
function toJsDate(value) {
  if (!value) return new Date();
  return value instanceof Date ? value : new Date(value);
}

/**
 * @param {{ timezone?: string, locale?: string }|undefined} opts
 * @returns {{ timezone?: string, locale: string }}
 */
function getDateFormatOpts(opts) {
  const src = opts || {};
  return {
    timezone: typeof src.timezone === 'string' && src.timezone.trim()
      ? src.timezone.trim()
      : undefined,
    locale: typeof src.locale === 'string' && src.locale
      ? src.locale
      : 'en-US',
    dateFormat: typeof src.dateFormat === 'string' ? src.dateFormat.trim() : '',
    timeFormat: typeof src.timeFormat === 'string' ? src.timeFormat.trim() : '',
  };
}

function zonedParts(date, timezone, locale, hourCycle) {
  const formatOpts = {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle,
  };
  if (timezone) formatOpts.timeZone = timezone;
  let parts;
  try {
    parts = new Intl.DateTimeFormat(locale || 'en-US', formatOpts).formatToParts(date);
  } catch (e) {
    parts = new Intl.DateTimeFormat('en-US', formatOpts).formatToParts(date);
  }
  const get = (type) => {
    const part = parts.find((p) => p.type === type);
    return part ? part.value : '';
  };
  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    hour: get('hour'),
    minute: get('minute'),
    second: get('second'),
    dayPeriod: get('dayPeriod'),
  };
}

/**
 * Luxon-style pattern used by installer date_format / time_format (yyyy-MM-dd, HH:mm, hh:mm a).
 * @param {Date} date
 * @param {string} pattern
 * @param {string|undefined} timezone
 * @param {string|undefined} locale
 * @returns {string}
 */
function formatWithPattern(date, pattern, timezone, locale) {
  if (!pattern) return '';
  const h23 = zonedParts(date, timezone, locale, 'h23');
  const h12 = zonedParts(date, timezone, locale, 'h12');
  const hour24 = String(h23.hour).padStart(2, '0');
  const hour12 = String(h12.hour).padStart(2, '0');
  const minute = String(h23.minute).padStart(2, '0');
  const second = String(h23.second).padStart(2, '0');
  return String(pattern)
    .replace(/yyyy/g, h23.year)
    .replace(/yy/g, String(h23.year).slice(-2))
    .replace(/MM/g, String(h23.month).padStart(2, '0'))
    .replace(/dd/g, String(h23.day).padStart(2, '0'))
    .replace(/HH/g, hour24)
    .replace(/hh/g, hour12)
    .replace(/mm/g, minute)
    .replace(/ss/g, second)
    .replace(/(^|[^A-Za-z])M([^A-Za-z]|$)/g, (_, lead, tail) => `${lead}${Number(h23.month)}${tail}`)
    .replace(/(^|[^A-Za-z])d([^A-Za-z]|$)/g, (_, lead, tail) => `${lead}${Number(h23.day)}${tail}`)
    .replace(/(^|[^A-Za-z])H([^A-Za-z]|$)/g, (_, lead, tail) => `${lead}${Number(hour24)}${tail}`)
    .replace(/(^|[^A-Za-z])h([^A-Za-z]|$)/g, (_, lead, tail) => `${lead}${Number(hour12)}${tail}`)
    .replace(/(^|[^A-Za-z])a([^A-Za-z]|$)/g, (_, lead, tail) => `${lead}${h12.dayPeriod}${tail}`);
}

function appDateTimePattern(opts) {
  const dateFormat = opts && typeof opts.dateFormat === 'string' ? opts.dateFormat.trim() : '';
  const timeFormat = opts && typeof opts.timeFormat === 'string' ? opts.timeFormat.trim() : '';
  return [dateFormat, timeFormat].filter(Boolean).join(' ').trim();
}

/**
 * Date to match _common.bill: 'y-MM-dd hh:mm a' (e.g. 2026-01-17 11:52 PM).
 * @param {Object} order
 * @param {{ timezone?: string, locale?: string }} [opts]
 */
function getOrderDate(order, opts) {
  const d = toJsDate(order && order.created_at);
  const { timezone, locale, dateFormat, timeFormat } = getDateFormatOpts(opts);
  const pattern = appDateTimePattern({ dateFormat, timeFormat });
  if (pattern) {
    return formatWithPattern(d, pattern, timezone, locale);
  }
  const formatOpts = {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  };
  if (timezone) formatOpts.timeZone = timezone;
  const parts = new Intl.DateTimeFormat(locale, formatOpts).formatToParts(d);
  const get = (type) => {
    const part = parts.find((p) => p.type === type);
    return part ? part.value : '';
  };
  const y = get('year');
  const m = get('month');
  const day = get('day');
  const hour = get('hour').padStart(2, '0');
  const min = get('minute').padStart(2, '0');
  const am = get('dayPeriod') || '';
  return `${y}-${m}-${day} ${hour}:${min}${am ? ` ${am}` : ''}`;
}

/**
 * @param {Object} order
 * @param {{ timezone?: string, locale?: string }} [opts]
 * @returns {string} - time for kitchen
 */
function getOrderCreatedAt(order, opts) {
  const d = (!order || !order.created_at) ? new Date() : toJsDate(order.created_at);
  const { timezone, locale, timeFormat } = getDateFormatOpts(opts);
  if (timeFormat) {
    return formatWithPattern(d, timeFormat, timezone, locale);
  }
  const formatOpts = {};
  if (timezone) formatOpts.timeZone = timezone;
  return d.toLocaleTimeString(locale, formatOpts);
}

/**
 * @param {Object} order - table.priority or tags[0]
 * @returns {string}
 */
function getOrderPriority(order) {
  if (!order) return '';
  if (order.table && (order.table.priority || order.table.priority === 0)) return String(order.table.priority);
  if (Array.isArray(order.tags) && order.tags.length) return order.tags[0];
  return '';
}

/**
 * Detail label for a discount line: "10% Summer Sale" or "50 Summer Sale".
 * @param {string|null|undefined} name
 * @param {string|null|undefined} valueType
 * @param {number|null|undefined} rate
 * @returns {string}
 */
function formatDiscountDetail(name, valueType, rate) {
  const base = name || '';
  const n = Number(rate || 0);
  const isPercent = valueType === 'percent' || (!valueType && n > 0);
  if (valueType === 'fixed_amount' && n > 0) {
    return base ? n + ' ' + base : String(n);
  }
  if (isPercent && n > 0) {
    return base ? n + '% ' + base : n + '%';
  }
  return base;
}

/**
 * Single-discount header: "Discount (10% Summer Sale)" — value before name.
 * @param {string|null|undefined} name
 * @param {string|null|undefined} valueType
 * @param {number|null|undefined} rate
 * @param {string} [fallback='Discount']
 * @returns {string}
 */
function formatDiscountMinimal(name, valueType, rate, fallback) {
  const label = fallback || 'Discount';
  const n = Number(rate || 0);
  const isPercent = valueType === 'percent' || (!valueType && n > 0);
  if (name && valueType === 'fixed_amount' && n > 0) {
    return label + ' (' + n + ' ' + name + ')';
  }
  if (name && isPercent && n > 0) {
    return label + ' (' + n + '% ' + name + ')';
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
 * Common bill shape aligned with _common.bill.tsx and final.bill.tsx.
 * @param {Object} order
 * @param {{ forDelivery?: boolean, showInclusivePrices?: boolean, timezone?: string, locale?: string }} opts - forDelivery: use totalWithDelivery and include deliveryCharges in total
 */
function mapOrderToBill(order, opts) {
  const tot = getOrderTotals(order);
  const forDelivery = opts && opts.forDelivery;
  const showInclusivePrices = !!(opts && opts.showInclusivePrices);
  const total = forDelivery ? tot.totalWithDelivery : tot.total;
  const pay = getOrderPaymentSummary(order, total);
  const items = getOrderItems(order, showInclusivePrices);
  const tipLabel = order && order.tip_type === 'Percent' ? 'Tip %' : 'Tip';
  let discountLines = (order.order_discounts || [])
    .filter((od) => od && !od.removed_at)
    .map((od) => ({
      name: formatDiscountDetail(od.name, od.value_type, od.applied_rate),
      rawName: od.name || '',
      valueType: od.value_type || null,
      rate: od.applied_rate != null ? Number(od.applied_rate) : 0,
      amount: Number(od.applied_amount || 0),
    }));
  const discountName = order && order.discount && order.discount.name ? order.discount.name : null;
  const discountRate = order && order.discount_rate != null ? Number(order.discount_rate) : 0;
  const discountValueType = order && order.discount && order.discount.value_type
    ? order.discount.value_type
    : (discountRate > 0 ? 'percent' : null);

  if (discountLines.length === 0 && tot.discountAmount > 0) {
    discountLines = [{
      name: formatDiscountDetail(discountName, discountValueType, discountRate),
      rawName: discountName || '',
      valueType: discountValueType,
      rate: discountRate,
      amount: tot.discountAmount,
    }];
  }

  const customerName = getOrderCustomerName(order);
  const customerPhone = getOrderPhone(order);
  const customerAddress = getOrderCustomerAddress(order);

  return {
    orderId: getOrderId(order),
    table: getOrderTable(order),
    orderType: getOrderType(order),
    date: getOrderDate(order, opts),
    userName: getOrderUserName(order),
    customerName: customerName || undefined,
    phone: customerPhone || undefined,
    address: customerAddress || undefined,
    items,
    itemsCount: items.length,
    itemsTotal: tot.itemsTotal,
    discount: discountLines.length > 0 || tot.discountAmount > 0,
    discountAmount: tot.discountAmount,
    discountLines,
    discountLabel: formatDiscountMinimal(discountName, discountValueType, discountRate),
    tax: tot.tax,
    taxLabel: getOrderTaxLabel(order),
    serviceChargeLabel: getOrderServiceChargeLabel(order),
    serviceChargeAmount: tot.service,
    extras: (order.extras || []).filter(Boolean),
    tipAmount: tot.tip,
    tipLabel,
    deliveryCharges: tot.deliveryCharges,
    total,
    payments: pay.payments,
    change: pay.change,
  };
}

/**
 * Temp: Pre-Sale Bill style (CommonBillParts only, no payments/change). Matches presale.bill.tsx.
 */
function mapOrderToTemp(order, options) {
  const L = (options && options.labels) || {};
  return {
    ...mapOrderToBill(order, {
      forDelivery: false,
      showInclusivePrices: !!(options && options.showInclusivePrices),
      ...getDateFormatOpts(options),
    }),
    title: L.preSaleBill || 'Pre-Sale Bill',
    note: '',
  };
}

/**
 * Final: Final Bill + CommonBillParts + payments + Change. Matches final.bill.tsx.
 */
function mapOrderToFinal(order, options) {
  const dup = options && options.duplicate;
  const L = (options && options.labels) || {};
  return {
    ...mapOrderToBill(order, {
      forDelivery: false,
      showInclusivePrices: !!(options && options.showInclusivePrices),
      ...getDateFormatOpts(options),
    }),
    title: dup
      ? (L.duplicateFinalBill || 'Duplicate Final Bill')
      : (L.finalBill || 'Final Bill'),
    thankYou: L.thankYou || 'Thank you!',
  };
}

/**
 * Delivery: CommonBillParts + Delivery line + address/phone/notes + payments + Change.
 */
function mapOrderToDelivery(order, options) {
  const L = (options && options.labels) || {};
  return {
    ...mapOrderToBill(order, {
      forDelivery: true,
      showInclusivePrices: !!(options && options.showInclusivePrices),
      ...getDateFormatOpts(options),
    }),
    title: L.delivery || 'DELIVERY',
    address: getOrderDeliveryAddress(order),
    phone: getOrderPhone(order),
    notes: getOrderDeliveryNotes(order),
    customerName: getOrderCustomerName(order),
    deliveryTime: getOrderDeliveryTime(order),
  };
}

/**
 * Map Order -> kitchen shape: { orderId, table, items, createdAt, priority }
 * @param {Object} order
 * @param {{ timezone?: string, locale?: string }} [options]
 */
function mapOrderToKitchen(order, options) {
  return {
    orderId: getOrderId(order),
    table: getOrderTable(order),
    items: getOrderItems(order),
    createdAt: getOrderCreatedAt(order, options),
    priority: getOrderPriority(order),
  };
}

/**
 * Items from a refund order (selected items only, no filtering). Matches refund.bill.tsx.
 * @param {Object} order - refund order with items, tax_amount, discount_amount, etc.
 * @param {boolean} [showInclusivePrices=false]
 * @returns {Array<{ name, qty, price, total }>}
 */
function getRefundOrderItems(order, showInclusivePrices) {
  if (!order || !Array.isArray(order.items)) return [];
  return order.items.map((it) => {
    const dish = it.item || it.dish;
    const name = (dish && (dish.name || dish.title)) || '';
    const qty = it.quantity != null ? it.quantity : 1;
    const netLineTotal = calculateOrderItemPricePrint(it);
    let lineTotal = netLineTotal;
    if (showInclusivePrices && (it.tax_mode || 'exclusive') === 'inclusive') {
      const unitNet = qty > 0 ? netLineTotal / qty : netLineTotal;
      const dishNet = Number(it.price || 0);
      const unitGross = inflateInclusiveAmount(unitNet, it.taxes, it.original_price, dishNet);
      lineTotal = Math.round(unitGross * qty * 100) / 100;
    }
    const price = qty > 0 ? lineTotal / qty : 0;
    const total = lineTotal;
    return { name, qty, price, total };
  });
}

/**
 * Map refund order + originalOrder to refund receipt shape. Matches refund.bill.tsx.
 * data: { order: refundOrder, originalOrder }
 * refundOrder has: items (selected), tax_amount, discount_amount, service_charge_amount, tip_amount, extras.
 */
function mapOrderToRefund(refundOrder, originalOrder, options) {
  const showInclusivePrices = !!(options && options.showInclusivePrices);
  const items = getRefundOrderItems(refundOrder, showInclusivePrices);
  const filteredForNet = !refundOrder || !Array.isArray(refundOrder.items) ? [] : refundOrder.items;
  const itemsTotal = filteredForNet.reduce((s, it) => s + calculateOrderItemPricePrint(it), 0);
  const taxAmount = Number(refundOrder.tax_amount ?? 0);
  const discountAmount = Number(refundOrder.discount_amount ?? 0);
  const serviceChargeAmount = Number(refundOrder.service_charge_amount ?? 0);
  const tipAmount = Number(refundOrder.tip_amount ?? 0);
  const extrasTotal = (refundOrder.extras || []).reduce((s, e) => s + Number(e?.value || 0), 0);
  const total = itemsTotal + taxAmount + serviceChargeAmount + tipAmount + extrasTotal + discountAmount;
  const orig = originalOrder || refundOrder;
  const serviceChargeLabel = getOrderServiceChargeLabel(refundOrder);
  const tipLabel = refundOrder && refundOrder.tip_type === 'Percent' ? 'Tip %' : 'Tip';
  const dateOpts = getDateFormatOpts(options);
  const refundPattern = appDateTimePattern(dateOpts);
  let refundDate;
  if (refundPattern) {
    refundDate = formatWithPattern(new Date(), refundPattern, dateOpts.timezone, dateOpts.locale);
  } else {
    const refundFormatOpts = {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    };
    if (dateOpts.timezone) refundFormatOpts.timeZone = dateOpts.timezone;
    refundDate = new Date().toLocaleString(dateOpts.locale, refundFormatOpts);
  }
  return {
    originalOrderId: getOrderId(orig),
    table: getOrderTable(orig),
    orderType: getOrderType(orig),
    userName: getOrderUserName(orig),
    refundDate,
    items,
    itemsCount: items.length,
    itemsTotal,
    tax: taxAmount,
    taxLabel: getOrderTaxLabel(refundOrder),
    discount: !!refundOrder.discount,
    discountAmount,
    serviceChargeLabel,
    serviceChargeAmount,
    extras: refundOrder.extras || [],
    tipAmount,
    tipLabel,
    total,
  };
}

module.exports = {
  getOrderId,
  getOrderItems,
  getOrderTotals,
  getOrderPaymentsString,
  getOrderTable,
  getOrderType,
  getOrderDeliveryAddress,
  getOrderPhone,
  getOrderDeliveryNotes,
  getOrderDate,
  getOrderCreatedAt,
  getOrderPriority,
  getOrderItemModifierLines,
  calculateOrderItemPricePrint,
  getOrderCustomerName,
  getOrderCustomerAddress,
  getOrderDeliveryTime,
  getOrderUserName,
  mapOrderToTemp,
  mapOrderToFinal,
  mapOrderToDelivery,
  mapOrderToKitchen,
  getRefundOrderItems,
  mapOrderToRefund,
  formatWithPattern,
  appDateTimePattern,
  getDateFormatOpts,
};
