import {useEffect, useMemo, useRef, useState} from "react";
import { useTranslation } from 'react-i18next';
import {ReportsLayout} from "@/screens/partials/reports.layout.tsx";
import {useDB} from "@/api/db/db.ts";
import {Tables} from "@/api/db/tables.ts";
import {Order, ORDER_FETCHES, OrderStatus} from "@/api/model/order.ts";
import {DiscountType} from "@/api/model/discount.ts";
import {OrderVoid} from "@/api/model/order_void.ts";
import {withCurrency, formatNumber} from "@/lib/utils.ts";
import {calculateOrderItemPrice} from "@/lib/cart.ts";
import {getOrderFilteredItems, getOrderPaymentTotals} from "@/lib/order.ts";
import { toJsDate } from "@/lib/datetime.ts";
import {DAY_PARTS, getDayPartLabel, getDayPartTimeRangeLabel, type DayPartLabel} from "@/utils/dayParts";

const safeNumber = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const calculateVoidEntryAmount = (entry: OrderVoid): number => {
  const quantity = safeNumber(entry?.quantity || 1);
  const voidItems = (entry?.items ?? []).filter(Boolean);
  return voidItems.reduce((sum, item) => {
    const lineAmount = calculateOrderItemPrice({
      ...(item ?? {}),
      quantity,
    } as any);
    return sum + safeNumber(lineAmount);
  }, 0);
};

const parseFilters = () => {
  const params = new URLSearchParams(window.location.search);
  const startDate = params.get("start") || params.get("start");
  const endDate = params.get("end") || params.get("end");
  return {startDate, endDate};
};

interface ModifierRow {
  name: string;
  depth: number;
  path: string;
  quantity: number;
  price: number;
}

interface DishMixAggregate {
  name: string;
  modifiers: Record<string, ModifierRow>;
  total: number;
  quantity: number;
}

interface CategoryMixAggregate {
  total: number;
  quantity: number;
  dishes: Record<string, DishMixAggregate>;
}

interface DishMixRow {
  key: string;
  name: string;
  modifiers: ModifierRow[];
  total: number;
  quantity: number;
}

interface CategoryMixRow {
  name: string;
  total: number;
  quantity: number;
  dishes: DishMixRow[];
}

const getModifierRows = (modifiers: any[] = []): ModifierRow[] => {
  const rows: ModifierRow[] = [];

  const walkGroups = (groups: any[] = [], depth = 1, parentPath = "") => {
    groups.forEach(group => {
      (group?.selectedModifiers ?? []).forEach((selected: any) => {
        const modifierName = String(selected?.dish?.name || selected?.name || "").trim();
        if (!modifierName) {
          return;
        }

        const currentPath = parentPath ? `${parentPath}>${modifierName}` : modifierName;
        rows.push({
          name: modifierName,
          depth,
          path: currentPath,
          quantity: 0,
          price: selected.price,
        });
        walkGroups(selected?.selectedGroups ?? [], depth + 1, currentPath);
      });
    });
  };

  walkGroups(modifiers);
  return rows;
};

interface OrderTypeMetrics {
  orderType: string;
  salePriceWithoutTax: number;
  taxes: number;
  amountDue: number;
  serviceCharges: number;
  tips: number;
  discounts: number;
  coupons: number;
  net: number;
  percentOfTotal: number;
  guests: number;
  avgGuest: number;
  checks: number;
  avgCheck: number;
  turnTime: number; // in minutes
}

