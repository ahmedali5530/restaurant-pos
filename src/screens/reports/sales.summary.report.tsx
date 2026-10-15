import {useEffect, useMemo, useState} from "react";
import { useTranslation } from 'react-i18next';
import {ReportsLayout} from "@/screens/partials/reports.layout.tsx";
import {useDB} from "@/api/db/db.ts";
import {parseDateRangeFromParams} from "@/api/reports/shared/filters.ts";
import {aggregateSalesSummary, fetchOrderVoids, fetchPaidOrders, SALES_SUMMARY_FETCHES} from "@/api/reports/sales";
import type {Order} from "@/api/model/order.ts";
import type {OrderVoid} from "@/api/model/order_void.ts";
import {withCurrency, formatNumber} from "@/lib/utils.ts";
import {DAY_PARTS, getDayPartTimeRangeLabel} from "@/utils/dayParts";
import {useReportBranchScope} from "@/hooks/useReportBranchScope.ts";
import {BranchBreakdown} from "@/components/reports/branch.breakdown.tsx";
import {getRowBranchId} from "@/api/reports/shared/branch-scope.ts";

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

const buildSummaryRows = (
  summary: ReturnType<typeof aggregateSalesSummary>,
  t: (key: string) => string,
): SummaryRow[] => {
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
  } = summary;

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
};

const SummaryTables = ({
  summary,
  t,
}: {
  summary: ReturnType<typeof aggregateSalesSummary>;
  t: (key: string) => string;
}) => {
  const summaryRows = buildSummaryRows(summary, t);
  const {discountRows} = summary;

  return (
    <div className="space-y-8">
      <div className="overflow-hidden rounded-lg border border-border">
        <table className="min-w-full divide-y divide-neutral-200">
          <thead className="bg-surface">
          <tr>
            <th scope="col" className="py-3.5 pl-6 pr-3 text-left text-sm font-semibold text-foreground">
              Metric
            </th>
            <th scope="col" className="py-3.5 px-6 text-left text-sm font-semibold text-foreground">
              Value
            </th>
          </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100 bg-surface-elevated">
          {summaryRows.map(row => (
            <tr key={row.label}>
              <th scope="row" className="w-1/3 py-4 pl-6 pr-3 text-left text-sm font-medium text-foreground">
                {row.label}
              </th>
              <td className="py-4 px-6 text-sm text-foreground">
                {row.value && <div className="font-semibold text-foreground">{row.value}</div>}
                {row.breakdown && row.breakdown.length > 0 && (
                  <ul className="mt-2 space-y-1 text-sm text-muted">
                    {row.breakdown.map(item => (
                      <li key={`${row.label}-${item.label}`} className="flex items-center justify-between">
                        <span>{item.label}</span>
                        <span className="font-medium text-foreground">{item.value}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </td>
            </tr>
          ))}
          {summaryRows.length === 0 && (
            <tr>
              <td colSpan={2} className="py-6 text-center text-sm text-muted">
                No sales activity for the selected period.
              </td>
            </tr>
          )}
          </tbody>
        </table>
      </div>

      <div className="overflow-hidden rounded-lg border border-border">
        <table className="min-w-full divide-y divide-neutral-200">
          <thead className="bg-surface">
          <tr>
            <th scope="col" className="py-3.5 pl-6 pr-3 text-left text-sm font-semibold text-foreground">
              Discount type
            </th>
            <th scope="col" className="py-3.5 px-4 text-right text-sm font-semibold text-foreground">
              Quantity
            </th>
            <th scope="col" className="py-3.5 pr-6 text-right text-sm font-semibold text-foreground">
              Amount
            </th>
          </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100 bg-surface-elevated">
          {discountRows.length > 0 ? (
            discountRows.map(discount => (
              <tr key={discount.type}>
                <th scope="row" className="py-4 pl-6 pr-3 text-left text-sm font-medium text-foreground">
                  {discount.type}
                </th>
                <td className="py-4 px-4 text-right text-sm text-foreground">{formatNumber(discount.quantity)}</td>
                <td className="py-4 pr-6 text-right text-sm font-semibold text-foreground">
                  {withCurrency(discount.amount)}
                </td>
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={3} className="py-6 text-center text-sm text-muted">
                No discounts applied for the selected period.
              </td>
            </tr>
          )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export const SalesSummaryReport = () => {
  const { t } = useTranslation('reports');
  const db = useDB();
  const branchScope = useReportBranchScope();
  const [orders, setOrders] = useState<Order[]>([]);
  const [orderVoids, setOrderVoids] = useState<OrderVoid[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const filters = useMemo(parseFilters, []);
  const subtitle = filters.startDate && filters.endDate ? `${filters.startDate} to ${filters.endDate}` : undefined;

  useEffect(() => {
    if (!branchScope.ready) return;

    const fetchData = async () => {
      try {
        setLoading(true);
        setError(null);

        const opts = {...filters, branchIds: branchScope.branchIds};
        const [paidOrders, voids] = await Promise.all([
          fetchPaidOrders(db, {...opts, fetches: SALES_SUMMARY_FETCHES}),
          fetchOrderVoids(db, opts),
        ]);

        setOrders(paidOrders);
        setOrderVoids(voids);
      } catch (err) {
        console.error("Failed to load sales summary report", err);
        setError(err instanceof Error ? err.message : t('errors.unableToLoad'));
      } finally {
        setLoading(false);
      }
    };

    void fetchData();
  }, [branchScope.ready, branchScope.branchIds, filters.startDate, filters.endDate]);

  if (loading || !branchScope.ready) {
    return (
      <ReportsLayout title={t('titles.salesSummary')} subtitle={subtitle}>
        <div className="py-12 text-center text-muted">{t('loading.salesSummary')}</div>
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
      <BranchBreakdown
        enabled={branchScope.isByBranch}
        rows={orders}
        labels={branchScope.branchLabels}
        branchOrder={branchScope.branchOrder}
        renderSection={({rows, key}) => {
          const voidsForSection =
            !branchScope.isByBranch || key === "total" || key === "combined"
              ? orderVoids
              : orderVoids.filter((v) => getRowBranchId(v) === key);
          const summary = aggregateSalesSummary(rows, voidsForSection);
          return <SummaryTables key={key} summary={summary} t={t} />;
        }}
      />
    </ReportsLayout>
  );
};
