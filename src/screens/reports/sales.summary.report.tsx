import {useEffect, useMemo, useState} from "react";
import { useTranslation } from 'react-i18next';
import {ReportsLayout} from "@/screens/partials/reports.layout.tsx";
import {useDB} from "@/api/db/db.ts";
import {parseDateRangeFromParams} from "@/api/reports/shared/filters.ts";
import {aggregateSalesSummary, fetchOrderVoids, fetchPaidOrders, SALES_SUMMARY_FETCHES} from "@/api/reports/sales";
import {withCurrency, formatNumber} from "@/lib/utils.ts";
import {DAY_PARTS, getDayPartTimeRangeLabel} from "@/utils/dayParts";

type BreakdownItem = {
  label: string;
  value: string;
};

type SummaryRow = {
  label: string;
  value?: string;
  breakdown?: BreakdownItem[];
};

const parseFilters = () => parseDateRangeFromParams(new URLSearchParams(window.location.search));

export const SalesSummaryReport = () => {
  const { t } = useTranslation('reports');
  const db = useDB();
  const [summary, setSummary] = useState<ReturnType<typeof aggregateSalesSummary> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const filters = useMemo(parseFilters, []);
  const subtitle = filters.startDate && filters.endDate ? `${filters.startDate} to ${filters.endDate}` : undefined;

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        setError(null);

        const [orders, orderVoids] = await Promise.all([
          fetchPaidOrders(db, {...filters, fetches: SALES_SUMMARY_FETCHES}),
          fetchOrderVoids(db, filters),
        ]);

        setSummary(aggregateSalesSummary(orders, orderVoids));
      } catch (err) {
        console.error("Failed to load sales summary report", err);
        setError(err instanceof Error ? err.message : t('errors.unableToLoad'));
      } finally {
        setLoading(false);
      }
    };

    void fetchData();
  }, [filters.startDate, filters.endDate]);

  const {
    totalNetSales,
    paymentSummary,
    roundingBenefit,
    serviceCharges,
    taxes,
    totalDiscounts,
    totalCoupons,
    dayPartTotals,
    orderTypeBreakdown,
    totalVoids,
    discountRows,
  } = summary ?? {
    totalNetSales: 0,
    paymentSummary: {
      amountDue: 0,
      amountCollected: 0,
      cashPayments: 0,
      nonCashPayments: 0,
      nonCashBreakdown: {},
    },
    roundingBenefit: 0,
    serviceCharges: 0,
    taxes: 0,
    totalDiscounts: 0,
    totalCoupons: 0,
    dayPartTotals: DAY_PARTS.reduce(
      (acc, part) => ({...acc, [part.label]: {checks: 0, guests: 0, sales: 0}}),
      {} as ReturnType<typeof aggregateSalesSummary>["dayPartTotals"],
    ),
    orderTypeBreakdown: [],
    totalVoids: 0,
    discountRows: [],
  };

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
      {label: t('labels.cashPaymentsNet'), value: withCurrency(paymentSummary.cashPayments)},
      {label: "Rounding benefit", value: withCurrency(roundingBenefit)},
      {label: t('metrics.checkCountByDayPart'), breakdown: checkBreakdown},
      {label: "Sale by day part", breakdown: saleBreakdown},
      {label: "Net sales by order type", breakdown: orderTypeItems},
      {label: "Service charges", value: withCurrency(serviceCharges)},
      {label: "Taxes", value: withCurrency(taxes)},
      {label: "Non cash payments", value: withCurrency(paymentSummary.nonCashPayments), breakdown: nonCashItems},
      {label: t('metrics.discounts'), value: withCurrency(totalDiscounts)},
      {label: t('metrics.coupons'), value: withCurrency(totalCoupons)},
      {label: t('reports.voids'), value: withCurrency(totalVoids)},
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
      <ReportsLayout title={t('titles.salesSummary')} subtitle={subtitle}>
        <div className="py-12 text-center text-neutral-500">{t('loading.salesSummary')}</div>
      </ReportsLayout>
    );
  }

  if (error) {
    return (
      <ReportsLayout title={t('titles.salesSummary')} subtitle={subtitle}>
        <div className="py-12 text-center text-red-600">{t('errors.failedToLoad', { error })}</div>
      </ReportsLayout>
    );
  }

  return (
    <ReportsLayout title={t('titles.salesSummary')} subtitle={subtitle}>
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