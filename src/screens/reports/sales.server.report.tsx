import {ReportsLayout} from "@/screens/partials/reports.layout.tsx";
import {useDB} from "@/api/db/db.ts";
import {useEffect, useMemo, useRef, useState} from "react";
import { useTranslation } from 'react-i18next';
import {Tables} from "@/api/db/tables.ts";
import {Order} from "@/api/model/order.ts";
import {calculateOrderItemPrice} from "@/lib/cart.ts";
import {getOrderFilteredItems, getOrderPaymentTotals} from "@/lib/order.ts";
import {formatNumber, withCurrency} from "@/lib/utils.ts";
import {OrderItem} from "@/api/model/order_item.ts";
import { toJsDate } from "@/lib/datetime.ts";
import {DAY_PART_LABELS, getDayPartLabel, getDayPartTimeRangeLabel, type DayPartLabel} from "@/utils/dayParts";

interface CategoryAggregate {
  id: string;
  name: string;
  amountDue: number;
  netSales: number;
  discounts: number;
  coupons: number;
  taxes: number;
  grossSale: number;
  guests: number;
  checks: number;
}

interface DayPartAggregate {
  label: DayPartLabel;
  netSales: number;
  guests: number;
  checks: number;
  taxes: number;
  payments: number;
  serviceCharges: number;
  coupons: number;
}

interface UserReportSection {
  userId: string;
  userName: string;
  categories: CategoryAggregate[];
  dayParts: DayPartAggregate[];
}

interface ReportFilters {
  startDate?: string | null;
  endDate?: string | null;
  userIds: string[];
  orderTypeIds: string[];
  categoryIds: string[];
  dishIds: string[];
  floorIds: string[];
  tableIds: string[];
}

const UNCATEGORIZED = { id: 'uncategorized', name: 'Uncategorized' };

const safeNumber = (value: any): number => {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
};

const recordToString = (value: any): string => {
  if (!value) {
    return '';
  }
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'object' && 'toString' in value) {
    return value.toString();
  }
  return String(value);
};

const collectCategories = (item: OrderItem | undefined) => {
  if (!item) {
    return [UNCATEGORIZED];
  }
  const connected = item.item?.categories;

  if (Array.isArray(connected) && connected.length > 0) {
    return connected
      .map(category => ({
        id: recordToString(category?.id ?? category),
        name: category?.name ?? UNCATEGORIZED.name,
      }))
      .filter(category => Boolean(category.id));
  }

  if (item.category) {
    return [{
      id: item.category,
      name: item.category,
    }];
  }

  return [UNCATEGORIZED];
};

const sumPayments = (order: Order) => getOrderPaymentTotals(order).amountCollected;

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
    startDate: params.get('start') || params.get('start'),
    endDate: params.get('end') || params.get('end'),
    userIds: parseMulti('users'),
    orderTypeIds: parseMulti('order_types'),
    categoryIds: parseMulti('categories'),
    dishIds: parseMulti('dishes'),
    floorIds: parseMulti('floors'),
    tableIds: parseMulti('tables'),
  };
};

interface TempCategoryTotals {
  id: string;
  name: string;
  amountDue: number;
  netSales: number;
  discounts: number;
  coupons: number;
  taxes: number;
  grossSale: number;
}

