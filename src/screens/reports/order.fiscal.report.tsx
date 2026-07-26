import {useEffect, useMemo, useRef, useState} from "react";
import {useTranslation} from 'react-i18next';
import {ReportsLayout} from "@/screens/partials/reports.layout.tsx";
import {useDB} from "@/api/db/db.ts";
import {Tables} from "@/api/db/tables.ts";
import {OrderFiscalSubmission} from "@/api/model/order_fiscal_submission.ts";
import {Order} from "@/api/model/order.ts";
import {formatNumber, withCurrency} from "@/lib/utils.ts";
import {toLuxonDateTime} from "@/lib/datetime.ts";
import {getOrderSettlementFigures} from "@/lib/order.ts";
import {getOrderTaxAmount, getOrderTaxBreakdown} from "@/lib/tax-calculator.ts";
import {
  buildCreatedAtDateConditions,
  buildStringInsideCondition,
} from "@/api/reports/shared/query.ts";

/** Friendly labels for known fiscal provider record ids. */
const PROVIDER_LABELS: Record<string, string> = {
  'provider:fbr': 'FBR',
  'provider:pra': 'PRA',
};

const safeNumber = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const providerLabel = (providerId?: string | null): string => {
  if (!providerId) return '—';
  return PROVIDER_LABELS[providerId] ?? providerId.replace(/^provider:/, '').toUpperCase();
};

const getOrder = (submission: OrderFiscalSubmission): Order | undefined =>
  submission.order && typeof submission.order === 'object' ? (submission.order as Order) : undefined;

const cashierName = (order?: Order): string => {
  const cashier = order?.cashier;
  if (!cashier) return '—';
  return `${cashier.first_name ?? ''} ${cashier.last_name ?? ''}`.trim() || cashier.login || '—';
};

const formatTaxPercent = (order?: Order): string => {
  if (!order) return '—';
  const breakdown = getOrderTaxBreakdown(order);
  if (breakdown.length === 0) {
    const legacyRate = safeNumber((order.tax as any)?.rate);
    return legacyRate > 0 ? `${legacyRate}%` : '—';
  }
  if (breakdown.length === 1) {
    return `${breakdown[0].rate}%`;
  }
  return breakdown.map(entry => `${entry.name} ${entry.rate}%`).join(', ');
};

interface ReportFilters {
  startDate?: string | null;
  endDate?: string | null;
  providerIds: string[];
  statuses: string[];
}

const parseFilters = (): ReportFilters => {
  const params = new URLSearchParams(window.location.search);
  const parseMulti = (name: string) =>
    [...params.getAll(`${name}[]`), ...params.getAll(name)].filter(Boolean) as string[];

  return {
    startDate: params.get('start'),
    endDate: params.get('end'),
    providerIds: parseMulti('providers'),
    statuses: parseMulti('statuses'),
  };
};

const statusBadgeClass = (status: string): string => {
  switch (status) {
    case 'completed':
      return 'bg-success-100 text-success-700';
    case 'failed':
      return 'bg-danger-100 text-danger-700';
    default:
      return 'bg-neutral-100 text-neutral-600';
  }
};

