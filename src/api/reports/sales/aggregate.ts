import type {Order} from "@/api/model/order.ts";
import {OrderStatus} from "@/api/model/order.ts";
import type {OrderItemModifier} from "@/api/model/order_item.ts";
import type {OrderVoid} from "@/api/model/order_void.ts";
import {recordToString} from "@/api/reports/shared/records.ts";
import type {
  CategoryGroup,
  ModifierDetail,
  ModifierSummaryMetrics,
  OrderFigures,
  ProductMixFilters,
  SalesSummaryResult,
  TopSellingDish,
} from "@/api/reports/shared/types.ts";
import {calculateOrderItemPrice} from "@/lib/cart.ts";
import {toJsDate} from "@/lib/datetime.ts";
import {getOrderFilteredItems, getOrderPaymentTotals} from "@/lib/order.ts";
import {safeNumber} from "@/lib/utils.ts";
import {DAY_PARTS, getDayPartLabel, type DayPartLabel} from "@/utils/dayParts";

export const getOrderFigures = (order: Order): OrderFigures => {
  const filteredItems = getOrderFilteredItems(order) ?? [];
  const exclusiveSales = filteredItems.reduce((sum, item) => sum + safeNumber(calculateOrderItemPrice(item)), 0);
  const extras = (order.extras ?? []).reduce((sum, extra) => sum + safeNumber(extra.value), 0);
  const grossSales = safeNumber(exclusiveSales + extras);

  const lineDiscounts = safeNumber(order.items?.reduce((sum, item) => sum + safeNumber(item?.discount), 0) ?? 0);
  const orderDiscount = safeNumber(order.discount_amount);
  const subtotalDiscount = Math.max(0, orderDiscount - lineDiscounts);
  const couponDiscount = safeNumber(order.coupon?.discount);
  const discounts = safeNumber(lineDiscounts + subtotalDiscount + couponDiscount);
  const netSales = safeNumber(grossSales - discounts);

  const serviceCharge = safeNumber(order.service_charge_amount);
  const tax = safeNumber(order.tax_amount);
  const tips = safeNumber(order.tip_amount);
  const totalRevenue = safeNumber(netSales + serviceCharge + tax);
  const grandTotal = safeNumber(totalRevenue + tips);

  const allItems = order.items ?? [];
  const voidedItems = allItems.filter(item => !filteredItems.some(filtered => filtered.id === item.id));
  const voidAmount = voidedItems.reduce((sum, item) => sum + safeNumber(calculateOrderItemPrice(item)), 0);

  const hasRefundPayment = (order.payments ?? []).some(payment => safeNumber(payment.amount) < 0);
  const isRefundedOrder = order.status === OrderStatus.Refunded
    || order.status === OrderStatus.Cancelled
    || hasRefundPayment;

  return {
    exclusiveSales,
    grossSales,
    discounts,
    netSales,
    serviceCharge,
    tax,
    tips,
    totalRevenue,
    grandTotal,
    couponDiscount,
    voidAmount,
    isRefundedOrder,
  };
};

export const calculateOrderNetSales = (order: Order): number => {
  const filteredItems = getOrderFilteredItems(order);
  const grossTotal = filteredItems.reduce((sum, item) => sum + calculateOrderItemPrice(item), 0);
  const lineDiscounts = filteredItems.reduce((sum, item) => sum + safeNumber(item?.discount), 0);
  const orderDiscount = safeNumber(order.discount_amount);
  const couponDiscount = safeNumber(order.coupon?.discount);
  const extraDiscount = Math.max(0, orderDiscount - lineDiscounts);
  const net = grossTotal - lineDiscounts - extraDiscount - couponDiscount;
  return net > 0 ? net : 0;
};

const calculateOrderAmountDue = (order: Order): number => {
  const filteredItems = getOrderFilteredItems(order);
  const salePriceWithoutTax = filteredItems.reduce((sum, item) => sum + safeNumber(calculateOrderItemPrice(item)), 0);
  const lineDiscounts = filteredItems.reduce((sum, item) => sum + safeNumber(item?.discount), 0);
  const orderDiscount = safeNumber(order.discount_amount);
  const couponDiscount = safeNumber(order.coupon?.discount);
  const extraDiscount = Math.max(0, orderDiscount - lineDiscounts);
  const totalDiscounts = lineDiscounts + extraDiscount;
  const taxes = safeNumber(order.tax_amount);
  const serviceCharges = safeNumber(order.service_charge_amount);
  const tips = safeNumber(order.tip_amount);
  return safeNumber(salePriceWithoutTax + taxes + serviceCharges + tips - totalDiscounts - couponDiscount);
};

