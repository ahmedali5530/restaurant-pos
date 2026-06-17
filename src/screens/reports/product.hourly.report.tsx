import {useEffect, useMemo, useRef, useState} from "react";
import { useTranslation } from 'react-i18next';
import {ReportsLayout} from "@/screens/partials/reports.layout.tsx";
import {useDB} from "@/api/db/db.ts";
import {Tables} from "@/api/db/tables.ts";
import {Order} from "@/api/model/order.ts";
import {OrderItem} from "@/api/model/order_item.ts";
import {withCurrency, formatNumber} from "@/lib/utils.ts";
import {calculateOrderItemPrice} from "@/lib/cart.ts";
import { toJsDate } from "@/lib/datetime.ts";
import {getOrderFilteredItems} from "@/lib/order.ts";

const safeNumber = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

interface ReportFilters {
  startDate?: string;
  endDate?: string;
  menuItemIds: string[];
  hours: string[];
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
    startDate: params.get('start') || undefined,
    endDate: params.get('end') || undefined,
    menuItemIds: parseMulti('menu_items'),
    hours: parseMulti('hours'),
  };
};

interface HourMetrics {
  quantity: number;
  subtotal: number;
  tax: number;
}

interface MenuItemMetrics {
  menuItemId: string;
  menuItemName: string;
  hours: Record<string, HourMetrics>;
  totalQuantity: number;
  totalSubtotal: number;
  totalTax: number;
  finalTotal: number;
}

