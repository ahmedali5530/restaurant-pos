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
 * Modifier display lines from an order item (OrderItem). Names only, no price; any nesting depth.
 * @param {Object} orderItem - raw order item with modifiers
 * @returns {Array<{ depth: number, name: string }>}
 */
function getOrderItemModifierLines(orderItem) {
  if (!orderItem || !Array.isArray(orderItem.modifiers)) return [];
  const lines = [];
  orderItem.modifiers.forEach((group) => {
    walkModifierGroup(group, lines, 0);
  });
  return lines;
}

function getOrderId(order) {
  if (!order) return '';
  const n = order.invoice_number;
  const s = order.split;
  return s != null && s !== '' ? `${n}/${s}` : `${n}`;
}

/**
 * Filter order items: exclude deleted, refunded, suspended.
 * @param {Object} order
 * @returns {Array<{ name, qty, price, total, notes, modifierLines }>}
 */
function getOrderItems(order) {
  if (!order || !Array.isArray(order.items)) return [];
  return order.items
    .filter((it) => !it.deleted_at && it.is_refunded !== true && it.is_suspended !== true)
    .map((it) => {
      const dish = it.item || it.dish;
      const name = (dish && (dish.name || dish.title)) || '';
      const qty = it.quantity != null ? it.quantity : 1;
      const lineTotal = calculateOrderItemPricePrint(it);
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
  if (!order || !order.tax) return 'Tax';
  const t = order.tax;
  const name = t.name || 'Tax';
  const rate = t.rate;
  return rate != null ? `${name} ${rate}%` : name;
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
 */
function getOrderTotals(order) {
  const items = getOrderItems(order);
  const itemsTotal = items.reduce((s, it) => s + Number(it.total != null ? it.total : it.price * it.qty), 0);
  const discountAmount = Number(order.discount_amount || 0);
  const extrasTotal = (order.extras || []).reduce((s, e) => s + Number(e.value || 0), 0);
  const tax = Number(order.tax_amount || 0);
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
function getOrderType(order) {
  if (!order) return '';
  const ot = order.order_type;
  if (!ot) return '';
  if (typeof ot === 'string') return ot;
  if (typeof ot === 'object') {
    return ot.name || ot.title || ot.type || '';
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
  if (!order || !order.customer) return '';
  return order.customer.name || '';
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
  if (!order || !order.customer) return '';
  const p = order.customer.phone;
  return p != null ? String(p) : '';
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
 * Date to match _common.bill: 'y-MM-dd hh:mm a' (e.g. 2026-01-17 11:52 PM).
 */
function getOrderDate(order) {
  const d = order && order.created_at ? (order.created_at instanceof Date ? order.created_at : new Date(order.created_at)) : new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const h = d.getHours();
  const min = String(d.getMinutes()).padStart(2, '0');
  const am = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${y}-${m}-${day} ${String(h12).padStart(2, '0')}:${min} ${am}`;
}

/**
 * @param {Object} order
 * @returns {string} - time for kitchen
 */
function getOrderCreatedAt(order) {
  if (!order || !order.created_at) return new Date().toLocaleTimeString();
  const d = order.created_at;
  return d instanceof Date ? d.toLocaleTimeString() : new Date(d).toLocaleTimeString();
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
 * Common bill shape aligned with _common.bill.tsx and final.bill.tsx.
 * @param {Object} order
 * @param {{ forDelivery?: boolean }} opts - forDelivery: use totalWithDelivery and include deliveryCharges in total
 */
function mapOrderToBill(order, opts) {
  const tot = getOrderTotals(order);
  const forDelivery = opts && opts.forDelivery;
  const total = forDelivery ? tot.totalWithDelivery : tot.total;
  const pay = getOrderPaymentSummary(order, total);
  const items = getOrderItems(order);
  const tipLabel = order && order.tip_type === 'Percent' ? 'Tip %' : 'Tip';
  return {
    orderId: getOrderId(order),
    table: getOrderTable(order),
    orderType: getOrderType(order),
    date: getOrderDate(order),
    userName: getOrderUserName(order),
    items,
    itemsCount: items.length,
    itemsTotal: tot.itemsTotal,
    discount: !!order.discount,
    discountAmount: tot.discountAmount,
    tax: tot.tax,
    taxLabel: getOrderTaxLabel(order),
    serviceChargeLabel: getOrderServiceChargeLabel(order),
    serviceChargeAmount: tot.service,
    extras: order.extras || [],
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
function mapOrderToTemp(order) {
  return { ...mapOrderToBill(order, { forDelivery: false }), title: 'Pre-Sale Bill', note: '' };
}

/**
 * Final: Final Bill + CommonBillParts + payments + Change. Matches final.bill.tsx.
 */
function mapOrderToFinal(order, options) {
  const dup = options && options.duplicate;
  return {
    ...mapOrderToBill(order, { forDelivery: false }),
    title: dup ? 'Duplicate Final Bill' : 'Final Bill',
    thankYou: 'Thank you!',
  };
}

/**
 * Delivery: CommonBillParts + Delivery line + address/phone/notes + payments + Change.
 */
function mapOrderToDelivery(order) {
  return {
    ...mapOrderToBill(order, { forDelivery: true }),
    title: 'DELIVERY',
    address: getOrderDeliveryAddress(order),
    phone: getOrderPhone(order),
    notes: getOrderDeliveryNotes(order),
    customerName: getOrderCustomerName(order),
    deliveryTime: getOrderDeliveryTime(order),
  };
}

/**
 * Map Order -> kitchen shape: { orderId, table, items, createdAt, priority }
 */
function mapOrderToKitchen(order) {
  return {
    orderId: getOrderId(order),
    table: getOrderTable(order),
    items: getOrderItems(order),
    createdAt: getOrderCreatedAt(order),
    priority: getOrderPriority(order),
  };
}

/**
 * Items from a refund order (selected items only, no filtering). Matches refund.bill.tsx.
 * @param {Object} order - refund order with items, tax_amount, discount_amount, etc.
 * @returns {Array<{ name, qty, price, total }>}
 */
function getRefundOrderItems(order) {
  if (!order || !Array.isArray(order.items)) return [];
  return order.items.map((it) => {
    const dish = it.item || it.dish;
    const name = (dish && (dish.name || dish.title)) || '';
    const qty = it.quantity != null ? it.quantity : 1;
    const lineTotal = calculateOrderItemPricePrint(it);
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
function mapOrderToRefund(refundOrder, originalOrder) {
  const items = getRefundOrderItems(refundOrder);
  const itemsTotal = items.reduce((s, it) => s + (it.price * it.qty), 0);
  const taxAmount = Number(refundOrder.tax_amount ?? 0);
  const discountAmount = Number(refundOrder.discount_amount ?? 0);
  const serviceChargeAmount = Number(refundOrder.service_charge_amount ?? 0);
  const tipAmount = Number(refundOrder.tip_amount ?? 0);
  const extrasTotal = (refundOrder.extras || []).reduce((s, e) => s + Number(e.value || 0), 0);
  const total = itemsTotal + taxAmount + serviceChargeAmount + tipAmount + extrasTotal + discountAmount;
  const orig = originalOrder || refundOrder;
  const serviceChargeLabel = getOrderServiceChargeLabel(refundOrder);
  const tipLabel = refundOrder && refundOrder.tip_type === 'Percent' ? 'Tip %' : 'Tip';
  return {
    originalOrderId: getOrderId(orig),
    table: getOrderTable(orig),
    orderType: getOrderType(orig),
    userName: getOrderUserName(orig),
    refundDate: new Date().toLocaleString(),
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
  getOrderDeliveryTime,
  mapOrderToTemp,
  mapOrderToFinal,
  mapOrderToDelivery,
  mapOrderToKitchen,
  getRefundOrderItems,
  mapOrderToRefund,
};