const calculateVoidEntryAmount = (entry: OrderVoid): number => {
  const quantity = safeNumber(entry?.quantity || 1);
  const voidItems = (entry?.items ?? []).filter(Boolean);
  return voidItems.reduce((sum, item) => {
    const lineAmount = calculateOrderItemPrice({
      ...(item ?? {}),
      quantity,
    } as Parameters<typeof calculateOrderItemPrice>[0]);
    return sum + safeNumber(lineAmount);
  }, 0);
};

const collectCategories = (item: {item?: {categories?: unknown[]; name?: string}; category?: string}) => {
  if (!item?.item) {
    return [{id: "uncategorized", name: "Uncategorized"}];
  }

  const categories = item.item?.categories || [];
  if (Array.isArray(categories) && categories.length > 0) {
    return categories
      .map((cat: unknown) => ({
        id: recordToString((cat as {id?: unknown})?.id ?? cat),
        name: (cat as {name?: string})?.name ?? "Uncategorized",
      }))
      .filter(cat => Boolean(cat.id));
  }

  if (item.category) {
    return [{id: item.category, name: item.category}];
  }

  return [{id: "uncategorized", name: "Uncategorized"}];
};

const filterOrdersByProductMix = (orders: Order[], filters: ProductMixFilters = {}) => {
  const categoryIds = filters.categoryIds ?? [];
  const menuItemIds = filters.menuItemIds ?? [];

  return orders.filter(order => {
    if (categoryIds.length > 0) {
      const hasMatchingCategory = order.items?.some(item => {
        const itemCategories = item.item?.categories || [];
        if (Array.isArray(itemCategories)) {
          return itemCategories.some((cat: unknown) => {
            const catId = recordToString((cat as {id?: unknown})?.id ?? cat);
            return catId && categoryIds.includes(catId);
          });
        }
        return false;
      });
      if (!hasMatchingCategory) return false;
    }

    if (menuItemIds.length > 0) {
      const hasMatchingMenuItem = order.items?.some(item => {
        const itemId = recordToString(item.item?.id);
        return itemId && menuItemIds.includes(itemId);
      });
      if (!hasMatchingMenuItem) return false;
    }

    return true;
  });
};

const getFilteredOrderItems = (order: Order, filters: ProductMixFilters = {}) => {
  const categoryIds = filters.categoryIds ?? [];
  const menuItemIds = filters.menuItemIds ?? [];

  return getOrderFilteredItems(order)?.filter(item => {
    if (categoryIds.length > 0) {
      const itemCategories = item.item?.categories || [];
      const hasMatchingCategory = Array.isArray(itemCategories)
        ? itemCategories.some((cat: unknown) => {
          const catId = recordToString((cat as {id?: unknown})?.id ?? cat);
          return catId && categoryIds.includes(catId);
        })
        : false;
      if (!hasMatchingCategory) return false;
    }

    if (menuItemIds.length > 0) {
      const itemId = recordToString(item.item?.id);
      if (!itemId || !menuItemIds.includes(itemId)) return false;
    }

    return true;
  }) || [];
};

export const aggregateTopSellingDishes = (
  orders: Order[],
  options: {limit?: number; sortBy?: "quantity" | "revenue"} = {},
): TopSellingDish[] => {
  const {limit, sortBy = "revenue"} = options;
  const map = new Map<string, TopSellingDish>();

  orders.forEach(order => {
    getOrderFilteredItems(order).forEach(item => {
      const dishId = recordToString(item.item?.id);
      const name = item.item?.name || "Unknown";
      const key = dishId || name;
      const current = map.get(key) || {dishId: dishId || undefined, name, quantity: 0, revenue: 0};
      current.quantity += safeNumber(item.quantity ?? 1);
      current.revenue += calculateOrderItemPrice(item);
      map.set(key, current);
    });
  });

  const sorted = Array.from(map.values()).sort((a, b) => {
    if (sortBy === "quantity") {
      return b.quantity - a.quantity;
    }
    return b.revenue - a.revenue;
  });

  return limit ? sorted.slice(0, limit) : sorted;
};