const collectCategoryTotals = (order: Order): Map<string, TempCategoryTotals> => {
  const map = new Map<string, TempCategoryTotals>();
  const filteredItems = getOrderFilteredItems(order);

  filteredItems.forEach(item => {
    const grossSale = safeNumber(calculateOrderItemPrice(item));
    const discount = safeNumber(item?.discount);
    const netSales = grossSale - discount;
    const taxes = safeNumber(item?.tax);
    const amountDue = netSales + taxes;
    const categories = collectCategories(item);
    const share = categories.length > 0 ? (1 / categories.length) : 1;

    categories.forEach(category => {
      const existing = map.get(category.id) ?? {
        id: category.id,
        name: category.name,
        amountDue: 0,
        netSales: 0,
        discounts: 0,
        coupons: 0,
        taxes: 0,
        grossSale: 0,
      };

      existing.grossSale += grossSale * share;
      existing.discounts += discount * share;
      existing.netSales += netSales * share;
      existing.taxes += taxes * share;
      existing.amountDue += amountDue * share;

      map.set(category.id, existing);
    });
  });

  const totals = Array.from(map.values()).reduce((acc, row) => {
    acc.gross += row.grossSale;
    acc.discount += row.discounts;
    acc.tax += row.taxes;
    return acc;
  }, { gross: 0, discount: 0, tax: 0 });

  const orderDiscount = safeNumber(order.discount_amount);
  const extraDiscount = Math.max(0, orderDiscount - totals.discount);
  if (extraDiscount > 0 && totals.gross > 0) {
    map.forEach(row => {
      const ratio = row.grossSale / totals.gross;
      const discountShare = extraDiscount * ratio;
      row.discounts += discountShare;
      row.netSales -= discountShare;
      row.amountDue -= discountShare;
    });
  }

  const orderTax = safeNumber(order.tax_amount);
  const extraTax = Math.max(0, orderTax - totals.tax);
  if (extraTax > 0) {
    const totalNet = Array.from(map.values()).reduce((sum, row) => sum + row.netSales, 0);
    map.forEach(row => {
      const ratio = totalNet > 0 ? row.netSales / totalNet : 0;
      const taxShare = extraTax * ratio;
      row.taxes += taxShare;
      row.amountDue += taxShare;
    });
  }

  const couponDiscount = safeNumber(order.coupon?.discount);
  if (couponDiscount > 0 && totals.gross > 0) {
    map.forEach(row => {
      const ratio = row.grossSale / totals.gross;
      const couponShare = couponDiscount * ratio;
      row.coupons += couponShare;
      row.netSales -= couponShare;
      row.amountDue -= couponShare;
    });
  }

  return map;
};

const ensureDayPartEntry = (map: Record<DayPartLabel, DayPartAggregate>, label: DayPartLabel) => {
  if (!map[label]) {
    map[label] = {
      label,
      netSales: 0,
      guests: 0,
      checks: 0,
      taxes: 0,
      payments: 0,
      serviceCharges: 0,
      coupons: 0,
    };
  }
  return map[label];
};

const ensureCategoryAggregate = (
  categoryMap: Map<string, CategoryAggregate>,
  totals: TempCategoryTotals,
) => {
  if (!categoryMap.has(totals.id)) {
    categoryMap.set(totals.id, {
      id: totals.id,
      name: totals.name,
      amountDue: 0,
      netSales: 0,
      discounts: 0,
      coupons: 0,
      taxes: 0,
      grossSale: 0,
      guests: 0,
      checks: 0,
    });
  }
  return categoryMap.get(totals.id)!;
};

