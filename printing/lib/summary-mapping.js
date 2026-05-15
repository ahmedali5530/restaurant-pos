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

function getOrderPaymentTotals(order) {
  const payments = order?.payments || [];
  const nonCashBreakdown = payments.reduce((acc, payment) => {
    if (isCashPayment(payment)) return acc;
    const label = payment?.payment_type?.name || payment?.payment_type?.title || 'Other';
    const applied = getAppliedAmount(payment);
    acc[label] = (acc[label] || 0) + applied;
    return acc;
  }, {});
  const cashAmount = payments.reduce((sum, payment) => {
    if (!isCashPayment(payment)) return sum;
    return sum + getAppliedAmount(payment);
  }, 0);
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

function normalizeOrdersList(props) {
  const raw = props && props.orders;
  if (Array.isArray(raw)) return raw;
  if (raw && Array.isArray(raw.data)) return raw.data;
  return [];
}

function computeSummary(props) {
  const list = normalizeOrdersList(props);
  const date = props?.date || new Date().toLocaleDateString();

  const paymentTotals = list.map((order) => getOrderPaymentTotals(order));

  const exclusiveSales = list.reduce((sum, order) => {
    const items = (getFilteredItems(order) || []).reduce(
      (s, item) => s + safeNumber(itemLineTotal(item)),
      0
    );
    return sum + items;
  }, 0);

  const totalExtras = list.reduce((sum, order) => {
    const extras = (order.extras || []).reduce((s, extra) => s + safeNumber(extra.value), 0);
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

  const voids = list.reduce((sum, order) => {
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
  paymentTotals.forEach((totals) => {
    Object.entries(totals.nonCashBreakdown).forEach(([typeName, amount]) => {
      if (!paymentTypeMap[typeName]) paymentTypeMap[typeName] = 0;
      paymentTypeMap[typeName] += safeNumber(amount);
    });
    if (!paymentTypeMap.Cash) paymentTypeMap.Cash = 0;
    paymentTypeMap.Cash += safeNumber(totals.cashAmount);
  });

  const paymentTypes = Object.entries(paymentTypeMap)
    .map(([name, total]) => ({ name, total }))
    .sort((a, b) => b.total - a.total);

  const taxesMap = {};
  list.forEach((order) => {
    if (!order?.tax) return;
    const key = `${order.tax?.name} ${order.tax?.rate}`;
    if (!taxesMap[key]) taxesMap[key] = 0;
    taxesMap[key] += safeNumber(order.tax_amount);
  });
  const taxesList = Object.entries(taxesMap)
    .map(([name, total]) => ({ name, total }))
    .sort((a, b) => b.total - a.total);

  const discountsMap = {};
  list.forEach((order) => {
    const discountAmount = safeNumber(order.discount_amount);
    if (discountAmount <= 0) return;
    const name = order?.discount?.name || 'Order discount';
    if (!discountsMap[name]) discountsMap[name] = 0;
    discountsMap[name] += discountAmount;
  });
  const discountsList = Object.entries(discountsMap)
    .map(([name, total]) => ({ name, total }))
    .sort((a, b) => b.total - a.total);

  const extrasMap = {};
  list.forEach((order) => {
    (order?.extras || []).forEach((extra) => {
      if (!extrasMap[extra.name]) extrasMap[extra.name] = 0;
      extrasMap[extra.name] += safeNumber(extra.value);
    });
  });
  const extrasList = Object.entries(extrasMap)
    .map(([name, total]) => ({ name, total }))
    .sort((a, b) => b.total - a.total);

  const couponsMap = {};
  list.forEach((order) => {
    if (!order?.coupon) return;
    const code = order.coupon?.coupon?.code || 'Unknown';
    if (!couponsMap[code]) couponsMap[code] = 0;
    couponsMap[code] += safeNumber(order.coupon.discount);
  });
  const couponsList = Object.entries(couponsMap)
    .map(([name, total]) => ({ name, total }))
    .sort((a, b) => b.total - a.total);

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
    categoryMix,
  };
}

function formatNum(n) {
  const x = Number(n);
  return Number.isFinite(x) ? String(Math.round(x)) : '0';
}

module.exports = {
  computeSummary,
  formatNum,
  getFilteredItems,
  getVoidedItems,
  itemLineTotal,
  getModifierRows,
  getOrderPaymentTotals,
};