export const aggregateSalesSummary = (orders: Order[], orderVoids: OrderVoid[]): SalesSummaryResult => {
  const totalNetSales = orders.reduce((sum, order) => sum + calculateOrderNetSales(order), 0);

  const paymentSummary = orders.reduce(
    (acc, order) => {
      acc.amountDue += calculateOrderAmountDue(order);
      const paymentTotals = getOrderPaymentTotals(order);
      acc.amountCollected += paymentTotals.amountCollected;
      acc.cashPayments += paymentTotals.cashAmount;
      acc.nonCashPayments += paymentTotals.nonCashAmount;
      Object.entries(paymentTotals.nonCashBreakdown).forEach(([typeName, amount]) => {
        acc.nonCashBreakdown[typeName] = (acc.nonCashBreakdown[typeName] ?? 0) + amount;
      });
      return acc;
    },
    {
      amountDue: 0,
      amountCollected: 0,
      cashPayments: 0,
      nonCashPayments: 0,
      nonCashBreakdown: {} as Record<string, number>,
    },
  );

  const roundingBenefit = paymentSummary.amountDue - paymentSummary.amountCollected;
  const serviceCharges = orders.reduce((sum, order) => sum + safeNumber(order.service_charge_amount), 0);
  const taxes = orders.reduce((sum, order) => sum + safeNumber(order.tax_amount), 0);
  const totalDiscounts = orders.reduce((sum, order) => sum + safeNumber(order.discount_amount), 0);
  const totalCoupons = orders.reduce((sum, order) => sum + safeNumber(order.coupon?.discount), 0);

  const dayPartTotals = DAY_PARTS.reduce(
    (acc, part) => ({
      ...acc,
      [part.label]: {checks: 0, guests: 0, sales: 0},
    }),
    {} as Record<DayPartLabel, {checks: number; guests: number; sales: number}>,
  );

  orders.forEach(order => {
    const label = getDayPartLabel(toJsDate(order.created_at));
    dayPartTotals[label].checks += 1;
    dayPartTotals[label].guests += safeNumber(order.covers);
    dayPartTotals[label].sales += calculateOrderNetSales(order);
  });

  const orderTypeMap = new Map<string, number>();
  orders.forEach(order => {
    const key = order.order_type?.name || (typeof order.order_type === "string" ? order.order_type : "Unknown");
    orderTypeMap.set(key, (orderTypeMap.get(key) ?? 0) + calculateOrderNetSales(order));
  });

  const orderTypeBreakdown = Array.from(orderTypeMap.entries())
    .map(([label, value]) => ({label, value}))
    .sort((a, b) => b.value - a.value);

  const totalVoids = orderVoids.reduce((sum, entry) => sum + calculateVoidEntryAmount(entry), 0);

  const discountMap = new Map<string, {quantity: number; amount: number}>();
  orders.forEach(order => {
    const discountName =
      order.discount?.name
      || (typeof order.discount === "string" ? order.discount : null)
      || (safeNumber(order.discount_amount) > 0 ? "Custom discount" : null);

    if (!discountName) return;

    const amount = safeNumber(order.discount_amount);
    const current = discountMap.get(discountName) ?? {quantity: 0, amount: 0};
    current.quantity += 1;
    current.amount += amount;
    discountMap.set(discountName, current);
  });

  const discountRows = Array.from(discountMap.entries())
    .map(([type, stats]) => ({type, quantity: stats.quantity, amount: stats.amount}))
    .sort((a, b) => b.amount - a.amount);

  return {
    totalNetSales,
    paymentSummary,
    roundingBenefit,
    serviceCharges,
    taxes,
    totalDiscounts,
    totalCoupons,
    totalVoids,
    dayPartTotals,
    orderTypeBreakdown,
    discountRows,
  };
};

const MODIFIER_WALK_MAX_DEPTH = 32;

const toPriceKey = (value: number) => safeNumber(value).toFixed(4);