export const SalesServerReport = () => {
  const { t } = useTranslation('reports');
  const db = useDB();
  const queryRef = useRef(db.query);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const filters = useMemo(parseFilters, []);

  useEffect(() => {
    queryRef.current = db.query;
  }, [db]);

  useEffect(() => {
    const fetchOrders = async () => {
      try {
        setLoading(true);
        setError(null);

        const conditions = [`status = 'Paid'`];
        const params: Record<string, string> = {};

        if (filters.startDate) {
          conditions.push(`time::format(created_at, "${import.meta.env.VITE_DB_DATABASE_FORMAT}") >= $startDate`);
          params.startDate = filters.startDate;
        }

        if (filters.endDate) {
          conditions.push(`time::format(created_at, "${import.meta.env.VITE_DB_DATABASE_FORMAT}") <= $endDate`);
          params.endDate = filters.endDate;
        }

        const query = `
          SELECT * FROM ${Tables.orders}
          WHERE ${conditions.join(' AND ')}
          FETCH user,
                items,
                items.item,
                items.item.categories,
                table,
                floor,
                payments,
                coupon,
                coupon.coupon
        `;

        const result: any = await queryRef.current(query, params);
        setOrders((result?.[0] ?? []) as Order[]);
      } catch (err) {
        console.error('Failed to load server sales report:', err);
        setError(err instanceof Error ? err.message : t('errors.unableToLoad'));
      } finally {
        setLoading(false);
      }
    };

    fetchOrders();
  }, [filters.startDate, filters.endDate]);

  const filteredOrders = useMemo(() => {
    return orders.filter(order => {
      const userId = recordToString(order.user?.id ?? order.user);
      if (filters.userIds.length && !filters.userIds.includes(userId)) {
        return false;
      }

      const orderTypeId = recordToString(order.order_type?.id ?? order.order_type);
      if (filters.orderTypeIds.length && !filters.orderTypeIds.includes(orderTypeId)) {
        return false;
      }

      const floorId = recordToString(order.floor?.id ?? order.floor);
      if (filters.floorIds.length && !filters.floorIds.includes(floorId)) {
        return false;
      }

      const tableId = recordToString(order.table?.id ?? order.table);
      if (filters.tableIds.length && !filters.tableIds.includes(tableId)) {
        return false;
      }

      if (filters.dishIds.length) {
        const hasDish = order.items?.some(item =>
          filters.dishIds.includes(recordToString(item?.item?.id ?? item?.item))
        );
        if (!hasDish) {
          return false;
        }
      }

      if (filters.categoryIds.length) {
        const hasCategory = order.items?.some(item => {
          const categories = collectCategories(item);
          return categories.some(category => filters.categoryIds.includes(category.id));
        });
        if (!hasCategory) {
          return false;
        }
      }

      return true;
    });
  }, [orders, filters]);

  const sections: UserReportSection[] = useMemo(() => {
    if (!filteredOrders.length) {
      return [];
    }

    const map = new Map<string, { userName: string; categoryMap: Map<string, CategoryAggregate>; dayPartMap: Record<DayPartLabel, DayPartAggregate>; }>();

    filteredOrders.forEach(order => {
      const userId = recordToString(order.user?.id ?? order.user) || 'unknown';
      const userName = order.user
        ? `${order.user.first_name ?? ''} ${order.user.last_name ?? ''}`.trim() || order.user.login || 'Unknown user'
        : 'Unknown user';

      if (!map.has(userId)) {
        map.set(userId, {
          userName,
          categoryMap: new Map<string, CategoryAggregate>(),
          dayPartMap: {} as Record<DayPartLabel, DayPartAggregate>,
        });
      }

      const entry = map.get(userId)!;
      const categoryTotals = collectCategoryTotals(order);
      const orderNet = Array.from(categoryTotals.values()).reduce((sum, row) => sum + row.netSales, 0);
      const covers = safeNumber(order.covers);
      const dayPart = ensureDayPartEntry(entry.dayPartMap, getDayPartLabel(toJsDate(order.created_at)));

      dayPart.netSales += orderNet;
      dayPart.guests += covers;
      dayPart.checks += 1;
      dayPart.taxes += safeNumber(order.tax_amount);
      dayPart.payments += sumPayments(order);
      dayPart.serviceCharges += safeNumber(order.service_charge_amount);
      dayPart.coupons += safeNumber(order.coupon?.discount);

      categoryTotals.forEach(catTotals => {
        const category = ensureCategoryAggregate(entry.categoryMap, catTotals);
        category.amountDue += catTotals.amountDue;
        category.netSales += catTotals.netSales;
        category.discounts += catTotals.discounts;
        category.coupons += catTotals.coupons;
        category.taxes += catTotals.taxes;
        category.grossSale += catTotals.grossSale;
        category.checks += 1;

        if (orderNet > 0 && covers > 0) {
          category.guests += (catTotals.netSales / orderNet) * covers;
        }
      });
    });

    return Array.from(map.entries()).map(([userId, data]) => ({
      userId,
      userName: data.userName,
      categories: Array.from(data.categoryMap.values()).sort((a, b) => b.netSales - a.netSales),
      dayParts: DAY_PART_LABELS.map(label => data.dayPartMap[label] ?? {
        label,
        netSales: 0,
        guests: 0,
        checks: 0,
        taxes: 0,
        payments: 0,
        serviceCharges: 0,
        coupons: 0,
      }),
    }));
  }, [filteredOrders]);

  const subtitle = filters.startDate && filters.endDate
    ? `${filters.startDate} to ${filters.endDate}`
    : undefined;

  if (loading) {
    return (
      <ReportsLayout title={t('titles.serverSales')} subtitle={subtitle}>
        <div className="text-center p-6">{t('loading.report')}</div>
      </ReportsLayout>
    );
  }

  if (error) {
    return (
      <ReportsLayout title={t('titles.serverSales')} subtitle={subtitle}>
        <div className="text-center p-6 text-danger-600">
          {t('errors.failedToLoad', { error })}
        </div>
      </ReportsLayout>
    );
  }

  if (!sections.length) {
    return (
      <ReportsLayout title={t('titles.serverSales')} subtitle={subtitle}>
        <div className="text-center p-6 text-gray-500">
          No server sales found for the selected filters.
        </div>
      </ReportsLayout>
    );
  }

  return (
    <ReportsLayout
      title={t('titles.serverSales')}
      subtitle={subtitle}
    >
      <div className="flex flex-col gap-10">
        {sections.map(section => {
          const categoryTotals = section.categories.reduce((totals, row) => ({
            amountDue: totals.amountDue + row.amountDue,
            netSales: totals.netSales + row.netSales,
            discounts: totals.discounts + row.discounts,
            coupons: totals.coupons + row.coupons,
            taxes: totals.taxes + row.taxes,
            grossSale: totals.grossSale + row.grossSale,
            guests: totals.guests + row.guests,
            checks: totals.checks + row.checks,
          }), {
            amountDue: 0,
            netSales: 0,
            discounts: 0,
            coupons: 0,
            taxes: 0,
            grossSale: 0,
            guests: 0,
            checks: 0,
          });

          const dayPartTotals = section.dayParts.reduce((totals, row) => ({
            netSales: totals.netSales + row.netSales,
            guests: totals.guests + row.guests,
            checks: totals.checks + row.checks,
            taxes: totals.taxes + row.taxes,
            payments: totals.payments + row.payments,
            serviceCharges: totals.serviceCharges + row.serviceCharges,
            coupons: totals.coupons + row.coupons,
          }), {
            netSales: 0,
            guests: 0,
            checks: 0,
            taxes: 0,
            payments: 0,
            serviceCharges: 0,
            coupons: 0,
          });

          return (
            <section key={section.userId} className="space-y-6">
              <div>
                <h2 className="text-2xl font-bold">{section.userName}</h2>
                <p className="text-sm text-gray-500">Server ID: {section.userId}</p>
              </div>

              <div className="overflow-x-auto">
                <table className="table table-hover min-w-full">
                  <thead>
                    <tr>
                      <th>{t('columns.category')}</th>
                      <th className="text-right">{t('labels.amountDue')}</th>
                      <th className="text-right">Net Sales Due</th>
                      <th className="text-right">{t('metrics.discounts')}</th>
                      <th className="text-right">{t('metrics.coupons')}</th>
                      <th className="text-right">Taxes</th>
                      <th className="text-right">{t('labels.grossSale')}</th>
                      <th className="text-right">{t('columns.avgCheck')}</th>
                      <th className="text-right">{t('columns.avgGuest')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {section.categories.map(row => {
                      const avgCheck = row.checks > 0 ? row.netSales / row.checks : 0;
                      const avgGuest = row.guests > 0 ? row.netSales / row.guests : 0;
                      return (
                        <tr key={row.id}>
                          <td>{row.name}</td>
                          <td className="text-right">{withCurrency(row.amountDue)}</td>
                          <td className="text-right">{withCurrency(row.netSales)}</td>
                          <td className="text-right">{withCurrency(row.discounts)}</td>
                          <td className="text-right">{withCurrency(row.coupons)}</td>
                          <td className="text-right">{withCurrency(row.taxes)}</td>
                          <td className="text-right">{withCurrency(row.grossSale)}</td>
                          <td className="text-right">{withCurrency(avgCheck)}</td>
                          <td className="text-right">{withCurrency(avgGuest)}</td>
                        </tr>
                      );
                    })}
                    {section.categories.length === 0 && (
                      <tr>
                        <td colSpan={9} className="text-center text-gray-500 py-4">
                          No category data found for this server.
                        </td>
                      </tr>
                    )}
                  </tbody>
                  <tfoot>
                    <tr className="font-semibold">
                      <td>{t('columns.total')}</td>
                      <td className="text-right">{withCurrency(categoryTotals.amountDue)}</td>
                      <td className="text-right">{withCurrency(categoryTotals.netSales)}</td>
                      <td className="text-right">{withCurrency(categoryTotals.discounts)}</td>
                      <td className="text-right">{withCurrency(categoryTotals.coupons)}</td>
                      <td className="text-right">{withCurrency(categoryTotals.taxes)}</td>
                      <td className="text-right">{withCurrency(categoryTotals.grossSale)}</td>
                      <td className="text-right">
                        {withCurrency(categoryTotals.checks > 0 ? categoryTotals.netSales / categoryTotals.checks : 0)}
                      </td>
                      <td className="text-right">
                        {withCurrency(categoryTotals.guests > 0 ? categoryTotals.netSales / categoryTotals.guests : 0)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              <div className="overflow-x-auto">
                <table className="table table-hover min-w-full">
                  <thead>
                    <tr>
                      <th>{t('columns.dayPart')}</th>
                      <th className="text-right">Net Sales Due</th>
                      <th className="text-right">Total Guests</th>
                      <th className="text-right">Total Checks</th>
                      <th className="text-right">Taxes</th>
                      <th className="text-right">{t('columns.payments')}</th>
                      <th className="text-right">Service Charges</th>
                      <th className="text-right">{t('metrics.coupons')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {section.dayParts.map(row => (
                      <tr key={row.label}>
                        <td>
                          <div>{row.label}</div>
                          <div className="text-xs text-gray-500">{getDayPartTimeRangeLabel(row.label)}</div>
                        </td>
                        <td className="text-right">{withCurrency(row.netSales)}</td>
                        <td className="text-right">{formatNumber(row.guests)}</td>
                        <td className="text-right">{formatNumber(row.checks)}</td>
                        <td className="text-right">{withCurrency(row.taxes)}</td>
                        <td className="text-right">{withCurrency(row.payments)}</td>
                        <td className="text-right">{withCurrency(row.serviceCharges)}</td>
                        <td className="text-right">{withCurrency(row.coupons)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="font-semibold">
                      <td>{t('columns.total')}</td>
                      <td className="text-right">{withCurrency(dayPartTotals.netSales)}</td>
                      <td className="text-right">{formatNumber(dayPartTotals.guests)}</td>
                      <td className="text-right">{formatNumber(dayPartTotals.checks)}</td>
                      <td className="text-right">{withCurrency(dayPartTotals.taxes)}</td>
                      <td className="text-right">{withCurrency(dayPartTotals.payments)}</td>
                      <td className="text-right">{withCurrency(dayPartTotals.serviceCharges)}</td>
                      <td className="text-right">{withCurrency(dayPartTotals.coupons)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </section>
          );
        })}
      </div>
    </ReportsLayout>
  );
};