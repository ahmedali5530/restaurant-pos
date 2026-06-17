import {useEffect, useMemo, useRef, useState} from "react";
import { useTranslation } from 'react-i18next';
import {ReportsLayout} from "@/screens/partials/reports.layout.tsx";
import {useDB} from "@/api/db/db.ts";
import {Tables} from "@/api/db/tables.ts";
import {Order} from "@/api/model/order.ts";
import {toLuxonDateTime} from "@/lib/datetime.ts";
import {formatNumber, withCurrency} from "@/lib/utils.ts";
import {calculateOrderItemPrice} from "@/lib/cart.ts";
import {getOrderFilteredItems} from "@/lib/order.ts";

type MetricKey = "discount_amount" | "tax_amount" | "coupon_discount";

const parseFilters = () => {
  const params = new URLSearchParams(window.location.search);
  const startDate = params.get("start") || params.get("start");
  const endDate = params.get("end") || params.get("end");
  const taxId = params.get("tax_id") || "";
  const discountId = params.get("discount_id") || "";
  const couponId = params.get("coupon_id") || "";
  return {startDate, endDate, taxId, discountId, couponId};
};

const safeNumber = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const getMetricAmount = (order: Order, metric: MetricKey) => {
  if (metric === "coupon_discount") {
    return safeNumber(order.coupon?.discount);
  }
  return safeNumber((order as any)?.[metric]);
};

const calculateGross = (order: Order) => {
  return getOrderFilteredItems(order).reduce((sum, item) => sum + safeNumber(calculateOrderItemPrice(item)), 0);
};

const normalizeRecordSuffix = (value: string) => {
  if (!value) return "";
  if (value.includes(":")) {
    return value.split(":").slice(1).join(":");
  }
  return value;
};

interface Props {
  title: string;
  metric: MetricKey;
  metricHeader: string;
}

export const OrderFinanceReport = ({title, metric, metricHeader}: Props) => {
  const { t } = useTranslation('reports');
  const db = useDB();
  const queryRef = useRef(db.query);
  const [orders, setOrders] = useState<Order[]>([]);
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

        if (metric === "coupon_discount") {
          conditions.push(`coupon != NONE`);
        } else {
          conditions.push(`${metric} > 0`);
        }

        if (metric === "tax_amount" && filters.taxId) {
          conditions.push(`tax = type::record('${Tables.taxes}', $taxId)`);
          params.taxId = normalizeRecordSuffix(filters.taxId);
        }

        if (metric === "discount_amount" && filters.discountId) {
          conditions.push(`discount = type::record('${Tables.discounts}', $discountId)`);
          params.discountId = normalizeRecordSuffix(filters.discountId);
        }

        if (metric === "coupon_discount" && filters.couponId) {
          conditions.push(`coupon.coupon = type::record('${Tables.coupons}', $couponId)`);
          params.couponId = normalizeRecordSuffix(filters.couponId);
        }

        const query = `
          SELECT * FROM ${Tables.orders}
          WHERE ${conditions.join(" AND ")}
          ORDER BY created_at DESC
          FETCH user, cashier, coupon, coupon.coupon, tax, discount
        `;

        const [result] = await queryRef.current(query, params);
        setOrders((result || []) as Order[]);
      } catch (err) {
        console.error(`Failed to load ${title}`, err);
        setError(err instanceof Error ? err.message : t('errors.unableToLoad'));
      } finally {
        setLoading(false);
      }
    };

    void fetchData();
  }, [filters.couponId, filters.discountId, filters.endDate, filters.startDate, filters.taxId, metric, title]);

  const totalMetric = useMemo(() => {
    return orders.reduce((sum, order) => sum + getMetricAmount(order, metric), 0);
  }, [orders, metric]);

  if (loading) {
    return <ReportsLayout title={title} subtitle={subtitle}><div className="py-12 text-center text-neutral-500">Loading {title.toLowerCase()}...</div></ReportsLayout>;
  }
  if (error) {
    return <ReportsLayout title={title} subtitle={subtitle}><div className="py-12 text-center text-red-600">{t('errors.failedToLoad', { error })}</div></ReportsLayout>;
  }

  return (
    <ReportsLayout title={title} subtitle={subtitle}>
      <div className="space-y-4">
        <div className="border rounded-lg p-4 bg-neutral-50">
          <div className="text-sm text-neutral-500">{t('categories.orders')}</div>
          <div className="text-xl font-semibold">{formatNumber(orders.length)}</div>
          <div className="text-sm text-neutral-500 mt-2">Total {metricHeader.toLowerCase()}</div>
          <div className="text-xl font-semibold">{withCurrency(totalMetric)}</div>
        </div>
        <div className="overflow-hidden rounded-lg border border-neutral-200">
          <table className="min-w-full divide-y divide-neutral-200">
            <thead className="bg-neutral-50">
            <tr>
              <th className="py-3 pl-6 pr-3 text-left text-sm font-semibold text-neutral-700">Created at</th>
              <th className="py-3 px-3 text-left text-sm font-semibold text-neutral-700">{t('columns.order')}</th>
              <th className="py-3 px-3 text-left text-sm font-semibold text-neutral-700">{t('metrics.cashier')}</th>
              <th className="py-3 px-3 text-right text-sm font-semibold text-neutral-700">{t('metrics.gross')}</th>
              <th className="py-3 px-3 text-right text-sm font-semibold text-neutral-700">{metricHeader}</th>
              <th className="py-3 pr-6 text-right text-sm font-semibold text-neutral-700">{t('metrics.net')}</th>
            </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100 bg-white">
            {orders.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-6 text-center text-sm text-neutral-500">No rows found for selected range.</td>
              </tr>
            ) : orders.map((order) => {
              const gross = calculateGross(order);
              const metricAmount = getMetricAmount(order, metric);
              const net = gross + safeNumber(order.tax_amount) + safeNumber(order.service_charge_amount) + safeNumber(order.tip_amount)
                - safeNumber(order.discount_amount) - safeNumber(order.coupon?.discount);
              const cashierName = `${(order.cashier as any)?.first_name || (order.user as any)?.first_name || ""} ${(order.cashier as any)?.last_name || (order.user as any)?.last_name || ""}`.trim();

              return (
                <tr key={order.id.toString()}>
                  <td className="py-3 pl-6 pr-3 text-sm text-neutral-900">{toLuxonDateTime(order.created_at as any).toFormat("yyyy-LL-dd HH:mm")}</td>
                  <td className="py-3 px-3 text-sm text-neutral-700">{order.invoice_number ? `#${order.invoice_number}` : order.id.toString()}</td>
                  <td className="py-3 px-3 text-sm text-neutral-700">{cashierName || "-"}</td>
                  <td className="py-3 px-3 text-right text-sm text-neutral-700">{withCurrency(gross)}</td>
                  <td className="py-3 px-3 text-right text-sm font-semibold text-neutral-900">{withCurrency(metricAmount)}</td>
                  <td className="py-3 pr-6 text-right text-sm text-neutral-700">{withCurrency(net)}</td>
                </tr>
              );
            })}
            </tbody>
          </table>
        </div>
      </div>
    </ReportsLayout>
  );
};
