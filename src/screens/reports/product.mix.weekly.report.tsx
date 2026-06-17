import {useEffect, useMemo, useRef, useState} from "react";
import { useTranslation } from 'react-i18next';
import {ReportsLayout} from "@/screens/partials/reports.layout.tsx";
import {useDB} from "@/api/db/db.ts";
import {Tables} from "@/api/db/tables.ts";
import {Order} from "@/api/model/order.ts";
import {withCurrency, formatNumber} from "@/lib/utils.ts";
import {calculateOrderItemPrice} from "@/lib/cart.ts";
import {getOrderFilteredItems} from "@/lib/order.ts";
import {DateTime} from "luxon";
import { toLuxonDateTime } from "@/lib/datetime.ts";

const safeNumber = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const WEEK_DAYS: string[] = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

interface ReportFilters {
  week?: string;
  orderTakerIds: string[];
  orderTypeIds: string[];
  categoryIds: string[];
  menuItemIds: string[];
}

const parseFilters = (): ReportFilters => {
  const params = new URLSearchParams(window.location.search);
  const parseMulti = (name: string) => {
    const list = [
      ...params.getAll(`${name}[]`),
      ...params.getAll(name),
    ].filter(Boolean);
    return list as string[];
  };

  return {
    week: params.get('week') || undefined,
    orderTakerIds: parseMulti('order_takers'),
    orderTypeIds: parseMulti('order_types'),
    categoryIds: parseMulti('categories'),
    menuItemIds: parseMulti('menu_items'),
  };
};

const parseWeekParams = (weekParam?: string) => {
  let weekStart = weekParam ? DateTime.fromISO(weekParam) : DateTime.now();
  if (!weekStart.isValid) {
    weekStart = DateTime.now();
  }
  weekStart = weekStart.startOf('week');
  const weekEnd = weekStart.plus({days: 6});

  return {
    weekStart,
    weekEnd,
    weekStartISO: weekStart.toISODate() || '',
    weekEndISO: weekEnd.toISODate() || '',
  };
};

interface DayMetrics {
  quantity: number;
  total: number;
}

interface OrderTakerMetrics {
  userId: string;
  userName: string;
  days: Record<string, DayMetrics>;
  weeklyTotal: DayMetrics;
}