// Modifiers are grouped by what the user perceives as "the same modifier":
// identical name, nesting level and unit price. The underlying dish record id
// is intentionally not part of the key, since the same modifier can be backed
// by different dish records that share a name.
const buildModifierMergeKey = (name: string, depth: number, unitPrice: number) =>
  `${name.trim().toLowerCase()}|${depth}|${toPriceKey(unitPrice)}`;

const buildModifierAccumulatedKey = (name: string) => name.trim().toLowerCase();

interface WalkedModifier {
  modifierId: string;
  modifierName: string;
  depth: number;
  quantity: number;
  price: number;
}

// Depth-first walk of the embedded modifier tree. Each selected modifier nests
// further groups under `selectedGroups`, so we recurse to any depth (guarded by
// MODIFIER_WALK_MAX_DEPTH) yielding one node per selected modifier.
const walkSelectedModifiers = (
  modifierGroups: OrderItemModifier[] | undefined,
  depth = 1,
): WalkedModifier[] => {
  const results: WalkedModifier[] = [];

  if (!Array.isArray(modifierGroups) || depth > MODIFIER_WALK_MAX_DEPTH) {
    return results;
  }

  modifierGroups.forEach(group => {
    const selectedModifiers = group?.selectedModifiers;
    if (!Array.isArray(selectedModifiers)) return;

    selectedModifiers.forEach(selectedModifier => {
      if (!selectedModifier) return;

      // Pass the whole dish (not dish.id) so RecordId values resolve to the full
      // "table:id" string. recordToString(dish.id) would drop the table prefix,
      // breaking equality with the modifier filter values (full record ids).
      const modifierId = recordToString(selectedModifier.dish);
      const modifierName = selectedModifier.dish?.name
        || (selectedModifier as {name?: string}).name
        || "Unknown";
      const quantity = safeNumber(selectedModifier.quantity || 1);
      const price = safeNumber(selectedModifier.price || 0);

      results.push({modifierId, modifierName, depth, quantity, price});
      results.push(...walkSelectedModifiers(selectedModifier.selectedGroups, depth + 1));
    });
  });

  return results;
};

