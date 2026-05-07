import {useEffect, useMemo, useRef, useState} from "react";
import {ReportsLayout} from "@/screens/partials/reports.layout.tsx";
import {useDB} from "@/api/db/db.ts";
import {Tables} from "@/api/db/tables.ts";
import {Order} from "@/api/model/order.ts";
import {OrderVoid} from "@/api/model/order_void.ts";
import {withCurrency, formatNumber} from "@/lib/utils.ts";
import {calculateOrderItemPrice} from "@/lib/cart.ts";
import {getOrderFilteredItems, getOrderPaymentTotals} from "@/lib/order.ts";
import { toJsDate } from "@/lib/datetime.ts";
import {DAY_PARTS, getDayPartLabel, getDayPartTimeRangeLabel, type DayPartLabel} from "@/utils/dayParts";

type BreakdownItem = {
  label: string;
  value: string;
};

type SummaryRow = {
  label: string;
  value?: string;
  breakdown?: BreakdownItem[];
};

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

const calculateOrderNetSales = (order: Order): number => {
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

const parseFilters = () => {
  const params = new URLSearchParams(window.location.search);
  const startDate = params.get("start") || params.get("start");
  const endDate = params.get("end") || params.get("end");
  return {startDate, endDate};
};

export const SalesSummaryReport = () => {
  const db = useDB();
  const queryRef = useRef(db.query);
  const [orders, setOrders] = useState<Order[]>([]);
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

        const orderConditions = [`status = 'Paid'`];
        const params: Record<string, string> = {};

        if (filters.startDate) {
          orderConditions.push(`time::format(created_at, "${import.meta.env.VITE_DB_DATABASE_FORMAT}") >= $startDate`);
          params.startDate = filters.startDate;
        }

        if (filters.endDate) {
          orderConditions.push(`time::format(created_at, "${import.meta.env.VITE_DB_DATABASE_FORMAT}") <= $endDate`);
          params.endDate = filters.endDate;
        }

        const ordersQuery = `
          SELECT * FROM ${Tables.orders}
          WHERE ${orderConditions.join(" AND ")}
          FETCH payments, payments.payment_type, discount, order_type, items, items.item, coupon, coupon.coupon
        `;

        const ordersResult: any = await queryRef.current(ordersQuery, params);
        setOrders((ordersResult?.[0] ?? []) as Order[]);

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
        console.error("Failed to load sales summary report", err);
        setError(err instanceof Error ? err.message : "Unable to load report");
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [filters.startDate, filters.endDate]);

  const totalNetSales = useMemo(() => {
    return orders.reduce((sum, order) => sum + calculateOrderNetSales(order), 0);
  }, [orders]);

  const paymentSummary = useMemo(() => {
    return orders.reduce(
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
  }, [orders]);

  const roundingBenefit = paymentSummary.amountDue - paymentSummary.amountCollected;

  const serviceCharges = useMemo(
    () => orders.reduce((sum, order) => sum + safeNumber(order.service_charge_amount), 0),
    [orders],
  );

  const taxes = useMemo(() => orders.reduce((sum, order) => sum + safeNumber(order.tax_amount), 0), [orders]);

  const totalDiscounts = useMemo(
    () => orders.reduce((sum, order) => sum + safeNumber(order.discount_amount), 0),
    [orders],
  );
  const totalCoupons = useMemo(
    () => orders.reduce((sum, order) => sum + safeNumber(order.coupon?.discount), 0),
    [orders],
  );

  const dayPartTotals = useMemo(() => {
    const base = DAY_PARTS.reduce(
      (acc, part) => ({
        ...acc,
        [part.label]: {checks: 0, guests: 0, sales: 0},
      }),
      {} as Record<DayPartLabel, {checks: number; guests: number; sales: number}>,
    );

    orders.forEach(order => {
      const label = getDayPartLabel(toJsDate(order.created_at));
      base[label].checks += 1;
      base[label].guests += safeNumber(order.covers);
      base[label].sales += calculateOrderNetSales(order);
    });

    return base;
  }, [orders]);

  const orderTypeBreakdown = useMemo(() => {
    const map = new Map<string, number>();
    orders.forEach(order => {
      const key = order.order_type?.name || (typeof order.order_type === "string" ? order.order_type : "Unknown");
      map.set(key, (map.get(key) ?? 0) + calculateOrderNetSales(order));
    });
    return Array.from(map.entries())
      .map(([label, value]) => ({label, value}))
      .sort((a, b) => b.value - a.value);
  }, [orders]);

  const totalVoids = useMemo(() => {
    return orderVoids.reduce((sum, entry) => {
      return sum + calculateVoidEntryAmount(entry);
    }, 0);
  }, [orderVoids]);

  const discountRows = useMemo(() => {
    const map = new Map<string, {quantity: number; amount: number}>();
    orders.forEach(order => {
      const discountName =
        order.discount?.name ||
        (typeof order.discount === "string" ? order.discount : null) ||
        (safeNumber(order.discount_amount) > 0 ? "Custom discount" : null);

      if (!discountName) {
        return;
      }

      const amount = safeNumber(order.discount_amount);
      const current = map.get(discountName) ?? {quantity: 0, amount: 0};
      current.quantity += 1;
      current.amount += amount;
      map.set(discountName, current);
    });

    return Array.from(map.entries())
      .map(([type, stats]) => ({
        type,
        quantity: stats.quantity,
        amount: stats.amount,
      }))
      .sort((a, b) => b.amount - a.amount);
  }, [orders]);

  const summaryRows: SummaryRow[] = useMemo(() => {
    const checkBreakdown = DAY_PARTS.map(part => ({
      label: `${part.label} (${getDayPartTimeRangeLabel(part.label)})`,
      value: formatNumber(dayPartTotals[part.label].checks),
    }));

    const saleBreakdown = DAY_PARTS.map(part => ({
      label: `${part.label} (${getDayPartTimeRangeLabel(part.label)})`,
      value: withCurrency(dayPartTotals[part.label].sales),
    }));

    const orderTypeItems: BreakdownItem[] = orderTypeBreakdown.map(item => ({
      label: item.label,
      value: withCurrency(item.value),
    }));

    const nonCashItems: BreakdownItem[] = Object.entries(paymentSummary.nonCashBreakdown).map(([label, value]) => ({
      label,
      value: withCurrency(value),
    }));

    return [
      {label: "Net sales", value: withCurrency(totalNetSales)},
      {label: "Amount collected", value: withCurrency(paymentSummary.amountCollected)},
      {label: "Cash payments (net)", value: withCurrency(paymentSummary.cashPayments)},
      {label: "Rounding benefit", value: withCurrency(roundingBenefit)},
      {label: "Check count by day part", breakdown: checkBreakdown},
      {label: "Sale by day part", breakdown: saleBreakdown},
      {label: "Net sales by order type", breakdown: orderTypeItems},
      {label: "Service charges", value: withCurrency(serviceCharges)},
      {label: "Taxes", value: withCurrency(taxes)},
      {label: "Non cash payments", value: withCurrency(paymentSummary.nonCashPayments), breakdown: nonCashItems},
      {label: "Discounts", value: withCurrency(totalDiscounts)},
      {label: "Coupons", value: withCurrency(totalCoupons)},
      {label: "Voids", value: withCurrency(totalVoids)},
    ];
  }, [
    dayPartTotals,
    orderTypeBreakdown,
    paymentSummary.amountCollected,
    paymentSummary.cashPayments,
    paymentSummary.nonCashBreakdown,
    paymentSummary.nonCashPayments,
    roundingBenefit,
    serviceCharges,
    taxes,
    totalDiscounts,
    totalCoupons,
    totalNetSales,
    totalVoids,
  ]);

  if (loading) {
    return (
      <ReportsLayout title="Sales summary" subtitle={subtitle}>
        <div className="py-12 text-center text-neutral-500">Loading sales summary…</div>
      </ReportsLayout>
    );
  }

  if (error) {
    return (
      <ReportsLayout title="Sales summary" subtitle={subtitle}>
        <div className="py-12 text-center text-red-600">Failed to load report: {error}</div>
      </ReportsLayout>
    );
  }

  return (
    <ReportsLayout title="Sales summary" subtitle={subtitle}>
      <div className="space-y-8">
        <div className="overflow-hidden rounded-lg border border-neutral-200">
          <table className="min-w-full divide-y divide-neutral-200">
            <thead className="bg-neutral-50">
            <tr>
              <th scope="col" className="py-3.5 pl-6 pr-3 text-left text-sm font-semibold text-neutral-700">
                Metric
              </th>
              <th scope="col" className="py-3.5 px-6 text-left text-sm font-semibold text-neutral-700">
                Value
              </th>
            </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100 bg-white">
            {summaryRows.map(row => (
              <tr key={row.label}>
                <th scope="row" className="w-1/3 py-4 pl-6 pr-3 text-left text-sm font-medium text-neutral-800">
                  {row.label}
                </th>
                <td className="py-4 px-6 text-sm text-neutral-700">
                  {row.value && <div className="font-semibold text-neutral-900">{row.value}</div>}
                  {row.breakdown && row.breakdown.length > 0 && (
                    <ul className="mt-2 space-y-1 text-sm text-neutral-600">
                      {row.breakdown.map(item => (
                        <li key={`${row.label}-${item.label}`} className="flex items-center justify-between">
                          <span>{item.label}</span>
                          <span className="font-medium text-neutral-900">{item.value}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </td>
              </tr>
            ))}
            {summaryRows.length === 0 && (
              <tr>
                <td colSpan={2} className="py-6 text-center text-sm text-neutral-500">
                  No sales activity for the selected period.
                </td>
              </tr>
            )}
            </tbody>
          </table>
        </div>

        <div className="overflow-hidden rounded-lg border border-neutral-200">
          <table className="min-w-full divide-y divide-neutral-200">
            <thead className="bg-neutral-50">
            <tr>
              <th scope="col" className="py-3.5 pl-6 pr-3 text-left text-sm font-semibold text-neutral-700">
                Discount type
              </th>
              <th scope="col" className="py-3.5 px-4 text-right text-sm font-semibold text-neutral-700">
                Quantity
              </th>
              <th scope="col" className="py-3.5 pr-6 text-right text-sm font-semibold text-neutral-700">
                Amount
              </th>
            </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100 bg-white">
            {discountRows.length > 0 ? (
              discountRows.map(discount => (
                <tr key={discount.type}>
                  <th scope="row" className="py-4 pl-6 pr-3 text-left text-sm font-medium text-neutral-800">
                    {discount.type}
                  </th>
                  <td className="py-4 px-4 text-right text-sm text-neutral-700">{formatNumber(discount.quantity)}</td>
                  <td className="py-4 pr-6 text-right text-sm font-semibold text-neutral-900">
                    {withCurrency(discount.amount)}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={3} className="py-6 text-center text-sm text-neutral-500">
                  No discounts applied for the selected period.
                </td>
              </tr>
            )}
            </tbody>
          </table>
        </div>
      </div>
    </ReportsLayout>
  );
};