export const ProductMixWeeklyReport = () => {
  const { t } = useTranslation('reports');
  const db = useDB();
  const queryRef = useRef(db.query);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const filters = useMemo(parseFilters, []);
  const {weekStart, weekEnd, weekStartISO, weekEndISO} = useMemo(() => parseWeekParams(filters.week), [filters.week]);
  const subtitle = filters.week ? `${weekStartISO} to ${weekEndISO}` : undefined;

  useEffect(() => {
    queryRef.current = db.query;
  }, [db]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        setError(null);

        const conditions: string[] = [];
        const params: Record<string, any> = {
          start: weekStartISO,
          end: weekEndISO,
        };

        // Week date range filter
        conditions.push(`time::format(created_at, "${import.meta.env.VITE_DB_DATABASE_FORMAT}") >= $start`);
        conditions.push(`time::format(created_at, "${import.meta.env.VITE_DB_DATABASE_FORMAT}") <= $end`);

        // Order takers filter
        if (filters.orderTakerIds.length > 0) {
          const userIdConditions = filters.orderTakerIds.map((id, index) => {
            const paramName = `user${index}`;
            params[paramName] = id;
            return `user = $${paramName}`;
          });
          conditions.push(`(${userIdConditions.join(' OR ')})`);
        }

        // Order types filter
        if (filters.orderTypeIds.length > 0) {
          const orderTypeConditions = filters.orderTypeIds.map((id, index) => {
            const paramName = `orderType${index}`;
            params[paramName] = id;
            return `order_type = $${paramName}`;
          });
          conditions.push(`(${orderTypeConditions.join(' OR ')})`);
        }

        const ordersQuery = `
          SELECT * FROM ${Tables.orders}
          WHERE ${conditions.join(' AND ')}
          FETCH user, order_type, items, items.item, items.item.categories
        `;

        const ordersResult: any = await queryRef.current(ordersQuery, params);
        setOrders((ordersResult?.[0] ?? []) as Order[]);
      } catch (err) {
        console.error("Failed to load product mix weekly report", err);
        setError(err instanceof Error ? err.message : t('errors.unableToLoad'));
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [weekStartISO, weekEndISO, filters.orderTakerIds.join(','), filters.orderTypeIds.join(',')]);

  // Filter orders by category and menu item
  const filteredOrders = useMemo(() => {
    return orders.filter(order => {
      const validItems = getOrderFilteredItems(order);

      // Check if order has items matching category filter
      if (filters.categoryIds.length > 0) {
        const hasMatchingCategory = validItems.some(item => {
          const itemCategories = item.item?.categories || [];
          if (Array.isArray(itemCategories)) {
            return itemCategories.some((cat: any) => {
              const catId = typeof cat === 'string' ? cat : cat?.id?.toString();
              return catId && filters.categoryIds.includes(catId);
            });
          }
          return false;
        });
        if (!hasMatchingCategory) {
          return false;
        }
      }

      // Check if order has items matching menu item filter
      if (filters.menuItemIds.length > 0) {
        const hasMatchingMenuItem = validItems.some(item => {
          const itemId = item.item?.id?.toString();
          return itemId && filters.menuItemIds.includes(itemId);
        });
        if (!hasMatchingMenuItem) {
          return false;
        }
      }

      return true;
    });
  }, [orders, filters.categoryIds, filters.menuItemIds]);

  // Filter items within orders by category and menu item
  const getFilteredOrderItems = (order: Order) => {
    const validItems = getOrderFilteredItems(order);
    return validItems.filter(item => {
      // Filter by category
      if (filters.categoryIds.length > 0) {
        const itemCategories = item.item?.categories || [];
        const hasMatchingCategory = Array.isArray(itemCategories)
          ? itemCategories.some((cat: any) => {
              const catId = typeof cat === 'string' ? cat : cat?.id?.toString();
              return catId && filters.categoryIds.includes(catId);
            })
          : false;
        if (!hasMatchingCategory) {
          return false;
        }
      }

      // Filter by menu item
      if (filters.menuItemIds.length > 0) {
        const itemId = item.item?.id?.toString();
        if (!itemId || !filters.menuItemIds.includes(itemId)) {
          return false;
        }
      }

      return true;
    });
  };

  // Calculate metrics grouped by order taker and day
  const orderTakerMetrics = useMemo(() => {
    const metricsMap = new Map<string, OrderTakerMetrics>();

    // Initialize day keys for the week
    const dayKeys: string[] = [];
    for (let i = 0; i < 7; i++) {
      const dayDate = weekStart.plus({days: i});
      dayKeys.push(dayDate.toISODate() || '');
    }

    filteredOrders.forEach(order => {
      const orderDate = toLuxonDateTime(order.created_at);
      const dayKey = orderDate.toISODate() || '';
      
      // Skip if not within the week
      if (!dayKeys.includes(dayKey)) {
        return;
      }

      // Get order taker info
      const userId = order.user?.id?.toString() || 'unknown';
      const userName = order.user?.first_name && order.user?.last_name
        ? `${order.user.first_name} ${order.user.last_name}`
        : order.user?.login || 'Unknown User';

      // Get or create metrics for this order taker
      if (!metricsMap.has(userId)) {
        const days: Record<string, DayMetrics> = {};
        dayKeys.forEach(key => {
          days[key] = {quantity: 0, total: 0};
        });
        metricsMap.set(userId, {
          userId,
          userName,
          days,
          weeklyTotal: {quantity: 0, total: 0},
        });
      }

      const metrics = metricsMap.get(userId)!;

      // Get filtered items for this order
      const filteredItems = getFilteredOrderItems(order);

      // Calculate quantity and total for filtered items
      const quantity = filteredItems.reduce((sum, item) => sum + safeNumber(item.quantity), 0);
      const total = filteredItems.reduce((sum, item) => {
        const itemPrice = calculateOrderItemPrice(item);
        return sum + safeNumber(itemPrice);
      }, 0);

      // Update day metrics
      const dayMetrics = metrics.days[dayKey];
      if (dayMetrics) {
        dayMetrics.quantity = safeNumber(dayMetrics.quantity + quantity);
        dayMetrics.total = safeNumber(dayMetrics.total + total);
      }

      // Update weekly totals
      metrics.weeklyTotal.quantity = safeNumber(metrics.weeklyTotal.quantity + quantity);
      metrics.weeklyTotal.total = safeNumber(metrics.weeklyTotal.total + total);
    });

    return Array.from(metricsMap.values()).sort((a, b) => a.userName.localeCompare(b.userName));
  }, [filteredOrders, weekStart, filters.categoryIds, filters.menuItemIds]);

  const dayHeaders = useMemo(() => {
    return WEEK_DAYS.map((day, index) => ({
      day,
      dateKey: weekStart.plus({days: index}).toISODate() || '',
      dateLabel: weekStart.plus({days: index}).toFormat('yyyy-LL-dd'),
    }));
  }, [weekStart]);

  if (loading) {
    return (
      <ReportsLayout title={t('reports.productMixWeekly')} subtitle={subtitle}>
        <div className="py-12 text-center text-neutral-500">{t('loading.productMixWeekly')}</div>
      </ReportsLayout>
    );
  }

  if (error) {
    return (
      <ReportsLayout title={t('reports.productMixWeekly')} subtitle={subtitle}>
        <div className="py-12 text-center text-red-600">{t('errors.failedToLoad', { error })}</div>
      </ReportsLayout>
    );
  }

  return (
    <ReportsLayout title={t('reports.productMixWeekly')} subtitle={subtitle}>
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-neutral-200 border border-neutral-200">
          <thead className="bg-neutral-50">
            <tr>
              <th rowSpan={2} className="py-3 pl-6 pr-3 text-left text-xs font-semibold text-neutral-700 border-r border-neutral-200">
                Order Taker
              </th>
              {dayHeaders.map(({day, dateLabel}) => (
                <th key={day} colSpan={2} className="py-3 px-3 text-center text-xs font-semibold text-neutral-700 border-r border-neutral-200">
                  <div>{day}</div>
                  <div className="text-xs text-neutral-500 font-normal">{dateLabel}</div>
                </th>
              ))}
              <th colSpan={2} className="py-3 pr-6 text-center text-xs font-semibold text-neutral-700">
                Weekly Total
              </th>
            </tr>
            <tr>
              {dayHeaders.flatMap(({day}) => [
                <th key={`${day}-qty`} className="py-2 px-3 text-center text-xs font-semibold text-neutral-600 bg-neutral-50 border-r border-neutral-200">
                  Qty
                </th>,
                <th key={`${day}-total`} className="py-2 px-3 text-center text-xs font-semibold text-neutral-600 bg-neutral-50 border-r border-neutral-200">
                  Total
                </th>
              ])}
              <th className="py-2 px-3 text-center text-xs font-semibold text-neutral-600 bg-neutral-50 border-r border-neutral-200">
                Qty
              </th>
              <th className="py-2 pr-6 text-center text-xs font-semibold text-neutral-600 bg-neutral-50">
                Total
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100 bg-white">
            {orderTakerMetrics.map((metrics) => (
              <tr key={metrics.userId} className="hover:bg-neutral-50">
                <td className="py-3 pl-6 pr-3 text-sm font-medium text-neutral-900 border-r border-neutral-200">
                  {metrics.userName}
                </td>
                {dayHeaders.flatMap(({dateKey}) => {
                  const dayMetrics = metrics.days[dateKey] || {quantity: 0, total: 0};
                  return [
                    <td key={`${dateKey}-qty`} className="py-3 px-3 text-right text-sm text-neutral-700 border-r border-neutral-200">
                      {formatNumber(dayMetrics.quantity)}
                    </td>,
                    <td key={`${dateKey}-total`} className="py-3 px-3 text-right text-sm text-neutral-700 border-r border-neutral-200">
                      {withCurrency(dayMetrics.total)}
                    </td>
                  ];
                })}
                <td className="py-3 px-3 text-right text-sm font-semibold text-neutral-900 border-r border-neutral-200">
                  {formatNumber(metrics.weeklyTotal.quantity)}
                </td>
                <td className="py-3 pr-6 text-right text-sm font-semibold text-neutral-900">
                  {withCurrency(metrics.weeklyTotal.total)}
                </td>
              </tr>
            ))}
            {orderTakerMetrics.length === 0 && (
              <tr>
                <td colSpan={dayHeaders.length * 2 + 3} className="py-6 text-center text-sm text-neutral-500">
                  No data available for the selected filters
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </ReportsLayout>
  );
};