export const aggregateProductMixByCategory = (
  orders: Order[],
  filters: ProductMixFilters = {},
): CategoryGroup[] => {
  const filteredOrders = filterOrdersByProductMix(orders, filters);
  const dishMap = new Map<string, {
    dishId: string;
    itemNumber: string;
    name: string;
    categoryId: string;
    categoryName: string;
    numSold: number;
    totalAmount: number;
    totalCost: number;
    discount: number;
    tax: number;
    serviceCharges: number;
    totalCollected: number;
    baseDishTotal: number;
    hasModifiers: boolean;
    modifiers: Map<string, ModifierDetail>;
  }>();

  filteredOrders.forEach(order => {
    getFilteredOrderItems(order, filters).forEach(item => {
      if (!item.item) return;

      const dishId = recordToString(item.item.id);
      const itemNumber = item.item.number || "";
      const name = item.item.name || "Unknown";
      const categories = collectCategories(item);
      const quantity = safeNumber(item.quantity);
      const amount = safeNumber(calculateOrderItemPrice(item));
      const cost = safeNumber(item.item.cost || 0);
      const totalCost = cost * quantity;

      const discount = safeNumber(item.discount || 0);
      const tax = safeNumber(item.tax || 0);
      const serviceCharges = safeNumber(item.service_charges || 0);
      const baseDishPrice = safeNumber(item.price || 0) * quantity;
      const total = safeNumber(amount + tax + serviceCharges - discount);
      const baseDishTotal = safeNumber(baseDishPrice + tax + serviceCharges - discount);

      const walkedModifiers = walkSelectedModifiers(item.modifiers);
      const modifierTotal = walkedModifiers
        .filter(modifier => modifier.depth === 1)
        .reduce((sum, modifier) => sum + modifier.price, 0);
      const totalCollected = safeNumber(total + modifierTotal);

      categories.forEach(category => {
        const key = `${category.id}-${dishId}`;
        const existing = dishMap.get(key) || {
          dishId,
          itemNumber,
          name,
          categoryId: category.id,
          categoryName: category.name,
          numSold: 0,
          totalAmount: 0,
          totalCost: 0,
          discount: 0,
          tax: 0,
          serviceCharges: 0,
          totalCollected: 0,
          baseDishTotal: 0,
          hasModifiers: false,
          modifiers: new Map<string, ModifierDetail>(),
        };

        existing.numSold += quantity;
        existing.totalAmount += amount;
        existing.totalCost += totalCost;
        existing.discount += discount;
        existing.tax += tax;
        existing.serviceCharges += serviceCharges;
        existing.totalCollected += totalCollected;
        existing.baseDishTotal += baseDishTotal;
        existing.hasModifiers = existing.hasModifiers || walkedModifiers.length > 0;

        walkedModifiers.forEach(modifier => {
          const unitPrice = modifier.quantity > 0 ? modifier.price / modifier.quantity : modifier.price;
          const modifierKey = buildModifierMergeKey(modifier.modifierName, modifier.depth, unitPrice);
          const existingModifier = existing.modifiers.get(modifierKey);

          if (existingModifier) {
            existingModifier.quantity += modifier.quantity;
            existingModifier.total += modifier.price;
          } else {
            existing.modifiers.set(modifierKey, {
              modifierKey,
              modifierId: modifier.modifierId,
              modifierName: modifier.modifierName,
              depth: modifier.depth,
              quantity: modifier.quantity,
              unitPrice,
              discount: 0,
              tax: 0,
              serviceCharges: 0,
              total: modifier.price,
              ratio: 0,
              mealPrice: 0,
            });
          }
        });

        dishMap.set(key, existing);
      });
    });
  });

  const categoryMap = new Map<string, CategoryGroup>();

  dishMap.forEach((dishData) => {
    if (!categoryMap.has(dishData.categoryId)) {
      categoryMap.set(dishData.categoryId, {
        categoryId: dishData.categoryId,
        categoryName: dishData.categoryName,
        items: [],
        totals: {
          numSold: 0,
          priceSold: 0,
          amount: 0,
          cost: 0,
          profit: 0,
          foodCostPercent: 0,
          salePercent: 0,
          discount: 0,
          tax: 0,
          serviceCharges: 0,
          totalCollected: 0,
        },
      });
    }

    const category = categoryMap.get(dishData.categoryId)!;
    const priceSold = dishData.numSold > 0 ? dishData.totalAmount / dishData.numSold : 0;
    const profit = dishData.totalAmount - dishData.totalCost;
    const foodCostPercent = dishData.totalAmount > 0
      ? (dishData.totalCost / dishData.totalAmount) * 100
      : 0;

    const modifiers = Array.from(dishData.modifiers.values()).map(modifier => {
      const unitPrice = modifier.quantity > 0 ? safeNumber(modifier.total / modifier.quantity) : 0;
      const ratio = dishData.baseDishTotal > 0 ? safeNumber(modifier.total / dishData.baseDishTotal) : 0;
      const mealPrice = safeNumber(dishData.baseDishTotal + modifier.total);

      return {
        ...modifier,
        unitPrice,
        ratio,
        mealPrice,
      };
    }).sort((a, b) => {
      if (a.depth !== b.depth) {
        return a.depth - b.depth;
      }
      const nameCompare = a.modifierName.localeCompare(b.modifierName);
      if (nameCompare !== 0) {
        return nameCompare;
      }
      return a.unitPrice - b.unitPrice;
    });

    category.items.push({
      dishId: dishData.dishId,
      itemNumber: dishData.itemNumber,
      name: dishData.name,
      numSold: dishData.numSold,
      priceSold,
      amount: dishData.totalAmount,
      cost: dishData.totalCost,
      profit,
      foodCostPercent,
      salePercent: 0,
      discount: dishData.discount,
      tax: dishData.tax,
      serviceCharges: dishData.serviceCharges,
      totalCollected: dishData.totalCollected,
      hasModifiers: dishData.hasModifiers,
      modifiers,
    });
  });

  const totalSales = Array.from(categoryMap.values()).reduce(
    (sum, cat) => sum + cat.items.reduce((s, item) => s + item.amount, 0),
    0,
  );

  categoryMap.forEach((category) => {
    category.items.sort((a, b) => b.amount - a.amount);
    category.items.forEach((item) => {
      item.salePercent = totalSales > 0 ? (item.amount / totalSales) * 100 : 0;
    });

    category.totals = category.items.reduce(
      (acc, item) => ({
        numSold: acc.numSold + item.numSold,
        priceSold: 0,
        amount: acc.amount + item.amount,
        cost: acc.cost + item.cost,
        profit: acc.profit + item.profit,
        foodCostPercent: 0,
        salePercent: acc.salePercent + item.salePercent,
        discount: acc.discount + item.discount,
        tax: acc.tax + item.tax,
        serviceCharges: acc.serviceCharges + item.serviceCharges,
        totalCollected: acc.totalCollected + item.totalCollected,
      }),
      {
        numSold: 0,
        priceSold: 0,
        amount: 0,
        cost: 0,
        profit: 0,
        foodCostPercent: 0,
        salePercent: 0,
        discount: 0,
        tax: 0,
        serviceCharges: 0,
        totalCollected: 0,
      },
    );

    category.totals.priceSold = category.totals.numSold > 0
      ? category.totals.amount / category.totals.numSold
      : 0;
    category.totals.foodCostPercent = category.totals.amount > 0
      ? (category.totals.cost / category.totals.amount) * 100
      : 0;
  });

  return Array.from(categoryMap.values()).sort((a, b) => b.totals.amount - a.totals.amount);
};