export const SalesSummary2Report = () => {
  const { t } = useTranslation('reports');
  const db = useDB();
  const queryRef = useRef(db.query);
  const [orders, setOrders] = useState<Order[]>([]);
  const [statusOrders, setStatusOrders] = useState<Order[]>([]);
  const [orderVoids, setOrderVoids] = useState<OrderVoid[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const filters = useMemo(parseFilters, []);
  const subtitle = filters.startDate && filters.endDate ? `${filters.startDate} to ${filters.endDate}` : undefined;

  useEffect(() => {
    queryRef.current = db.query;
  }, [db]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        setError(null);

        const orderConditions: string[] = [];
        const params: Record<string, string> = {};

        if (filters.startDate) {
          orderConditions.push(`time::format(created_at, "${import.meta.env.VITE_DB_DATABASE_FORMAT}") >= $startDate`);
          params.startDate = filters.startDate;
        }

        if (filters.endDate) {
          orderConditions.push(`time::format(created_at, "${import.meta.env.VITE_DB_DATABASE_FORMAT}") <= $endDate`);
          params.endDate = filters.endDate;
        }
        orderConditions.push(`status = '${OrderStatus.Paid}'`);

        const ordersQuery = `
          SELECT * FROM ${Tables.orders}
          ${orderConditions.length ? `WHERE ${orderConditions.join(" AND ")}` : ""}
          FETCH ${ORDER_FETCHES.join(', ')}
        `;

        const ordersResult: any = await queryRef.current(ordersQuery, params);
        setOrders((ordersResult?.[0] ?? []) as Order[]);

        // Fetch all orders in range for sections that should include non-paid statuses.
        const statusOrdersQuery = `
          SELECT * FROM ${Tables.orders}
          ${orderConditions.filter(condition => !condition.startsWith("status =")).length
            ? `WHERE ${orderConditions.filter(condition => !condition.startsWith("status =")).join(" AND ")}`
            : ""}
          FETCH payments
        `;
        const statusOrdersResult: any = await queryRef.current(statusOrdersQuery, params);
        const baseStatusOrders = (statusOrdersResult?.[0] ?? []) as Order[];

        // Include carried-over open checks for check status calculations.
        let carriedOverOrders: Order[] = [];
        if (filters.startDate) {
          const carriedOverConditions = [
            `time::format(created_at, "${import.meta.env.VITE_DB_DATABASE_FORMAT}") < $startDate`,
            `status = '${OrderStatus["In Progress"]}'`,
          ];
          const carriedOverParams = {startDate: filters.startDate};

          const carriedOverQuery = `
            SELECT * FROM ${Tables.orders}
            WHERE ${carriedOverConditions.join(" AND ")}
            FETCH payments
          `;

          const carriedOverResult: any = await queryRef.current(carriedOverQuery, carriedOverParams);
          carriedOverOrders = (carriedOverResult?.[0] ?? []) as Order[];
        }
        setStatusOrders([...baseStatusOrders, ...carriedOverOrders]);

        // Fetch order voids
        const voidConditions: string[] = [];
        const voidParams: Record<string, string> = {};

        if (filters.startDate) {
          voidConditions.push(`time::format(created_at, "${import.meta.env.VITE_DB_DATABASE_FORMAT}") >= $startDate`);
          voidParams.startDate = filters.startDate;
        }

        if (filters.endDate) {
          voidConditions.push(`time::format(created_at, "${import.meta.env.VITE_DB_DATABASE_FORMAT}") <= $endDate`);
          voidParams.endDate = filters.endDate;
        }

        const voidsQuery = `
          SELECT * FROM ${Tables.order_voids}
          ${voidConditions.length ? `WHERE ${voidConditions.join(" AND ")}` : ""}
          FETCH items
        `;

        const voidsResult: any = await queryRef.current(voidsQuery, voidParams);
        setOrderVoids((voidsResult?.[0] ?? []) as OrderVoid[]);

      } catch (err) {
        console.error("Failed to load sales summary 2 report", err);
        setError(err instanceof Error ? err.message : t('errors.unableToLoad'));
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [filters.startDate, filters.endDate]);

  // Calculate metrics for a single order
  const calculateOrderMetrics = (order: Order) => {
    const filteredItems = getOrderFilteredItems(order);
    const salePriceWithoutTax = safeNumber(
      filteredItems.reduce((sum, item) => {
        const price = calculateOrderItemPrice(item);
        return sum + safeNumber(price);
      }, 0)
    );
    const itemDiscounts = safeNumber(
      filteredItems.reduce((sum, item) => sum + safeNumber(item?.discount), 0)
    );
    const lineDiscounts = itemDiscounts;
    const orderDiscount = safeNumber(order.discount_amount);
    const couponDiscount = safeNumber(order.coupon?.discount);
    const subtotalDiscount = Math.max(0, safeNumber(orderDiscount - lineDiscounts));
    const totalDiscounts = safeNumber(lineDiscounts + subtotalDiscount);
    const taxes = safeNumber(order.tax_amount);
    const serviceCharges = safeNumber(order.service_charge_amount);
    const tips = safeNumber(order.tip_amount);
    const amountDue = safeNumber(salePriceWithoutTax + taxes + serviceCharges + tips - totalDiscounts - couponDiscount);
    const amountCollected = getOrderPaymentTotals(order).amountCollected;
    const net = safeNumber(amountCollected - serviceCharges - taxes);

    // Calculate turn time: for paid orders, estimate based on payment time
    // Since we don't have payment timestamps, we'll use 0 for now
    // In a real system, you'd calculate: payment_time - created_at
    const turnTime = 0;

    return {
      salePriceWithoutTax,
      taxes,
      amountDue,
      serviceCharges,
      tips,
      discounts: totalDiscounts,
      coupons: couponDiscount,
      net,
      turnTime,
    };
  };

  // First section: Financial calculations
  const financialMetrics = useMemo(() => {
    const salePriceWithoutTax = safeNumber(
      orders.reduce((sum, order) => {
        const filteredItems = getOrderFilteredItems(order);
        const itemsTotal = safeNumber(
          filteredItems.reduce((itemSum, item) => {
            const price = calculateOrderItemPrice(item);
            return itemSum + safeNumber(price);
          }, 0)
        );
        return sum + itemsTotal;
      }, 0)
    );

    const taxCollected = safeNumber(
      orders.reduce((sum, order) => sum + safeNumber(order.tax_amount), 0)
    );

    const serviceCharges = safeNumber(
      orders.reduce((sum, order) => sum + safeNumber(order.service_charge_amount), 0)
    );
    const tips = safeNumber(
      orders.reduce((sum, order) => sum + safeNumber(order.tip_amount), 0)
    );

    const itemDiscounts = safeNumber(
      orders.reduce((sum, order) => {
        const filteredItems = getOrderFilteredItems(order);
        return sum + safeNumber(filteredItems.reduce((itemSum, item) => itemSum + safeNumber(item?.discount), 0));
      }, 0)
    );

    const subtotalDiscounts = safeNumber(
      orders.reduce((sum, order) => {
        const filteredItems = getOrderFilteredItems(order);
        const lineDiscounts = safeNumber(
          filteredItems.reduce((itemSum, item) => itemSum + safeNumber(item?.discount), 0)
        );
        const orderDiscount = safeNumber(order.discount_amount);
        const extraDiscount = Math.max(0, safeNumber(orderDiscount - lineDiscounts));
        return sum + extraDiscount;
      }, 0)
    );
    const couponDiscounts = safeNumber(
      orders.reduce((sum, order) => sum + safeNumber(order.coupon?.discount), 0)
    );

    const amountDue = safeNumber(
      salePriceWithoutTax + taxCollected + serviceCharges + tips - itemDiscounts - subtotalDiscounts - couponDiscounts
    );

    const amountCollected = safeNumber(
      orders.reduce((sum, order) => {
        return sum + getOrderPaymentTotals(order).amountCollected;
      }, 0)
    );

    const rounding = safeNumber(amountCollected - amountDue);

    const net = safeNumber(amountCollected - serviceCharges - taxCollected);

    const refunds = safeNumber(
      orders.reduce((sum, order) => {
        if (order.status === OrderStatus.Cancelled) {
          return sum + safeNumber(
            order.payments?.reduce((paySum, payment) => {
              const amount = safeNumber(payment?.amount);
              return paySum + Math.abs(Math.min(0, amount));
            }, 0) ?? 0
          );
        }
        return sum + safeNumber(
          order.payments?.reduce((paySum, payment) => {
            const amount = safeNumber(payment?.amount);
            return paySum + (amount < 0 ? Math.abs(amount) : 0);
          }, 0) ?? 0
        );
      }, 0)
    );

    const totalDiscounts = safeNumber(itemDiscounts + subtotalDiscounts);
    const gross = safeNumber(amountCollected + refunds + totalDiscounts + couponDiscounts);

    return {
      salePriceWithoutTax,
      taxCollected,
      serviceCharges,
      tips,
      itemDiscounts,
      subtotalDiscounts,
      couponDiscounts,
      amountDue,
      amountCollected,
      rounding,
      net,
      refunds,
      gross,
    };
  }, [orders]);

  // Second section: Sale by order type
  const orderTypeMetrics = useMemo(() => {
    const totalNet = financialMetrics.net;
    const map = new Map<string, OrderTypeMetrics>();

    orders.forEach(order => {
      const orderTypeName =
        order.order_type?.name || (typeof order.order_type === "string" ? order.order_type : "Unknown");

      if (!map.has(orderTypeName)) {
        map.set(orderTypeName, {
          orderType: orderTypeName,
          salePriceWithoutTax: 0,
          taxes: 0,
          amountDue: 0,
          serviceCharges: 0,
          tips: 0,
          discounts: 0,
          coupons: 0,
          net: 0,
          percentOfTotal: 0,
          guests: 0,
          avgGuest: 0,
          checks: 0,
          avgCheck: 0,
          turnTime: 0,
        });
      }

      const metrics = map.get(orderTypeName)!;
      const orderMetrics = calculateOrderMetrics(order);

      metrics.salePriceWithoutTax = safeNumber(metrics.salePriceWithoutTax + safeNumber(orderMetrics.salePriceWithoutTax));
      metrics.taxes = safeNumber(metrics.taxes + safeNumber(orderMetrics.taxes));
      metrics.amountDue = safeNumber(metrics.amountDue + safeNumber(orderMetrics.amountDue));
      metrics.serviceCharges = safeNumber(metrics.serviceCharges + safeNumber(orderMetrics.serviceCharges));
      metrics.tips = safeNumber(metrics.tips + safeNumber(orderMetrics.tips));
      metrics.discounts = safeNumber(metrics.discounts + safeNumber(orderMetrics.discounts));
      metrics.coupons = safeNumber(metrics.coupons + safeNumber(orderMetrics.coupons));
      metrics.net = safeNumber(metrics.net + safeNumber(orderMetrics.net));
      metrics.guests = safeNumber(metrics.guests + safeNumber(order.covers));
      metrics.checks += 1;
      metrics.turnTime = safeNumber(metrics.turnTime + safeNumber(orderMetrics.turnTime));
    });

    // Calculate averages and percentages
    map.forEach(metrics => {
      const safeNet = safeNumber(metrics.net);
      const safeGuests = safeNumber(metrics.guests);
      const safeChecks = safeNumber(metrics.checks);
      const safeTotalNet = safeNumber(totalNet);
      const safeTurnTime = safeNumber(metrics.turnTime);

      metrics.avgGuest = safeGuests > 0 ? safeNumber(safeNet / safeGuests) : 0;
      metrics.avgCheck = safeChecks > 0 ? safeNumber(safeNet / safeChecks) : 0;
      metrics.percentOfTotal = safeTotalNet > 0 ? safeNumber((safeNet / safeTotalNet) * 100) : 0;
      metrics.turnTime = safeChecks > 0 ? safeNumber(safeTurnTime / safeChecks) : 0;
    });

    return Array.from(map.values()).sort((a, b) => b.net - a.net);
  }, [orders, financialMetrics.net]);

  // Third section: Sale by day part
  const dayPartMetrics = useMemo(() => {
    const totalNet = financialMetrics.net;
    const map = new Map<DayPartLabel, OrderTypeMetrics>();

    DAY_PARTS.forEach(part => {
      map.set(part.label, {
        orderType: part.label,
        salePriceWithoutTax: 0,
        taxes: 0,
        amountDue: 0,
        serviceCharges: 0,
        tips: 0,
        discounts: 0,
        coupons: 0,
        net: 0,
        percentOfTotal: 0,
        guests: 0,
        avgGuest: 0,
        checks: 0,
        avgCheck: 0,
        turnTime: 0,
      });
    });

    orders.forEach(order => {
      const dayPart = getDayPartLabel(toJsDate(order.created_at));
      const metrics = map.get(dayPart)!;
      const orderMetrics = calculateOrderMetrics(order);

      metrics.salePriceWithoutTax = safeNumber(metrics.salePriceWithoutTax + safeNumber(orderMetrics.salePriceWithoutTax));
      metrics.taxes = safeNumber(metrics.taxes + safeNumber(orderMetrics.taxes));
      metrics.amountDue = safeNumber(metrics.amountDue + safeNumber(orderMetrics.amountDue));
      metrics.serviceCharges = safeNumber(metrics.serviceCharges + safeNumber(orderMetrics.serviceCharges));
      metrics.tips = safeNumber(metrics.tips + safeNumber(orderMetrics.tips));
      metrics.discounts = safeNumber(metrics.discounts + safeNumber(orderMetrics.discounts));
      metrics.coupons = safeNumber(metrics.coupons + safeNumber(orderMetrics.coupons));
      metrics.net = safeNumber(metrics.net + safeNumber(orderMetrics.net));
      metrics.guests = safeNumber(metrics.guests + safeNumber(order.covers));
      metrics.checks += 1;
      metrics.turnTime = safeNumber(metrics.turnTime + safeNumber(orderMetrics.turnTime));
    });

    // Calculate averages and percentages
    map.forEach(metrics => {
      const safeNet = safeNumber(metrics.net);
      const safeGuests = safeNumber(metrics.guests);
      const safeChecks = safeNumber(metrics.checks);
      const safeTotalNet = safeNumber(totalNet);
      const safeTurnTime = safeNumber(metrics.turnTime);

      metrics.avgGuest = safeGuests > 0 ? safeNumber(safeNet / safeGuests) : 0;
      metrics.avgCheck = safeChecks > 0 ? safeNumber(safeNet / safeChecks) : 0;
      metrics.percentOfTotal = safeTotalNet > 0 ? safeNumber((safeNet / safeTotalNet) * 100) : 0;
      metrics.turnTime = safeChecks > 0 ? safeNumber(safeTurnTime / safeChecks) : 0;
    });

    return Array.from(map.values());
  }, [orders, financialMetrics.net]);

  // Additional metrics for first section subsections
  const deletionMetrics = useMemo(() => {
    const refunds = safeNumber(
      statusOrders.reduce((sum, order) => {
        if (order.status === OrderStatus.Cancelled) {
          return sum + safeNumber(
            order.payments?.reduce((paySum, payment) => {
              const amount = safeNumber(payment?.amount);
              return paySum + Math.abs(Math.min(0, amount));
            }, 0) ?? 0
          );
        }
        return sum + safeNumber(
          order.payments?.reduce((paySum, payment) => {
            const amount = safeNumber(payment?.amount);
            return paySum + (amount < 0 ? Math.abs(amount) : 0);
          }, 0) ?? 0
        );
      }, 0)
    );
    const cancelledOrders = statusOrders.filter(order => order.status === OrderStatus.Cancelled).length;
    const voidsByReason = orderVoids.reduce((acc, voidEntry) => {
      const reason = voidEntry.reason || "Unknown";
      const voidItems = (voidEntry.items ?? []).filter(Boolean);
      const amount = calculateVoidEntryAmount(voidEntry);

      if (!acc[reason]) {
        acc[reason] = {count: 0, amount: 0};
      }
      acc[reason].count += voidItems.length;
      acc[reason].amount += amount;
      return acc;
    }, {} as Record<string, {count: number; amount: number}>);
    const totalDeletion = Object.values(voidsByReason).reduce((sum, item) => sum + item.amount, 0);

    return {
      refunds,
      cancelledOrders,
      voidsByReason,
      totalDeletion,
    };
  }, [statusOrders, orderVoids]);

  const checkStatusMetrics = useMemo(() => {
    const startDate = filters.startDate ? toJsDate(filters.startDate) : null;
    const endDate = filters.endDate ? toJsDate(filters.endDate) : null;
    const checksCarriedOver = startDate
      ? statusOrders.filter(order => {
          const orderCreatedAt = toJsDate(order.created_at);
          if (!(orderCreatedAt < startDate) || !order.completed_at) {
            return false;
          }

          const orderCompletedAt = toJsDate(order.completed_at);
          const completedWithinStart = orderCompletedAt >= startDate;
          const completedWithinEnd = endDate ? orderCompletedAt <= endDate : true;

          return completedWithinStart && completedWithinEnd;
        }).length
      : 0;
    const checksBegun = filters.startDate && filters.endDate
      ? statusOrders.filter(order => {
          const orderDate = toJsDate(order.created_at);
          const start = toJsDate(filters.startDate!);
          const end = toJsDate(filters.endDate!);
          return orderDate >= start && orderDate <= end;
        }).length
      : statusOrders.filter(order => {
          if (!startDate) {
            return true;
          }
          return toJsDate(order.created_at) >= startDate;
        }).length;
    const checksPaid = statusOrders.filter(order => order.status === OrderStatus.Paid).length;
    const checksCancelled = statusOrders.filter(order => order.status === OrderStatus.Cancelled).length;
    const checksMerged = statusOrders.filter(order => order.status === OrderStatus.Merged).length;
    const checksOpen = statusOrders.filter(order => order.status === OrderStatus["In Progress"]).length;
    const outstandingChecks = checksOpen;

    return {
      checksCarriedOver,
      checksBegun,
      checksPaid,
      checksCancelled,
      checksMerged,
      checksOpen,
      outstandingChecks,
    };
  }, [statusOrders, filters.startDate, filters.endDate]);

  const discountTypesBreakdown = useMemo(() => {
    const discountTypes = new Map<string, {quantity: number; total: number; rates: Set<number>}>();
    const couponTypes = new Map<string, {quantity: number; total: number}>();
    orders.forEach(order => {
      if (order.discount) {
        const discountName =
          order.discount?.name ||
          (typeof order.discount === "string" ? order.discount : null) ||
          "Custom discount";
        const amount = safeNumber(order.discount_amount);
        const existing = discountTypes.get(discountName) || {quantity: 0, total: 0, rates: new Set<number>()};
        existing.quantity += 1;
        existing.total += amount;
        const discountRate = safeNumber(order.discount_rate);
        if (discountRate > 0) {
          existing.rates.add(discountRate);
        }
        discountTypes.set(discountName, existing);
      }

      const couponAmount = safeNumber(order.coupon?.discount);
      if (couponAmount > 0) {
        const couponName =
          order.coupon?.coupon?.code ||
          "Unnamed coupon";
        const existing = couponTypes.get(couponName) || {quantity: 0, total: 0};
        existing.quantity += 1;
        existing.total += couponAmount;
        couponTypes.set(couponName, existing);
      }
    });

    const serviceChargesBreakdown = orders.reduce((acc, order) => {
      const amount = safeNumber(order.service_charge_amount);
      if (amount > 0) {
        const type = order.service_charge_type || "Standard";
        acc[type] = (acc[type] || 0) + amount;
      }
      return acc;
    }, {} as Record<string, number>);

    const taxesBreakdown = orders.reduce((acc, order) => {
      const amount = safeNumber(order.tax_amount);
      if (amount > 0 && order.tax) {
        const taxName =
          order.tax?.name ||
          (typeof order.tax === "string" ? order.tax : null) ||
          "Tax";
        const rate = order.tax && typeof order.tax === "object" && "rate" in order.tax ? safeNumber(order.tax.rate) : 0;
        const key = `${taxName} (${rate}%)`;
        acc[key] = (acc[key] || 0) + amount;
      }
      return acc;
    }, {} as Record<string, number>);

    const tipsByType = new Map<string, {quantity: number; total: number; rates: Set<number>}>();
    orders.forEach(order => {
      const amount = safeNumber(order.tip_amount);
      if (amount <= 0) {
        return;
      }
      const key = order.tip_type ?? "Standard";
      const existing = tipsByType.get(key) || {quantity: 0, total: 0, rates: new Set<number>()};
      existing.quantity += 1;
      existing.total += amount;
      if (order.tip_type === DiscountType.Percent) {
        const rate = safeNumber(order.tip);
        if (rate > 0) {
          existing.rates.add(rate);
        }
      }
      tipsByType.set(key, existing);
    });
    const tipsBreakdown = Array.from(tipsByType.entries())
      .map(([name, data]) => ({
        name,
        quantity: data.quantity,
        total: data.total,
        rates: Array.from(data.rates).sort((a, b) => a - b),
      }))
      .sort((a, b) => b.total - a.total);

    const extrasBreakdown = orders.reduce((acc, order) => {
      order.extras?.forEach(extra => {
        const name = extra.name || "Extra";
        const value = safeNumber(extra.value);
        acc[name] = (acc[name] || 0) + value;
      });
      return acc;
    }, {} as Record<string, number>);

    return {
      discountTypes: Array.from(discountTypes.entries()).map(([name, data]) => ({
        name,
        quantity: data.quantity,
        total: data.total,
        rates: Array.from(data.rates).sort((a, b) => a - b),
      })),
      couponTypes: Array.from(couponTypes.entries())
        .map(([name, data]) => ({
          name,
          quantity: data.quantity,
          total: data.total,
        }))
        .sort((a, b) => b.total - a.total),
      serviceChargesBreakdown,
      taxesBreakdown,
      tipsBreakdown,
      extrasBreakdown,
    };
  }, [orders]);

  // Fourth section: Breakdowns
  const breakdownMetrics = useMemo(() => {
    const categoryMixMap: Record<string, CategoryMixAggregate> = {};
    orders.forEach(order => {
      getOrderFilteredItems(order).forEach(item => {
        const categoryName = String(item?.category || "Uncategorized");
        const dishName = String(item?.item?.name || "Unknown item");
        const itemTotal = safeNumber(calculateOrderItemPrice(item));
        const itemQuantity = safeNumber(item?.quantity);
        const modifiers = getModifierRows(item?.modifiers ?? []);
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
        modifiers.forEach(modifier => {
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

    const categoryMix: CategoryMixRow[] = Object.entries(categoryMixMap)
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

    // 3rd subsection: Discounts made by users
    const userDiscountsMap = new Map<string, {quantity: number; total: number; rates: Set<number>}>();
    orders.forEach(order => {
      const discountAmount = safeNumber(order.discount_amount);
      if (discountAmount > 0) {
        const userName =
          order.user?.first_name && order.user?.last_name
            ? `${order.user.first_name} ${order.user.last_name}`
            : order.user?.login || "Unknown";
        const existing = userDiscountsMap.get(userName) || {quantity: 0, total: 0, rates: new Set<number>()};
        existing.quantity = safeNumber(existing.quantity + 1);
        existing.total = safeNumber(existing.total + discountAmount);
        const discountRate = safeNumber(order.discount_rate);
        if (discountRate > 0) {
          existing.rates.add(discountRate);
        }
        userDiscountsMap.set(userName, existing);
      }
    });

    // 4th subsection: Payment types with quantity + total
    const paymentTypesMap = new Map<string, {quantity: number; total: number}>();
    orders.forEach(order => {
      const paymentTotals = getOrderPaymentTotals(order);
      Object.entries(paymentTotals.nonCashBreakdown).forEach(([paymentTypeName, paymentAmount]) => {
        const existing = paymentTypesMap.get(paymentTypeName) || {quantity: 0, total: 0};
        existing.quantity = safeNumber(existing.quantity + 1);
        existing.total = safeNumber(existing.total + paymentAmount);
        paymentTypesMap.set(paymentTypeName, existing);
      });
      const cashExisting = paymentTypesMap.get("Cash") || {quantity: 0, total: 0};
      cashExisting.quantity = safeNumber(cashExisting.quantity + 1);
      cashExisting.total = safeNumber(cashExisting.total + paymentTotals.cashAmount);
      paymentTypesMap.set("Cash", cashExisting);
    });

    return {
      categoryMix,
      userDiscounts: Array.from(userDiscountsMap.entries())
        .map(([name, data]) => ({
          name,
          quantity: data.quantity,
          total: data.total,
          rates: Array.from(data.rates).sort((a, b) => a - b),
        }))
        .sort((a, b) => b.total - a.total),
      paymentTypes: Array.from(paymentTypesMap.entries())
        .map(([name, data]) => ({name, ...data}))
        .sort((a, b) => b.total - a.total),
    };
  }, [orders]);

  if (loading) {
    return (
      <ReportsLayout title={t('titles.salesSummary2')} subtitle={subtitle}>
        <div className="py-12 text-center text-neutral-500">{t('loading.salesSummary2')}</div>
      </ReportsLayout>
    );
  }

  if (error) {
    return (
      <ReportsLayout title={t('titles.salesSummary2')} subtitle={subtitle}>
        <div className="py-12 text-center text-red-600">{t('errors.failedToLoad', { error })}</div>
      </ReportsLayout>
    );
  }

  return (
    <ReportsLayout title={t('titles.salesSummary2')} subtitle={subtitle}>
      <div className="space-y-8">
        {/* First section: Financial calculations with 4 sub-columns */}
        <div className="overflow-hidden rounded-lg border border-neutral-200">
          <h3 className="bg-neutral-100 px-6 py-3 font-semibold text-neutral-700">{t('labels.financialCalculations')}</h3>
          <div className="grid grid-cols-4 divide-x divide-neutral-200">
            {/* 1st subsection: Financial calculations */}
            <div className="p-4">
              <h4 className="mb-3 font-semibold text-neutral-600">{t('labels.financialSummary')}</h4>
              <table className="min-w-full ">
                <tbody className="divide-y divide-neutral-100">
                  <tr>
                    <td className="py-1.5 text-neutral-700">+ Sale price w/o tax</td>
                    <td className="py-1.5 text-right font-semibold text-neutral-900">
                      {withCurrency(financialMetrics.salePriceWithoutTax)}
                    </td>
                  </tr>
                  <tr>
                    <td className="py-1.5 text-neutral-700">+ Tax collected</td>
                    <td className="py-1.5 text-right font-semibold text-neutral-900">
                      {withCurrency(financialMetrics.taxCollected)}
                    </td>
                  </tr>
                  <tr>
                    <td className="py-1.5 text-neutral-700">+ Service charges</td>
                    <td className="py-1.5 text-right font-semibold text-neutral-900">
                      {withCurrency(financialMetrics.serviceCharges)}
                    </td>
                  </tr>
                  <tr>
                    <td className="py-1.5 text-neutral-700">+ Tips</td>
                    <td className="py-1.5 text-right font-semibold text-neutral-900">
                      {withCurrency(financialMetrics.tips)}
                    </td>
                  </tr>
                  <tr>
                    <td className="py-1.5 text-neutral-700">- Item discount</td>
                    <td className="py-1.5 text-right font-semibold text-red-600">
                      {withCurrency(-financialMetrics.itemDiscounts)}
                    </td>
                  </tr>
                  <tr>
                    <td className="py-1.5 text-neutral-700">- Subtotal discount</td>
                    <td className="py-1.5 text-right font-semibold text-red-600">
                      {withCurrency(-financialMetrics.subtotalDiscounts)}
                    </td>
                  </tr>
                  <tr>
                    <td className="py-1.5 text-neutral-700">- Coupon discount</td>
                    <td className="py-1.5 text-right font-semibold text-red-600">
                      {withCurrency(-financialMetrics.couponDiscounts)}
                    </td>
                  </tr>
                  <tr className="border-t border-neutral-300">
                    <td className="py-1.5 font-semibold text-neutral-900">= Amount due</td>
                    <td className="py-1.5 text-right font-bold text-neutral-900">
                      {withCurrency(financialMetrics.amountDue)}
                    </td>
                  </tr>
                  <tr>
                    <td className="py-1.5 text-neutral-700">+ Amount collected</td>
                    <td className="py-1.5 text-right font-semibold text-neutral-900">
                      {withCurrency(financialMetrics.amountCollected)}
                    </td>
                  </tr>
                  <tr>
                    <td className="py-1.5 text-neutral-700">- Amount due</td>
                    <td className="py-1.5 text-right font-semibold text-red-600">
                      {withCurrency(-financialMetrics.amountDue)}
                    </td>
                  </tr>
                  <tr className="border-t border-neutral-300">
                    <td className="py-1.5 font-semibold text-neutral-900">= Rounding</td>
                    <td className="py-1.5 text-right font-bold text-neutral-900">
                      {withCurrency(financialMetrics.rounding)}
                    </td>
                  </tr>
                  <tr>
                    <td className="py-1.5 text-neutral-700">+ Amount collected</td>
                    <td className="py-1.5 text-right font-semibold text-neutral-900">
                      {withCurrency(financialMetrics.amountCollected)}
                    </td>
                  </tr>
                  <tr>
                    <td className="py-1.5 text-neutral-700">- Service charges</td>
                    <td className="py-1.5 text-right font-semibold text-red-600">
                      {withCurrency(-financialMetrics.serviceCharges)}
                    </td>
                  </tr>
                  <tr>
                    <td className="py-1.5 text-neutral-700">- Tax collected</td>
                    <td className="py-1.5 text-right font-semibold text-red-600">
                      {withCurrency(-financialMetrics.taxCollected)}
                    </td>
                  </tr>
                  <tr className="border-t border-neutral-300">
                    <td className="py-1.5 font-semibold text-neutral-900">= Net</td>
                    <td className="py-1.5 text-right font-bold text-neutral-900">
                      {withCurrency(financialMetrics.net)}
                    </td>
                  </tr>
                  <tr>
                    <td className="py-1.5 text-neutral-700">Amount collected</td>
                    <td className="py-1.5 text-right font-semibold text-neutral-900">
                      {withCurrency(financialMetrics.amountCollected)}
                    </td>
                  </tr>
                  <tr>
                    <td className="py-1.5 text-neutral-700">+ Refunds</td>
                    <td className="py-1.5 text-right font-semibold text-neutral-900">
                      {withCurrency(financialMetrics.refunds)}
                    </td>
                  </tr>
                  <tr>
                    <td className="py-1.5 text-neutral-700">+ Discounts</td>
                    <td className="py-1.5 text-right font-semibold text-neutral-900">
                      {withCurrency(financialMetrics.itemDiscounts + financialMetrics.subtotalDiscounts)}
                    </td>
                  </tr>
                  <tr>
                    <td className="py-1.5 text-neutral-700">+ Coupons</td>
                    <td className="py-1.5 text-right font-semibold text-neutral-900">
                      {withCurrency(financialMetrics.couponDiscounts)}
                    </td>
                  </tr>
                  <tr className="border-t-2 border-neutral-300">
                    <td className="py-1.5 font-semibold text-neutral-900">= Gross</td>
                    <td className="py-1.5 text-right font-bold text-neutral-900">
                      {withCurrency(financialMetrics.gross)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* 2nd subsection: Deletions & Cancellations */}
            <div className="p-4">
              <h4 className="mb-3  font-semibold text-neutral-600">{t('labels.deletionsCancellations')}</h4>
              <table className="min-w-full ">
                <tbody className="divide-y divide-neutral-100">
                  <tr>
                    <td className="py-1.5 text-neutral-700">Refunds</td>
                    <td className="py-1.5 text-right font-semibold text-neutral-900">
                      {withCurrency(deletionMetrics.refunds)}
                    </td>
                  </tr>
                  <tr>
                    <td className="py-1.5 text-neutral-700">{t('metrics.cancelledOrders')}</td>
                    <td className="py-1.5 text-right font-semibold text-neutral-900">
                      {formatNumber(deletionMetrics.cancelledOrders)}
                    </td>
                  </tr>
                  {Object.entries(deletionMetrics.voidsByReason).map(([reason, data]) => (
                    <tr key={reason}>
                      <td className="py-1.5 text-neutral-700">{reason}</td>
                      <td className="py-1.5 text-right text-neutral-700">
                        {formatNumber(data.count)} - {withCurrency(data.amount)}
                      </td>
                    </tr>
                  ))}
                  <tr className="border-t-2 border-neutral-300">
                    <td className="py-1.5 font-semibold text-neutral-900">Total deletion</td>
                    <td className="py-1.5 text-right font-bold text-neutral-900">
                      {withCurrency(deletionMetrics.totalDeletion)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* 3rd subsection: Check Status */}
            <div className="p-4">
              <h4 className="mb-3  font-semibold text-neutral-600">{t('metrics.checkStatus')}</h4>
              <table className="min-w-full ">
                <tbody className="divide-y divide-neutral-100">
                  <tr>
                    <td className="py-1.5 text-neutral-700">{t('metrics.checksCarriedOver')}</td>
                    <td className="py-1.5 text-right font-semibold text-neutral-900">
                      {formatNumber(checkStatusMetrics.checksCarriedOver)}
                    </td>
                  </tr>
                  <tr>
                    <td className="py-1.5 text-neutral-700">{t('metrics.checksBegun')}</td>
                    <td className="py-1.5 text-right font-semibold text-neutral-900">
                      {formatNumber(checkStatusMetrics.checksBegun)}
                    </td>
                  </tr>
                  <tr>
                    <td className="py-1.5 text-neutral-700">{t('metrics.checksPaid')}</td>
                    <td className="py-1.5 text-right font-semibold text-neutral-900">
                      {formatNumber(checkStatusMetrics.checksPaid)}
                    </td>
                  </tr>
                  <tr>
                    <td className="py-1.5 text-neutral-700">{t('metrics.checksCancelled')}</td>
                    <td className="py-1.5 text-right font-semibold text-neutral-900">
                      {formatNumber(checkStatusMetrics.checksCancelled)}
                    </td>
                  </tr>
                  <tr>
                    <td className="py-1.5 text-neutral-700">{t('metrics.checksMerged')}</td>
                    <td className="py-1.5 text-right font-semibold text-neutral-900">
                      {formatNumber(checkStatusMetrics.checksMerged)}
                    </td>
                  </tr>
                  <tr>
                    <td className="py-1.5 text-neutral-700">{t('metrics.checksOpen')}</td>
                    <td className="py-1.5 text-right font-semibold text-neutral-900">
                      {formatNumber(checkStatusMetrics.checksOpen)}
                    </td>
                  </tr>
                  <tr className="border-t-2 border-neutral-300">
                    <td className="py-1.5 font-semibold text-neutral-900">= Outstanding checks</td>
                    <td className="py-1.5 text-right font-bold text-neutral-900">
                      {formatNumber(checkStatusMetrics.outstandingChecks)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* 4th subsection: Discount Types & Breakdowns */}
            <div className="p-4">
              <h4 className="mb-3  font-semibold text-neutral-600">{t('labels.discountTypesBreakdowns')}</h4>
              <div className="space-y-4">
                {discountTypesBreakdown.discountTypes.length > 0 && (
                  <div>
                    <h5 className="mb-2  font-semibold text-neutral-600">{t('labels.discountTypes')}</h5>
                    <table className="min-w-full ">
                      <tbody className="divide-y divide-neutral-100">
                        {discountTypesBreakdown.discountTypes.map(discount => (
                          <tr key={discount.name}>
                            <td className="py-1 text-neutral-700">{discount.name}</td>
                            <td className="py-1 text-right text-neutral-700">
                              {discount.rates.length > 0
                                ? discount.rates.map(rate => `${formatNumber(rate)}%`).join(", ")
                                : "-"}
                            </td>
                            <td className="py-1 text-right text-neutral-700">{formatNumber(discount.quantity)}</td>
                            <td className="py-1 text-right font-semibold text-neutral-900">
                              {withCurrency(discount.total)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                {discountTypesBreakdown.couponTypes.length > 0 && (
                  <div>
                    <h5 className="mb-2  font-semibold text-neutral-600">{t('metrics.coupons')}</h5>
                    <table className="min-w-full ">
                      <tbody className="divide-y divide-neutral-100">
                        {discountTypesBreakdown.couponTypes.map(coupon => (
                          <tr key={coupon.name}>
                            <td className="py-1 text-neutral-700">{coupon.name}</td>
                            <td className="py-1 text-right text-neutral-700">{formatNumber(coupon.quantity)}</td>
                            <td className="py-1 text-right font-semibold text-neutral-900">
                              {withCurrency(coupon.total)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                {Object.keys(discountTypesBreakdown.serviceChargesBreakdown).length > 0 && (
                  <div>
                    <h5 className="mb-2  font-semibold text-neutral-600">Service Charges</h5>
                    <table className="min-w-full ">
                      <tbody className="divide-y divide-neutral-100">
                        {Object.entries(discountTypesBreakdown.serviceChargesBreakdown).map(([type, amount]) => (
                          <tr key={type}>
                            <td className="py-1 text-neutral-700">{type}</td>
                            <td className="py-1 text-right font-semibold text-neutral-900">{withCurrency(amount)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                {Object.keys(discountTypesBreakdown.taxesBreakdown).length > 0 && (
                  <div>
                    <h5 className="mb-2  font-semibold text-neutral-600">Taxes</h5>
                    <table className="min-w-full ">
                      <tbody className="divide-y divide-neutral-100">
                        {Object.entries(discountTypesBreakdown.taxesBreakdown).map(([type, amount]) => (
                          <tr key={type}>
                            <td className="py-1 text-neutral-700">{type}</td>
                            <td className="py-1 text-right font-semibold text-neutral-900">{withCurrency(amount)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                {discountTypesBreakdown.tipsBreakdown.length > 0 && (
                  <div>
                    <h5 className="mb-2  font-semibold text-neutral-600">{t('reports.tips')}</h5>
                    <table className="min-w-full ">
                      <tbody className="divide-y divide-neutral-100">
                        {discountTypesBreakdown.tipsBreakdown.map(tipRow => (
                          <tr key={tipRow.name}>
                            <td className="py-1 text-neutral-700">{tipRow.name}</td>
                            <td className="py-1 text-right text-neutral-700">
                              {tipRow.rates.length > 0
                                ? tipRow.rates.map(rate => `${formatNumber(rate)}%`).join(", ")
                                : "-"}
                            </td>
                            <td className="py-1 text-right text-neutral-700">{formatNumber(tipRow.quantity)}</td>
                            <td className="py-1 text-right font-semibold text-neutral-900">
                              {withCurrency(tipRow.total)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                {Object.keys(discountTypesBreakdown.extrasBreakdown).length > 0 && (
                  <div>
                    <h5 className="mb-2  font-semibold text-neutral-600">Order Extras</h5>
                    <table className="min-w-full ">
                      <tbody className="divide-y divide-neutral-100">
                        {Object.entries(discountTypesBreakdown.extrasBreakdown).map(([name, amount]) => (
                          <tr key={name}>
                            <td className="py-1 text-neutral-700">{name}</td>
                            <td className="py-1 text-right font-semibold text-neutral-900">{withCurrency(amount)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Second section: Sale by order type */}
        <div className="overflow-hidden rounded-lg border border-neutral-200">
          <h3 className="bg-neutral-100 px-6 py-3 font-semibold text-neutral-700">Sale by Order Type</h3>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-neutral-200">
              <thead className="bg-neutral-50">
                <tr>
                  <th className="py-3 pl-6 pr-3 text-left  font-semibold text-neutral-700">{t('filters.orderType')}</th>
                  <th className="py-3 px-3 text-right  font-semibold text-neutral-700">Sale Price w/o Tax</th>
                  <th className="py-3 px-3 text-right  font-semibold text-neutral-700">Taxes</th>
                  <th className="py-3 px-3 text-right  font-semibold text-neutral-700">{t('labels.amountDue')}</th>
                  <th className="py-3 px-3 text-right  font-semibold text-neutral-700">Service Charges</th>
                  <th className="py-3 px-3 text-right  font-semibold text-neutral-700">{t('reports.tips')}</th>
                  <th className="py-3 px-3 text-right  font-semibold text-neutral-700">{t('metrics.discounts')}</th>
                  <th className="py-3 px-3 text-right  font-semibold text-neutral-700">{t('metrics.coupons')}</th>
                  <th className="py-3 px-3 text-right  font-semibold text-neutral-700">{t('metrics.net')}</th>
                  <th className="py-3 px-3 text-right  font-semibold text-neutral-700">% of Total</th>
                  <th className="py-3 px-3 text-right  font-semibold text-neutral-700">{t('columns.guests')}</th>
                  <th className="py-3 px-3 text-right  font-semibold text-neutral-700">{t('columns.avgGuest')}</th>
                  <th className="py-3 px-3 text-right  font-semibold text-neutral-700">{t('columns.checks')}</th>
                  <th className="py-3 px-3 text-right  font-semibold text-neutral-700">{t('columns.avgCheck')}</th>
                  <th className="py-3 pr-6 text-right  font-semibold text-neutral-700">Turn Time (min)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100 bg-white">
                {orderTypeMetrics.map(metrics => (
                  <tr key={metrics.orderType}>
                    <td className="py-3 pl-6 pr-3 font-medium text-neutral-900">{metrics.orderType}</td>
                    <td className="py-3 px-3 text-right text-neutral-700">
                      {withCurrency(metrics.salePriceWithoutTax)}
                    </td>
                    <td className="py-3 px-3 text-right text-neutral-700">{withCurrency(metrics.taxes)}</td>
                    <td className="py-3 px-3 text-right text-neutral-700">{withCurrency(metrics.amountDue)}</td>
                    <td className="py-3 px-3 text-right text-neutral-700">
                      {withCurrency(metrics.serviceCharges)}
                    </td>
                    <td className="py-3 px-3 text-right text-neutral-700">{withCurrency(metrics.tips)}</td>
                    <td className="py-3 px-3 text-right text-neutral-700">{withCurrency(metrics.discounts)}</td>
                    <td className="py-3 px-3 text-right text-neutral-700">{withCurrency(metrics.coupons)}</td>
                    <td className="py-3 px-3 text-right font-semibold text-neutral-900">
                      {withCurrency(metrics.net)}
                    </td>
                    <td className="py-3 px-3 text-right text-neutral-700">
                      {formatNumber(metrics.percentOfTotal)}%
                    </td>
                    <td className="py-3 px-3 text-right text-neutral-700">{formatNumber(metrics.guests)}</td>
                    <td className="py-3 px-3 text-right text-neutral-700">
                      {withCurrency(metrics.avgGuest)}
                    </td>
                    <td className="py-3 px-3 text-right text-neutral-700">{formatNumber(metrics.checks)}</td>
                    <td className="py-3 px-3 text-right text-neutral-700">{withCurrency(metrics.avgCheck)}</td>
                    <td className="py-3 pr-6 text-right text-neutral-700">{formatNumber(metrics.turnTime)}</td>
                  </tr>
                ))}
                {orderTypeMetrics.length === 0 && (
                  <tr>
                    <td colSpan={15} className="py-6 text-center text-neutral-500">
                      No order type data available
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Third section: Sale by day part */}
        <div className="overflow-hidden rounded-lg border border-neutral-200">
          <h3 className="bg-neutral-100 px-6 py-3 font-semibold text-neutral-700">Sale by Day Part</h3>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-neutral-200">
              <thead className="bg-neutral-50">
                <tr>
                  <th className="py-3 pl-6 pr-3 text-left  font-semibold text-neutral-700">{t('columns.dayPart')}</th>
                  <th className="py-3 px-3 text-right  font-semibold text-neutral-700">Sale Price w/o Tax</th>
                  <th className="py-3 px-3 text-right  font-semibold text-neutral-700">Taxes</th>
                  <th className="py-3 px-3 text-right  font-semibold text-neutral-700">{t('labels.amountDue')}</th>
                  <th className="py-3 px-3 text-right  font-semibold text-neutral-700">Service Charges</th>
                  <th className="py-3 px-3 text-right  font-semibold text-neutral-700">{t('reports.tips')}</th>
                  <th className="py-3 px-3 text-right  font-semibold text-neutral-700">{t('metrics.discounts')}</th>
                  <th className="py-3 px-3 text-right  font-semibold text-neutral-700">{t('metrics.coupons')}</th>
                  <th className="py-3 px-3 text-right  font-semibold text-neutral-700">{t('metrics.net')}</th>
                  <th className="py-3 px-3 text-right  font-semibold text-neutral-700">% of Total</th>
                  <th className="py-3 px-3 text-right  font-semibold text-neutral-700">{t('columns.guests')}</th>
                  <th className="py-3 px-3 text-right  font-semibold text-neutral-700">{t('columns.avgGuest')}</th>
                  <th className="py-3 px-3 text-right  font-semibold text-neutral-700">{t('columns.checks')}</th>
                  <th className="py-3 px-3 text-right  font-semibold text-neutral-700">{t('columns.avgCheck')}</th>
                  <th className="py-3 pr-6 text-right  font-semibold text-neutral-700">Turn Time (min)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100 bg-white">
                {dayPartMetrics.map(metrics => (
                  <tr key={metrics.orderType}>
                    <td className="py-3 pl-6 pr-3 font-medium text-neutral-900">
                      <div>{metrics.orderType}</div>
                      <div className="text-xs font-normal text-neutral-500">
                        {getDayPartTimeRangeLabel(metrics.orderType as DayPartLabel)}
                      </div>
                    </td>
                    <td className="py-3 px-3 text-right text-neutral-700">
                      {withCurrency(metrics.salePriceWithoutTax)}
                    </td>
                    <td className="py-3 px-3 text-right text-neutral-700">{withCurrency(metrics.taxes)}</td>
                    <td className="py-3 px-3 text-right text-neutral-700">{withCurrency(metrics.amountDue)}</td>
                    <td className="py-3 px-3 text-right text-neutral-700">
                      {withCurrency(metrics.serviceCharges)}
                    </td>
                    <td className="py-3 px-3 text-right text-neutral-700">{withCurrency(metrics.tips)}</td>
                    <td className="py-3 px-3 text-right text-neutral-700">{withCurrency(metrics.discounts)}</td>
                    <td className="py-3 px-3 text-right text-neutral-700">{withCurrency(metrics.coupons)}</td>
                    <td className="py-3 px-3 text-right font-semibold text-neutral-900">
                      {withCurrency(metrics.net)}
                    </td>
                    <td className="py-3 px-3 text-right text-neutral-700">
                      {formatNumber(metrics.percentOfTotal)}%
                    </td>
                    <td className="py-3 px-3 text-right text-neutral-700">{formatNumber(metrics.guests)}</td>
                    <td className="py-3 px-3 text-right text-neutral-700">
                      {withCurrency(metrics.avgGuest)}
                    </td>
                    <td className="py-3 px-3 text-right text-neutral-700">{formatNumber(metrics.checks)}</td>
                    <td className="py-3 px-3 text-right text-neutral-700">{withCurrency(metrics.avgCheck)}</td>
                    <td className="py-3 pr-6 text-right text-neutral-700">{formatNumber(metrics.turnTime)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Fourth section: Breakdowns with 3 sub-columns */}
        <div className="overflow-hidden rounded-lg border border-neutral-200">
          <h3 className="bg-neutral-100 px-6 py-3 font-semibold text-neutral-700">{t('labels.breakdowns')}</h3>
          <div className="grid grid-cols-3 divide-x divide-neutral-200">
            {/* 1st subsection: Categories with dishes and modifiers */}
            <div className="p-4">
              <h4 className="mb-3  font-semibold text-neutral-600">{t('filters.categories')}</h4>
              {breakdownMetrics.categoryMix.length > 0 ? (
                <div>
                  <div className="border-b border-neutral-300 py-2 text-xs font-semibold uppercase tracking-wide text-neutral-600">
                    <div className="flex">
                      <span className="w-1/2">{t('filters.item')}</span>
                      <span className="w-1/6 text-right">Qty</span>
                      <span className="w-1/6 text-right">{t('columns.total')}</span>
                      <span className="w-1/6 text-right">Share</span>
                    </div>
                  </div>
                  {breakdownMetrics.categoryMix.map(category => (
                    <div key={category.name}>
                      <div className="border-b border-neutral-200 bg-neutral-50 py-2 text-sm font-semibold">
                        <div className="flex">
                          <span className="w-1/2">{category.name}</span>
                          <span className="w-1/6 text-right tabular-nums">{formatNumber(category.quantity)}</span>
                          <span className="w-1/6 text-right tabular-nums">{withCurrency(category.total)}</span>
                          <span className="w-1/6 text-right tabular-nums">
                            {formatNumber(
                              financialMetrics.salePriceWithoutTax > 0
                                ? (category.total / financialMetrics.salePriceWithoutTax) * 100
                                : 0,
                            )}
                            %
                          </span>
                        </div>
                      </div>
                      {category.dishes.map(dish => (
                        <div key={`${category.name}-${dish.key}`} className="border-b border-neutral-200 py-2 text-sm">
                          <div className="flex">
                            <div className="w-1/2 pr-2">
                              <div className="pl-4">{dish.name}</div>
                              {dish.modifiers.map(modifier => (
                                <div
                                  key={`${category.name}-${dish.key}-${modifier.path}`}
                                  className="flex text-xs text-neutral-500"
                                >
                                  <div
                                    className="w-4/6"
                                    style={{paddingLeft: `${modifier.depth + 1}rem`}}
                                  >
                                    - {modifier.name}
                                  </div>
                                  <div className="w-1/6">{formatNumber(modifier.quantity)}</div>
                                  <div className="w-1/6">{formatNumber(modifier.price)}</div>
                                </div>
                              ))}
                            </div>
                            <span className="w-1/6 text-right tabular-nums">{formatNumber(dish.quantity)}</span>
                            <span className="w-1/6 text-right tabular-nums">{withCurrency(dish.total)}</span>
                            <span className="w-1/6 text-right tabular-nums">
                              {formatNumber(
                                financialMetrics.salePriceWithoutTax > 0
                                  ? (dish.total / financialMetrics.salePriceWithoutTax) * 100
                                  : 0,
                              )}
                              %
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              ) : (
                <div className=" text-neutral-500">No categories data</div>
              )}
            </div>

            {/* 2nd subsection: Discounts by users */}
            <div className="p-4">
              <h4 className="mb-3  font-semibold text-neutral-600">{t('labels.discountsByUsers')}</h4>
              {breakdownMetrics.userDiscounts.length > 0 ? (
                <table className="min-w-full ">
                  <thead>
                    <tr>
                      <th className="py-1.5 text-left  font-semibold text-neutral-600">{t('filters.user')}</th>
                      <th className="py-1.5 text-right  font-semibold text-neutral-600">Rate</th>
                      <th className="py-1.5 text-right  font-semibold text-neutral-600">Qty</th>
                      <th className="py-1.5 text-right  font-semibold text-neutral-600">{t('columns.total')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100">
                    {breakdownMetrics.userDiscounts.map(userDiscount => (
                      <tr key={userDiscount.name}>
                        <td className="py-1.5 text-neutral-700">{userDiscount.name}</td>
                        <td className="py-1.5 text-right text-neutral-700">
                          {userDiscount.rates.length > 0
                            ? userDiscount.rates.map(rate => `${formatNumber(rate)}%`).join(", ")
                            : "-"}
                        </td>
                        <td className="py-1.5 text-right text-neutral-700">
                          {formatNumber(userDiscount.quantity)}
                        </td>
                        <td className="py-1.5 text-right font-semibold text-neutral-900">
                          {withCurrency(userDiscount.total)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className=" text-neutral-500">No user discounts data</div>
              )}
            </div>

            {/* 3rd subsection: Payment types */}
            <div className="p-4">
              <h4 className="mb-3  font-semibold text-neutral-600">Payment Types</h4>
              {breakdownMetrics.paymentTypes.length > 0 ? (
                <table className="min-w-full ">
                  <thead>
                    <tr>
                      <th className="py-1.5 text-left  font-semibold text-neutral-600">{t('filters.paymentType')}</th>
                      <th className="py-1.5 text-right  font-semibold text-neutral-600">Qty</th>
                      <th className="py-1.5 text-right  font-semibold text-neutral-600">{t('columns.total')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100">
                    {breakdownMetrics.paymentTypes.map(paymentType => (
                      <tr key={paymentType.name}>
                        <td className="py-1.5 text-neutral-700">{paymentType.name}</td>
                        <td className="py-1.5 text-right text-neutral-700">
                          {formatNumber(paymentType.quantity)}
                        </td>
                        <td className="py-1.5 text-right font-semibold text-neutral-900">
                          {withCurrency(paymentType.total)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className=" text-neutral-500">No payment types data</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </ReportsLayout>
  );
};