export const ProductHourlyReport = () => {
  const { t } = useTranslation('reports');
  const db = useDB();
  const queryRef = useRef(db.query);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const filters = useMemo(parseFilters, []);
  const subtitle = filters.startDate && filters.endDate
    ? `${filters.startDate} to ${filters.endDate}`
    : undefined;

  useEffect(() => {
    queryRef.current = db.query;
  }, [db]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        setError(null);

        const conditions: string[] = [];
        const params: Record<string, any> = {};

        // Date range filter
        if (filters.startDate && filters.endDate) {
          conditions.push(`time::format(created_at, "${import.meta.env.VITE_DB_DATABASE_FORMAT}") >= $startDate`);
          conditions.push(`time::format(created_at, "${import.meta.env.VITE_DB_DATABASE_FORMAT}") <= $endDate`);
          params.startDate = filters.startDate;
          params.endDate = filters.endDate;
        }

        const ordersQuery = `
          SELECT * FROM ${Tables.orders}
          WHERE ${conditions.length > 0 ? conditions.join(' AND ') : '1 = 1'}
          FETCH items, items.item, items.modifiers, items.modifiers.selectedModifiers
        `;

        const ordersResult: any = await queryRef.current(ordersQuery, params);
        setOrders((ordersResult?.[0] ?? []) as Order[]);
      } catch (err) {
        console.error("Failed to load product hourly report", err);
        setError(err instanceof Error ? err.message : t('errors.unableToLoad'));
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [filters.startDate, filters.endDate]);

  // Calculate metrics grouped by menu item and hour
  const menuItemMetrics = useMemo(() => {
    const metricsMap = new Map<string, MenuItemMetrics>();

    // Determine which hours to include
    const hoursToInclude = filters.hours.length > 0 
      ? filters.hours.map(h => parseInt(h, 10))
      : Array.from({length: 24}, (_, i) => i);

    orders.forEach(order => {
      const orderDate = toJsDate(order.created_at);
      const orderHour = orderDate.getHours();

      // Skip if hour filter is applied and this hour is not in the filter
      if (filters.hours.length > 0 && !hoursToInclude.includes(orderHour)) {
        return;
      }

      // Process each item in the order
      getOrderFilteredItems(order)?.forEach((item: OrderItem) => {
        // Filter by menu item if filter is applied
        const itemId = item.item?.id?.toString();
        if (filters.menuItemIds.length > 0 && (!itemId || !filters.menuItemIds.includes(itemId))) {
          return;
        }

        if (!itemId || !item.item?.name) {
          return;
        }

        // Get or create metrics for this menu item
        if (!metricsMap.has(itemId)) {
          const hours: Record<string, HourMetrics> = {};
          hoursToInclude.forEach(hour => {
            hours[hour.toString()] = {quantity: 0, subtotal: 0, tax: 0};
          });
          metricsMap.set(itemId, {
            menuItemId: itemId,
            menuItemName: item.item.name,
            hours,
            totalQuantity: 0,
            totalSubtotal: 0,
            totalTax: 0,
            finalTotal: 0,
          });
        }

        const metrics = metricsMap.get(itemId)!;
        const hourKey = orderHour.toString();

        // Only process if this hour is in our metrics
        if (metrics.hours[hourKey]) {
          const quantity = safeNumber(item.quantity);
          const itemPrice = calculateOrderItemPrice(item);
          const subtotal = safeNumber(itemPrice);
          const tax = safeNumber(item.tax || 0);

          metrics.hours[hourKey].quantity += quantity;
          metrics.hours[hourKey].subtotal += subtotal;
          metrics.hours[hourKey].tax += tax;
        }
      });
    });

    // Calculate totals for each menu item
    const result = Array.from(metricsMap.values()).map(metrics => {
      let totalQuantity = 0;
      let totalSubtotal = 0;
      let totalTax = 0;

      Object.values(metrics.hours).forEach(hourMetrics => {
        totalQuantity += hourMetrics.quantity;
        totalSubtotal += hourMetrics.subtotal;
        totalTax += hourMetrics.tax;
      });

      metrics.totalQuantity = totalQuantity;
      metrics.totalSubtotal = totalSubtotal;
      metrics.totalTax = totalTax;
      metrics.finalTotal = totalSubtotal + totalTax;

      return metrics;
    });

    return result.sort((a, b) => a.menuItemName.localeCompare(b.menuItemName));
  }, [orders, filters.menuItemIds, filters.hours]);

  // Determine which hours to display
  const displayHours = useMemo(() => {
    if (filters.hours.length > 0) {
      return filters.hours.map(h => parseInt(h, 10)).sort((a, b) => a - b);
    }
    return Array.from({length: 24}, (_, i) => i);
  }, [filters.hours]);

  // Calculate grand totals
  const grandTotals = useMemo(() => {
    const totals = {
      quantity: 0,
      subtotal: 0,
      tax: 0,
      finalTotal: 0,
    };

    menuItemMetrics.forEach(metrics => {
      totals.quantity += metrics.totalQuantity;
      totals.subtotal += metrics.totalSubtotal;
      totals.tax += metrics.totalTax;
      totals.finalTotal += metrics.finalTotal;
    });

    return totals;
  }, [menuItemMetrics]);

  if (loading) {
    return (
      <ReportsLayout title={t('titles.productHourly')} subtitle={subtitle}>
        <div className="py-12 text-center text-neutral-500">{t('loading.productHourly')}</div>
      </ReportsLayout>
    );
  }

  if (error) {
    return (
      <ReportsLayout title={t('titles.productHourly')} subtitle={subtitle}>
        <div className="py-12 text-center text-red-600">{t('errors.failedToLoad', { error })}</div>
      </ReportsLayout>
    );
  }

  return (
    <ReportsLayout title={t('titles.productHourly')} subtitle={subtitle}>
      <div className="alert alert-warning">This report doesn't include taxes, discounts, service charges, extras and tips</div>
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-neutral-200 border border-neutral-200">
          <thead className="bg-neutral-50">
            <tr>
              <th rowSpan={2} className="py-3 pl-6 pr-3 text-left text-xs font-semibold text-neutral-700 border-r border-neutral-200">
                Menu Item
              </th>
              {displayHours.map(hour => (
                <th key={hour} colSpan={1} className="py-3 px-3 text-center text-xs font-semibold text-neutral-700 border-r border-neutral-200">
                  {hour === 0 ? '12am' : 
                   hour === 12 ? '12pm' :
                   hour < 12 ? `${hour}am` : `${hour - 12}pm`}
                </th>
              ))}
              <th rowSpan={2} className="py-3 px-3 text-center text-xs font-semibold text-neutral-700 border-r border-neutral-200">
                Total Qty
              </th>
              <th rowSpan={2} className="py-3 px-3 text-center text-xs font-semibold text-neutral-700 border-r border-neutral-200">
                Subtotal
              </th>
              <th rowSpan={2} className="py-3 px-3 text-center text-xs font-semibold text-neutral-700 border-r border-neutral-200">
                Taxes
              </th>
              <th rowSpan={2} className="py-3 pr-6 text-center text-xs font-semibold text-neutral-700">
                Final Total
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100 bg-white">
            {menuItemMetrics.map((metrics) => (
              <tr key={metrics.menuItemId} className="hover:bg-neutral-50">
                <td className="py-3 pl-6 pr-3 text-sm font-medium text-neutral-900 border-r border-neutral-200">
                  {metrics.menuItemName}
                </td>
                {displayHours.map(hour => {
                  const hourKey = hour.toString();
                  const hourMetrics = metrics.hours[hourKey] || {quantity: 0, subtotal: 0, tax: 0};
                  return (
                    <td key={hour} className="py-3 px-3 text-right text-sm text-neutral-700 border-r border-neutral-200">
                      {formatNumber(hourMetrics.quantity)}
                    </td>
                  );
                })}
                <td className="py-3 px-3 text-right text-sm font-semibold text-neutral-900 border-r border-neutral-200">
                  {formatNumber(metrics.totalQuantity)}
                </td>
                <td className="py-3 px-3 text-right text-sm text-neutral-700 border-r border-neutral-200">
                  {withCurrency(metrics.totalSubtotal)}
                </td>
                <td className="py-3 px-3 text-right text-sm text-neutral-700 border-r border-neutral-200">
                  {withCurrency(metrics.totalTax)}
                </td>
                <td className="py-3 pr-6 text-right text-sm font-semibold text-neutral-900">
                  {withCurrency(metrics.finalTotal)}
                </td>
              </tr>
            ))}
            {menuItemMetrics.length === 0 && (
              <tr>
                <td colSpan={displayHours.length + 5} className="py-6 text-center text-sm text-neutral-500">
                  No data available for the selected filters
                </td>
              </tr>
            )}
          </tbody>
          <tfoot className="bg-neutral-50 font-semibold">
            <tr>
              <td className="py-3 pl-6 pr-3 text-sm text-neutral-900 border-r border-neutral-200">
                Totals
              </td>
              {displayHours.map(hour => {
                const hourTotal = menuItemMetrics.reduce((sum, metrics) => {
                  const hourKey = hour.toString();
                  const hourMetrics = metrics.hours[hourKey] || {quantity: 0, subtotal: 0, tax: 0};
                  return sum + hourMetrics.quantity;
                }, 0);
                return (
                  <td key={hour} className="py-3 px-3 text-right text-sm text-neutral-900 border-r border-neutral-200">
                    {formatNumber(hourTotal)}
                  </td>
                );
              })}
              <td className="py-3 px-3 text-right text-sm text-neutral-900 border-r border-neutral-200">
                {formatNumber(grandTotals.quantity)}
              </td>
              <td className="py-3 px-3 text-right text-sm text-neutral-900 border-r border-neutral-200">
                {withCurrency(grandTotals.subtotal)}
              </td>
              <td className="py-3 px-3 text-right text-sm text-neutral-900 border-r border-neutral-200">
                {withCurrency(grandTotals.tax)}
              </td>
              <td className="py-3 pr-6 text-right text-sm text-neutral-900">
                {withCurrency(grandTotals.finalTotal)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </ReportsLayout>
  );
}