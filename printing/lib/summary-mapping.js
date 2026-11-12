'use strict';

const { calculateOrderItemPricePrint } = require('./order-mapping');

const safeNumber = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

function getFilteredItems(order) {
  if (!order || !Array.isArray(order.items)) return [];
  return order.items.filter(
    (it) => !it.deleted_at && it.is_refunded !== true && it.is_suspended !== true
  );
}

function itemLineTotal(it) {
  return safeNumber(calculateOrderItemPricePrint(it));
}

function getTenderedAmount(payment) {
  return safeNumber(payment?.amount);
}

function getAppliedAmount(payment) {
  const amount = safeNumber(payment?.amount);
  const payable = safeNumber(payment?.payable);
  if (payable > 0 && amount > payable) {
    return payable;
  }
  return amount;
}

function isCashPayment(payment) {
  const t = String(payment?.payment_type?.type || '')
    .toLowerCase()
    .trim();
  const n = String(payment?.payment_type?.name || payment?.payment_type?.title || '')
    .toLowerCase()
    .trim();
  return t === 'cash' || n === 'cash';
}

function getOrderGrandTotalDue(order) {
  const items = (getFilteredItems(order) || []).reduce(
    (s, item) => s + safeNumber(itemLineTotal(item)),
    0
  );
  const extras = (order.extras || []).reduce((s, extra) => s + safeNumber(extra?.value), 0);
  const lineDiscounts = safeNumber(sumFilteredItemDiscounts(order));
  const cartDiscount = getOrderSubtotalDiscount(order);
  const coupon = safeNumber(order.coupon?.discount);
  const discounts = safeNumber(lineDiscounts + cartDiscount + coupon);
  const net = safeNumber(items + extras - discounts);
  const service = safeNumber(order.service_charge_amount);
  const tax = safeNumber(order.tax_amount);
  const tips = safeNumber(order.tip_amount);
  return safeNumber(net + service + tax + tips);
}

function getOrderPaymentTotals(order) {
  const payments = order?.payments || [];
  let remaining = Math.max(0, getOrderGrandTotalDue(order));
  let cashAmount = 0;
  const nonCashBreakdown = {};
  payments.forEach((payment) => {
    let applied = getAppliedAmount(payment);
    applied = Math.min(applied, remaining);
    remaining = Math.max(0, remaining - applied);
    if (isCashPayment(payment)) {
      cashAmount += applied;
    } else {
      const label = payment?.payment_type?.name || payment?.payment_type?.title || 'Other';
      nonCashBreakdown[label] = (nonCashBreakdown[label] || 0) + applied;
    }
  });
  const nonCashAmount = Object.values(nonCashBreakdown).reduce((sum, x) => sum + x, 0);
  const totalReceivedWithChange = payments.reduce((sum, p) => sum + getTenderedAmount(p), 0);
  const amountCollected = safeNumber(cashAmount + nonCashAmount);
  return {
    amountCollected,
    cashAmount,
    nonCashAmount,
    nonCashBreakdown,
    change: safeNumber(totalReceivedWithChange - amountCollected),
    totalReceivedWithChange,
  };
}

function sumFilteredItemDiscounts(order) {
  return getFilteredItems(order).reduce(
    (sum, item) => sum + safeNumber(item?.discount),
    0
  );
}

function getOrderSubtotalDiscount(order) {
  const lineDiscounts = safeNumber(sumFilteredItemDiscounts(order));
  const orderDiscount = safeNumber(order.discount_amount);
  if (order?.discount) {
    return orderDiscount;
  }
  return Math.max(0, orderDiscount - lineDiscounts);
}

function getModifierRows(modifiers) {
  const rows = [];
  const source = Array.isArray(modifiers) ? modifiers : [];

  const walkGroups = (groups, depth = 1, parentPath = '') => {
    (Array.isArray(groups) ? groups : []).forEach((group) => {
      (group?.selectedModifiers || []).forEach((selected) => {
        const modifierName = String(selected?.dish?.name || selected?.name || '').trim();
        if (!modifierName) return;

        const currentPath = parentPath ? `${parentPath}>${modifierName}` : modifierName;
        rows.push({
          name: modifierName,
          depth,
          path: currentPath,
          quantity: 0,
          price: safeNumber(selected?.price),
        });
        walkGroups(selected?.selectedGroups || [], depth + 1, currentPath);
      });
    });
  };

  walkGroups(source);
  return rows;
}

function getVoidedItems(order) {
  if (!order || !Array.isArray(order.items)) return [];
  return order.items.filter(
    (it) => !!it.deleted_at || it.is_refunded === true || it.is_suspended === true
  );
}