export const OrderFiscalReport = () => {
  const {t} = useTranslation('reports');
  const db = useDB();
  const queryRef = useRef(db.query);
  const [submissions, setSubmissions] = useState<OrderFiscalSubmission[]>([]);
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

        const conditions: string[] = [];
        const params: Record<string, any> = {};

        const dateFilter = buildCreatedAtDateConditions(
          {startDate: filters.startDate ?? undefined, endDate: filters.endDate ?? undefined},
          'submitted_at',
        );
        conditions.push(...dateFilter.conditions);
        Object.assign(params, dateFilter.params);

        const providerFilter = buildStringInsideCondition('provider_id', filters.providerIds, 'providerIds');
        if (providerFilter.condition) {
          conditions.push(providerFilter.condition);
          Object.assign(params, providerFilter.params);
        }

        const statusFilter = buildStringInsideCondition('status', filters.statuses, 'statuses');
        if (statusFilter.condition) {
          conditions.push(statusFilter.condition);
          Object.assign(params, statusFilter.params);
        }

        const query = `
          SELECT * FROM ${Tables.integration_order_fiscals}
          ${conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''}
          ORDER BY submitted_at DESC
          FETCH order, order.cashier, order.tax, order.extras, order.coupon,
            order.order_taxes, order.order_taxes.tax, order.order_discounts, order.order_discounts.discount,
            order.items, order.items.taxes, order.items.tax_mode, order.items.modifiers
        `;

        const result: any = await queryRef.current(query, params);
        setSubmissions((result?.[0] ?? []) as OrderFiscalSubmission[]);
      } catch (err) {
        console.error('Failed to load order fiscal report:', err);
        setError(err instanceof Error ? err.message : t('errors.unableToLoad'));
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [filters.startDate, filters.endDate, filters.providerIds, filters.statuses]);

  const statusLabel = (status: string): string => {
    switch (status) {
      case 'completed':
        return t('orderFiscal.statusCompleted');
      case 'failed':
        return t('orderFiscal.statusFailed');
      case 'skipped':
        return t('orderFiscal.statusSkipped');
      default:
        return status;
    }
  };

  const byProvider = useMemo(() => {
    const map = new Map<string, {total: number; completed: number; failed: number; skipped: number}>();
    submissions.forEach(sub => {
      const key = providerLabel(sub.provider_id);
      const existing = map.get(key) || {total: 0, completed: 0, failed: 0, skipped: 0};
      existing.total += 1;
      if (sub.status === 'completed') existing.completed += 1;
      else if (sub.status === 'failed') existing.failed += 1;
      else existing.skipped += 1;
      map.set(key, existing);
    });
    return Array.from(map.entries())
      .map(([provider, data]) => ({provider, ...data}))
      .sort((a, b) => b.total - a.total);
  }, [submissions]);

  const byStatus = useMemo(() => {
    const map = new Map<string, number>();
    submissions.forEach(sub => {
      map.set(sub.status, (map.get(sub.status) || 0) + 1);
    });
    return Array.from(map.entries())
      .map(([status, count]) => ({status, count}))
      .sort((a, b) => b.count - a.count);
  }, [submissions]);

  const detailTotals = useMemo(() => {
    return submissions.reduce(
      (acc, sub) => {
        const order = getOrder(sub);
        if (!order) return acc;
        const figures = getOrderSettlementFigures(order);
        acc.tax += figures.tax;
        acc.total += figures.grandTotalDue;
        return acc;
      },
      {tax: 0, total: 0},
    );
  }, [submissions]);

  if (loading) {
    return (
      <ReportsLayout title={t('titles.orderFiscal')} subtitle={subtitle}>
        <div className="py-12 text-center text-neutral-500">{t('loading.orderFiscal')}</div>
      </ReportsLayout>
    );
  }

  if (error) {
    return (
      <ReportsLayout title={t('titles.orderFiscal')} subtitle={subtitle}>
        <div className="py-12 text-center text-red-600">{t('errors.failedToLoad', {error})}</div>
      </ReportsLayout>
    );
  }

  return (
    <ReportsLayout title={t('titles.orderFiscal')} subtitle={subtitle}>
      <div className="space-y-8">
        {/* Summary sections */}
        <div className="grid grid-cols-2 gap-4">
          {/* By provider */}
          <div className="overflow-hidden rounded-lg border border-neutral-200">
            <h3 className="bg-neutral-100 px-6 py-3 text-sm font-semibold text-neutral-700">{t('orderFiscal.byProvider')}</h3>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-neutral-200">
                <thead className="bg-neutral-50">
                  <tr>
                    <th className="py-3 pl-6 pr-3 text-left text-xs font-semibold text-neutral-700">{t('orderFiscal.provider')}</th>
                    <th className="py-3 px-3 text-right text-xs font-semibold text-neutral-700">{t('metrics.count')}</th>
                    <th className="py-3 px-3 text-right text-xs font-semibold text-neutral-700">{t('orderFiscal.statusCompleted')}</th>
                    <th className="py-3 px-3 text-right text-xs font-semibold text-neutral-700">{t('orderFiscal.statusFailed')}</th>
                    <th className="py-3 pr-6 text-right text-xs font-semibold text-neutral-700">{t('orderFiscal.statusSkipped')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100 bg-white">
                  {byProvider.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-6 text-center text-sm text-neutral-500">{t('orderFiscal.noRecords')}</td>
                    </tr>
                  ) : (
                    byProvider.map(item => (
                      <tr key={item.provider}>
                        <td className="py-3 pl-6 pr-3 text-sm font-medium text-neutral-900">{item.provider}</td>
                        <td className="py-3 px-3 text-right text-sm text-neutral-700">{formatNumber(item.total)}</td>
                        <td className="py-3 px-3 text-right text-sm text-success-700">{formatNumber(item.completed)}</td>
                        <td className="py-3 px-3 text-right text-sm text-danger-700">{formatNumber(item.failed)}</td>
                        <td className="py-3 pr-6 text-right text-sm text-neutral-600">{formatNumber(item.skipped)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* By status */}
          <div className="overflow-hidden rounded-lg border border-neutral-200">
            <h3 className="bg-neutral-100 px-6 py-3 text-sm font-semibold text-neutral-700">{t('orderFiscal.byStatus')}</h3>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-neutral-200">
                <thead className="bg-neutral-50">
                  <tr>
                    <th className="py-3 pl-6 pr-3 text-left text-xs font-semibold text-neutral-700">{t('columns.status')}</th>
                    <th className="py-3 pr-6 text-right text-xs font-semibold text-neutral-700">{t('metrics.count')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100 bg-white">
                  {byStatus.length === 0 ? (
                    <tr>
                      <td colSpan={2} className="py-6 text-center text-sm text-neutral-500">{t('orderFiscal.noRecords')}</td>
                    </tr>
                  ) : (
                    byStatus.map(item => (
                      <tr key={item.status}>
                        <td className="py-3 pl-6 pr-3 text-sm font-medium text-neutral-900">
                          <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${statusBadgeClass(item.status)}`}>
                            {statusLabel(item.status)}
                          </span>
                        </td>
                        <td className="py-3 pr-6 text-right text-sm text-neutral-700">{formatNumber(item.count)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Detail table */}
        <div className="overflow-hidden rounded-lg border border-neutral-200">
          <h3 className="bg-neutral-100 px-6 py-3 text-sm font-semibold text-neutral-700">{t('orderFiscal.detail')}</h3>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-neutral-200">
              <thead className="bg-neutral-50">
                <tr>
                  <th className="py-3 pl-6 pr-3 text-left text-xs font-semibold text-neutral-700">{t('columns.date')}</th>
                  <th className="py-3 px-3 text-left text-xs font-semibold text-neutral-700">{t('common:actions.time')}</th>
                  <th className="py-3 px-3 text-right text-xs font-semibold text-neutral-700">{t('orderFiscal.order')}</th>
                  <th className="py-3 px-3 text-left text-xs font-semibold text-neutral-700">{t('orderFiscal.provider')}</th>
                  <th className="py-3 px-3 text-left text-xs font-semibold text-neutral-700">{t('orderFiscal.fiscalInvoice')}</th>
                  <th className="py-3 px-3 text-left text-xs font-semibold text-neutral-700">{t('columns.status')}</th>
                  <th className="py-3 px-3 text-center text-xs font-semibold text-neutral-700">{t('orderFiscal.qr')}</th>
                  <th className="py-3 px-3 text-right text-xs font-semibold text-neutral-700">{t('columns.taxPercent')}</th>
                  <th className="py-3 px-3 text-right text-xs font-semibold text-neutral-700">{t('columns.tax')}</th>
                  <th className="py-3 px-3 text-right text-xs font-semibold text-neutral-700">{t('columns.grandTotal')}</th>
                  <th className="py-3 px-3 text-left text-xs font-semibold text-neutral-700">{t('metrics.cashier')}</th>
                  <th className="py-3 pr-6 text-left text-xs font-semibold text-neutral-700">{t('orderFiscal.error')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100 bg-white">
                {submissions.length === 0 ? (
                  <tr>
                    <td colSpan={12} className="py-6 text-center text-sm text-neutral-500">{t('orderFiscal.noRecords')}</td>
                  </tr>
                ) : (
                  submissions.map(sub => {
                    const order = getOrder(sub);
                    const figures = order ? getOrderSettlementFigures(order) : null;
                    const submittedAt = sub.submitted_at ?? sub.created_at;
                    const date = submittedAt ? toLuxonDateTime(submittedAt) : null;
                    const dateStr = date ? date.toFormat(import.meta.env.VITE_DATE_FORMAT) : '—';
                    const timeStr = date ? date.toFormat(import.meta.env.VITE_TIME_FORMAT) : '—';
                    return (
                      <tr key={String(sub.id)}>
                        <td className="py-3 pl-6 pr-3 text-sm text-neutral-900">{dateStr}</td>
                        <td className="py-3 px-3 text-sm text-neutral-700">{timeStr}</td>
                        <td className="py-3 px-3 text-right text-sm text-neutral-700">{order?.invoice_number ?? '—'}</td>
                        <td className="py-3 px-3 text-sm text-neutral-700">{providerLabel(sub.provider_id)}</td>
                        <td className="py-3 px-3 text-sm text-neutral-700">{sub.invoice_number || '—'}</td>
                        <td className="py-3 px-3 text-sm">
                          <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${statusBadgeClass(sub.status)}`}>
                            {statusLabel(sub.status)}
                          </span>
                        </td>
                        <td className="py-3 px-3 text-center text-sm text-neutral-700">
                          {sub.qrcode ? t('orderFiscal.available') : t('orderFiscal.notAvailable')}
                        </td>
                        <td className="py-3 px-3 text-right text-sm text-neutral-700">{formatTaxPercent(order)}</td>
                        <td className="py-3 px-3 text-right text-sm text-neutral-700">
                          {order ? withCurrency(getOrderTaxAmount(order)) : '—'}
                        </td>
                        <td className="py-3 px-3 text-right text-sm font-semibold text-neutral-900">
                          {figures ? withCurrency(figures.grandTotalDue) : '—'}
                        </td>
                        <td className="py-3 px-3 text-sm text-neutral-700">{cashierName(order)}</td>
                        <td className="py-3 pr-6 text-sm text-danger-600">{sub.error || '—'}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
              {submissions.length > 0 && (
                <tfoot className="bg-neutral-50">
                  <tr>
                    <td colSpan={2} className="py-3 pl-6 pr-3 text-sm font-semibold text-neutral-900">{t('columns.total')}</td>
                    <td className="py-3 px-3 text-right text-sm font-bold text-neutral-900">{formatNumber(submissions.length)}</td>
                    <td colSpan={5}></td>
                    <td className="py-3 px-3 text-right text-sm font-bold text-neutral-900">{withCurrency(detailTotals.tax)}</td>
                    <td className="py-3 px-3 text-right text-sm font-bold text-neutral-900">{withCurrency(detailTotals.total)}</td>
                    <td colSpan={2}></td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      </div>
    </ReportsLayout>
  );
};