export const aggregateModifiersSummary = (
  orders: Order[],
  filters: ProductMixFilters = {},
): ModifierSummaryMetrics[] => {
  const filteredOrders = filterOrdersByProductMix(orders, filters);
  const selectedModifierIds = new Set(filters.modifierIds ?? []);
  const summaryMap = new Map<string, ModifierSummaryMetrics>();

  filteredOrders.forEach(order => {
    getFilteredOrderItems(order, filters).forEach(item => {
      if (!item.item) return;

      walkSelectedModifiers(item.modifiers).forEach(modifier => {
        if (selectedModifierIds.size > 0 && !selectedModifierIds.has(modifier.modifierId)) {
          return;
        }

        const unitPrice = modifier.quantity > 0 ? safeNumber(modifier.price / modifier.quantity) : safeNumber(modifier.price);
        const rowKey = buildModifierMergeKey(modifier.modifierName, modifier.depth, unitPrice);
        const existing = summaryMap.get(rowKey) || {
          rowKey,
          modifierId: modifier.modifierId,
          modifierName: modifier.modifierName,
          depth: modifier.depth,
          quantity: 0,
          unitPrice,
          total: 0,
        };

        existing.quantity += modifier.quantity;
        existing.total += modifier.price;
        existing.unitPrice = existing.quantity > 0 ? safeNumber(existing.total / existing.quantity) : 0;
        summaryMap.set(rowKey, existing);
      });
    });
  });

  return Array.from(summaryMap.values()).sort((a, b) => {
    const nameCompare = a.modifierName.localeCompare(b.modifierName);
    if (nameCompare !== 0) {
      return nameCompare;
    }
    if (a.depth !== b.depth) {
      return a.depth - b.depth;
    }
    return a.unitPrice - b.unitPrice;
  });
};

export const aggregateAccumulatedModifiersSummary = (
  orders: Order[],
  filters: ProductMixFilters = {},
): ModifierSummaryMetrics[] => {
  const filteredOrders = filterOrdersByProductMix(orders, filters);
  const selectedModifierIds = new Set(filters.modifierIds ?? []);
  const summaryMap = new Map<string, ModifierSummaryMetrics>();

  filteredOrders.forEach(order => {
    getFilteredOrderItems(order, filters).forEach(item => {
      if (!item.item) return;

      walkSelectedModifiers(item.modifiers).forEach(modifier => {
        if (selectedModifierIds.size > 0 && !selectedModifierIds.has(modifier.modifierId)) {
          return;
        }

        const rowKey = buildModifierAccumulatedKey(modifier.modifierName);
        const existing = summaryMap.get(rowKey) || {
          rowKey,
          modifierId: modifier.modifierId,
          modifierName: modifier.modifierName,
          depth: 1,
          quantity: 0,
          unitPrice: 0,
          total: 0,
        };

        existing.quantity += modifier.quantity;
        existing.total += modifier.price;
        existing.unitPrice = existing.quantity > 0 ? safeNumber(existing.total / existing.quantity) : 0;
        summaryMap.set(rowKey, existing);
      });
    });
  });

  return Array.from(summaryMap.values()).sort((a, b) =>
    a.modifierName.localeCompare(b.modifierName),
  );
};