function calculateVoidEntryAmount(entry) {
  const quantity = safeNumber(entry?.quantity || 1);
  const voidItems = (entry?.items || []).filter(Boolean);
  if (voidItems.length > 0) {
    return voidItems.reduce((sum, item) => {
      return sum + safeNumber(itemLineTotal({ ...(item || {}), quantity }));
    }, 0);
  }
  const single = entry?.order_item;
  if (single && typeof single === 'object') {
    return safeNumber(itemLineTotal({ ...single, quantity }));
  }
  return 0;
}

function normalizeOrdersList(props) {
  const raw = props && props.orders;
  if (Array.isArray(raw)) return raw;
  if (raw && Array.isArray(raw.data)) return raw.data;
  return [];
}

function computeSummary(props) {
  const list = normalizeOrdersList(props);
  const dateFormatOpts = {};
  if (props?.timezone) dateFormatOpts.timeZone = props.timezone;
  const date = props?.date
    || new Date().toLocaleDateString(props?.locale || undefined, dateFormatOpts);
  const windowRange = props?.windowRange ? String(props.windowRange) : '';

  const paymentTotals = list.map((order) => getOrderPaymentTotals(order));

  const exclusiveSales = list.reduce((sum, order) => {
    const items = (getFilteredItems(order) || []).reduce(
      (s, item) => s + safeNumber(itemLineTotal(item)),
      0
    );
    return sum + items;
  }, 0);

  const totalExtras = list.reduce((sum, order) => {
    const extras = (order.extras || []).reduce((s, extra) => s + safeNumber(extra?.value), 0);
    return sum + extras;
  }, 0);

  const grossSales = safeNumber(exclusiveSales + totalExtras);

  const itemDiscounts = list.reduce(
    (sum, order) => sum + safeNumber(sumFilteredItemDiscounts(order)),
    0
  );

  const subtotalDiscounts = list.reduce(
    (sum, order) => sum + getOrderSubtotalDiscount(order),
    0
  );

  const couponDiscounts = list.reduce((sum, order) => sum + safeNumber(order.coupon?.discount), 0);

  const discounts = safeNumber(itemDiscounts + subtotalDiscounts + couponDiscounts);

  const netSales = safeNumber(grossSales - discounts);

  const serviceCharges = list.reduce((sum, order) => sum + safeNumber(order.service_charge_amount), 0);
  const taxCollected = list.reduce((sum, order) => sum + safeNumber(order.tax_amount), 0);

  const amountDue = safeNumber(netSales + serviceCharges + taxCollected);
  const totalRevenue = safeNumber(netSales + serviceCharges + taxCollected);

  const tips = list.reduce((sum, order) => sum + safeNumber(order.tip_amount), 0);

  const grandTotalDue = safeNumber(totalRevenue + tips);

  const amountCollected = paymentTotals.reduce(
    (sum, totals) => sum + safeNumber(totals.amountCollected),
    0
  );
  const amountCollectedRaw = amountCollected;

  const changeGiven = paymentTotals.reduce((sum, totals) => sum + safeNumber(totals.change), 0);
  const rounding = safeNumber(amountCollected - grandTotalDue);

  const refunds = list.reduce((sum, order) => {
    if (order.status === 'Cancelled') {
      return (
        sum +
        safeNumber(
          order.payments?.reduce((paySum, payment) => {
            const amount = safeNumber(payment?.amount);
            return paySum + Math.abs(Math.min(0, amount));
          }, 0) ?? 0
        )
      );
    }
    return (
      sum +
      safeNumber(
        order.payments?.reduce((paySum, payment) => {
          const amount = safeNumber(payment?.amount);
          return paySum + (amount < 0 ? Math.abs(amount) : 0);
        }, 0) ?? 0
      )
    );
  }, 0);

  // Prefer order_void rows (cancelled whole checks); fall back to Paid-order item diff.
  const voids = Array.isArray(props?.orderVoids)
    ? props.orderVoids.reduce((sum, entry) => sum + calculateVoidEntryAmount(entry), 0)
    : list.reduce((sum, order) => {
        const allItems = order.items || [];
        const filtered = getFilteredItems(order);
        const voidedItems = allItems.filter((item) => !filtered.some((f) => f.id === item.id));
        return (
          sum +
          voidedItems.reduce((itemSum, item) => itemSum + safeNumber(itemLineTotal(item)), 0)
        );
      }, 0);

  const covers = list.reduce((sum, order) => sum + safeNumber(order.covers), 0);
  const ordersCount = list.length;
  const averageCover = covers > 0 ? amountDue / covers : 0;
  const averageOrderCheck = ordersCount > 0 ? amountDue / ordersCount : 0;

  const paymentTypeMap = {};
  list.forEach((order) => {
    const totals = getOrderPaymentTotals(order);
    const bump = (name, amount, count) => {
      if (!paymentTypeMap[name]) paymentTypeMap[name] = { total: 0, count: 0 };
      paymentTypeMap[name].total += safeNumber(amount);
      paymentTypeMap[name].count += count;
    };
    Object.entries(totals.nonCashBreakdown).forEach(([typeName, amount]) => bump(typeName, amount, 1));
    const cashLines = (order.payments || []).filter((p) => isCashPayment(p)).length;
    if (totals.cashAmount > 0 || cashLines > 0) {
      bump('Cash', totals.cashAmount, cashLines || (totals.cashAmount > 0 ? 1 : 0));
    }
  });

  const paymentTypes = Object.entries(paymentTypeMap)
    .map(([name, row]) => ({ name, total: row.total, count: row.count }))
    .sort((a, b) => b.total - a.total);

  const taxesMap = {};
  list.forEach((order) => {
    if (!order?.tax) return;
    const key = `${order.tax?.name} ${order.tax?.rate}`;
    if (!taxesMap[key]) taxesMap[key] = { total: 0, count: 0 };
    taxesMap[key].total += safeNumber(order.tax_amount);
    taxesMap[key].count += 1;
  });
  const taxesList = Object.entries(taxesMap)
    .map(([name, row]) => ({ name, total: row.total, count: row.count }))
    .sort((a, b) => b.total - a.total);

  const discountsMap = {};
  list.forEach((order) => {
    const discountAmount = safeNumber(order.discount_amount);
    if (discountAmount <= 0) return;
    const name = order?.discount?.name || 'Order discount';
    if (!discountsMap[name]) discountsMap[name] = { total: 0, count: 0 };
    discountsMap[name].total += discountAmount;
    discountsMap[name].count += 1;
  });
  const discountsList = Object.entries(discountsMap)
    .map(([name, row]) => ({ name, total: row.total, count: row.count }))
    .sort((a, b) => b.total - a.total);

  const extrasMap = {};
  list.forEach((order) => {
    (order?.extras || []).forEach((extra) => {
      if (!extra?.name) return;
      if (!extrasMap[extra.name]) extrasMap[extra.name] = { total: 0, count: 0 };
      extrasMap[extra.name].total += safeNumber(extra?.value);
      extrasMap[extra.name].count += 1;
    });
  });
  const extrasList = Object.entries(extrasMap)
    .map(([name, row]) => ({ name, total: row.total, count: row.count }))
    .sort((a, b) => b.total - a.total);

  const couponsMap = {};
  list.forEach((order) => {
    if (!order?.coupon) return;
    const code = order.coupon?.coupon?.code || 'Unknown';
    if (!couponsMap[code]) couponsMap[code] = { total: 0, count: 0 };
    couponsMap[code].total += safeNumber(order.coupon.discount);
    couponsMap[code].count += 1;
  });
  const couponsList = Object.entries(couponsMap)
    .map(([name, row]) => ({ name, total: row.total, count: row.count }))
    .sort((a, b) => b.total - a.total);

  const tipsCount = list.filter((order) => safeNumber(order.tip_amount) > 0).length;

  const orderTypeMap = {};
  const orderTakerMap = {};
  list.forEach((order) => {
    const items = (getFilteredItems(order) || []).reduce(
      (s, item) => s + safeNumber(itemLineTotal(item)),
      0
    );
    const extras = (order.extras || []).reduce((s, extra) => s + safeNumber(extra?.value), 0);
    const lineDiscounts = safeNumber(sumFilteredItemDiscounts(order));
    const cartDiscount = getOrderSubtotalDiscount(order);
    const coupon = safeNumber(order.coupon?.discount);
    const net = safeNumber(items + extras - lineDiscounts - cartDiscount - coupon);
    const sale = safeNumber(
      net + safeNumber(order.service_charge_amount) + safeNumber(order.tax_amount)
    );
    const typeName =
      (order.order_type && order.order_type.name) || 'Unknown order type';
    if (!orderTypeMap[typeName]) orderTypeMap[typeName] = { name: typeName, total: 0, ordersCount: 0 };
    orderTypeMap[typeName].total += sale;
    orderTypeMap[typeName].ordersCount += 1;

    const user = order.user;
    const takerName = user
      ? [user.first_name, user.last_name].filter(Boolean).join(' ').trim() ||
        user.login ||
        'Unknown'
      : 'Unknown';
    if (!orderTakerMap[takerName]) {
      orderTakerMap[takerName] = { name: takerName, total: 0, ordersCount: 0 };
    }
    orderTakerMap[takerName].total += sale;
    orderTakerMap[takerName].ordersCount += 1;
  });
  const orderTypes = Object.values(orderTypeMap).sort((a, b) => b.total - a.total);
  const orderTakers = Object.values(orderTakerMap).sort((a, b) => b.total - a.total);

  const categoryMixMap = {};
  list.forEach((order) => {
    getFilteredItems(order).forEach((item) => {
      const categoryName = String(item?.category || 'Uncategorized');
      const dishName = String(item?.item?.name || item?.dish?.name || 'Unknown item');
      const itemTotal = safeNumber(itemLineTotal(item));
      const itemQuantity = safeNumber(item.quantity != null ? item.quantity : 1);
      const modifiers = getModifierRows(item?.modifiers || []);
      const dishKey = dishName;

      if (!categoryMixMap[categoryName]) {
        categoryMixMap[categoryName] = {
          total: 0,
          quantity: 0,
          dishes: {},
        };
      }
      const category = categoryMixMap[categoryName];

      if (!category.dishes[dishKey]) {
        category.dishes[dishKey] = {
          name: dishName,
          modifiers: {},
          total: 0,
          quantity: 0,
        };
      }

      category.total += itemTotal;
      category.quantity += itemQuantity;
      category.dishes[dishKey].total += itemTotal;
      category.dishes[dishKey].quantity += itemQuantity;
      modifiers.forEach((modifier) => {
        if (!category.dishes[dishKey].modifiers[modifier.path]) {
          category.dishes[dishKey].modifiers[modifier.path] = {
            ...modifier,
            quantity: 0,
          };
        }
        category.dishes[dishKey].modifiers[modifier.path].quantity += itemQuantity;
      });
    });
  });

  const categoryMix = Object.entries(categoryMixMap)
    .map(([name, category]) => {
      const dishes = Object.entries(category.dishes)
        .map(([key, dish]) => ({
          key,
          ...dish,
          modifiers: Object.values(dish.modifiers).sort((a, b) => a.path.localeCompare(b.path)),
        }))
        .sort((a, b) => b.total - a.total);
      return {
        name,
        total: category.total,
        quantity: category.quantity,
        dishes,
      };
    })
    .sort((a, b) => b.total - a.total);

  return {
    date,
    windowRange,
    exclusiveSales,
    totalExtras,
    grossSales,
    itemDiscounts,
    subtotalDiscounts,
    couponDiscounts,
    discounts,
    netSales,
    serviceCharges,
    taxCollected,
    amountDue,
    totalRevenue,
    tips,
    grandTotalDue,
    amountCollected,
    amountCollectedRaw,
    changeGiven,
    rounding,
    refunds,
    voids,
    covers,
    ordersCount,
    averageCover,
    averageOrderCheck,
    paymentTypes,
    taxesList,
    discountsList,
    extrasList,
    couponsList,
    tipsCount,
    orderTypes,
    orderTakers,
    categoryMix,
  };
}

function formatNum(n) {
  const x = Number(n);
  return Number.isFinite(x) ? String(Math.round(x)) : '0';
}

/** Fixed mix columns so qty/total/% stay aligned across rows (right half = 21 cols). */
const MIX_QTY_W = 4;
const MIX_TOTAL_W = 11;
const MIX_SHARE_W = 4;

function padLeftCol(str, len) {
  const s = String(str ?? '');
  if (s.length > len) return s.slice(-len);
  return ' '.repeat(len - s.length) + s;
}

/**
 * Fixed-width product-mix right columns: Qty | Total | %.
 * Pass empty share for modifier rows so qty/total stay in the same columns.
 * @param {unknown} qty
 * @param {unknown} total
 * @param {unknown} [share]
 * @returns {string}
 */
function formatMixRightColumns(qty, total, share) {
  return [
    padLeftCol(qty, MIX_QTY_W),
    padLeftCol(total, MIX_TOTAL_W),
    padLeftCol(share, MIX_SHARE_W),
  ].join(' ');
}

module.exports = {
  computeSummary,
  formatNum,
  formatMixRightColumns,
  getFilteredItems,
  getVoidedItems,
  itemLineTotal,
  getModifierRows,
  getOrderPaymentTotals,
};
