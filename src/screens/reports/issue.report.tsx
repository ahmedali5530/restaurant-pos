import {useEffect, useMemo, useRef, useState} from "react";
import { useTranslation } from 'react-i18next';
import {ReportsLayout} from "@/screens/partials/reports.layout.tsx";
import {useDB} from "@/api/db/db.ts";
import {Tables} from "@/api/db/tables.ts";
import {InventoryIssue} from "@/api/model/inventory_issue.ts";
import {formatNumber, withCurrency} from "@/lib/utils.ts";
import { toLuxonDateTime } from "@/lib/datetime.ts";
import {
  buildLocationInsideCondition,
  buildNestedRecordAnyCondition,
  buildRecordInsideCondition,
} from "@/api/reports/shared/query.ts";
import {inventoryPrintUrl} from "@/routes/posr.ts";

const safeNumber = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

interface ReportFilters {
  startDate?: string | null;
  endDate?: string | null;
  locationIds: string[];
  itemIds: string[];
  userIds: string[];
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
    startDate: params.get('start') || params.get('start'),
    endDate: params.get('end') || params.get('end'),
    locationIds: parseMulti('locations'),
    itemIds: parseMulti('items'),
    userIds: parseMulti('users'),
  };
};

export const IssueReport = () => {
  const { t } = useTranslation('reports');
  const db = useDB();
  const queryRef = useRef(db.query);
  const [issues, setIssues] = useState<InventoryIssue[]>([]);
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

        if (filters.startDate) {
          conditions.push(`time::format(created_at, "${import.meta.env.VITE_DB_DATABASE_FORMAT}") >= $startDate`);
          params.startDate = filters.startDate;
        }

        if (filters.endDate) {
          conditions.push(`time::format(created_at, "${import.meta.env.VITE_DB_DATABASE_FORMAT}") <= $endDate`);
          params.endDate = filters.endDate;
        }

        const locationFilter = buildLocationInsideCondition(filters.locationIds, 'locationIds');
        if (locationFilter.condition) {
          conditions.push(locationFilter.condition);
          Object.assign(params, locationFilter.params);
        }

        const userFilter = buildRecordInsideCondition('created_by', filters.userIds, 'userIds');
        if (userFilter.condition) {
          conditions.push(userFilter.condition);
          Object.assign(params, userFilter.params);
        }

        const itemFilter = buildNestedRecordAnyCondition('items.item', filters.itemIds, 'item');
        if (itemFilter.condition) {
          conditions.push(itemFilter.condition);
          Object.assign(params, itemFilter.params);
        }

        const query = `
          SELECT * FROM ${Tables.inventory_issues}
          ${conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''}
          ORDER BY created_at ASC
          FETCH items, items.item, items.item.category, created_by, issued_to, location
        `;

        const result: any = await queryRef.current(query, params);
        setIssues((result?.[0]?.result ?? result?.[0] ?? []) as InventoryIssue[]);
      } catch (err) {
        console.error('Failed to load issue report:', err);
        setError(err instanceof Error ? err.message : t('errors.unableToLoad'));
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [filters.startDate, filters.endDate, filters.locationIds, filters.itemIds, filters.userIds]);

  // Calculate totals
  const totals = useMemo(() => {
    let totalQuantity = 0;
    let totalAmount = 0;
    let totalItems = 0;

    issues.forEach(issue => {
      issue.items?.forEach(item => {
        totalQuantity += safeNumber(item.quantity);
        totalAmount += safeNumber(item.price) * safeNumber(item.quantity);
        totalItems += 1;
      });
    });

    return { totalQuantity, totalAmount, totalItems };
  }, [issues]);

  if (loading) {
    return (
      <ReportsLayout title={t('titles.issue')} subtitle={subtitle}>
        <div className="py-12 text-center text-muted">{t('loading.issue')}</div>
      </ReportsLayout>
    );
  }

  if (error) {
    return (
      <ReportsLayout title={t('titles.issue')} subtitle={subtitle}>
        <div className="py-12 text-center text-red-600">{t('errors.failedToLoad', { error })}</div>
      </ReportsLayout>
    );
  }

  return (
    <ReportsLayout
      title={t('titles.issue')}
      subtitle={subtitle}
    >
      <div className="space-y-8">
        {/* Summary */}
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-surface p-4 rounded-lg">
            <p className="text-sm text-muted">Total Issues</p>
            <p className="text-2xl font-bold text-foreground">{formatNumber(issues.length)}</p>
          </div>
          <div className="bg-surface p-4 rounded-lg">
            <p className="text-sm text-muted">Total Items</p>
            <p className="text-2xl font-bold text-foreground">{formatNumber(totals.totalItems)}</p>
          </div>
          <div className="bg-surface p-4 rounded-lg">
            <p className="text-sm text-muted">Total Amount</p>
            <p className="text-2xl font-bold text-foreground">{withCurrency(totals.totalAmount)}</p>
          </div>
        </div>

        {/* Detailed table */}
        <div className="overflow-hidden rounded-lg border border-border">
          <h3 className="bg-surface px-6 py-3 text-sm font-semibold text-foreground">{t('labels.issueDetails')}</h3>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-neutral-200">
              <thead className="bg-surface">
                <tr>
                  <th className="py-3 pl-6 pr-3 text-left text-xs font-semibold text-foreground">{t('columns.date')}</th>
                  <th className="py-3 px-3 text-left text-xs font-semibold text-foreground">{t('columns.invoice')}</th>
                  <th className="py-3 px-3 text-left text-xs font-semibold text-foreground">{t('columns.location')}</th>
                  <th className="py-3 px-3 text-left text-xs font-semibold text-foreground">{t('filters.item')}</th>
                  <th className="py-3 px-3 text-right text-xs font-semibold text-foreground">{t('columns.quantity')}</th>
                  <th className="py-3 px-3 text-right text-xs font-semibold text-foreground">{t('columns.price')}</th>
                  <th className="py-3 px-3 text-right text-xs font-semibold text-foreground">{t('columns.amount')}</th>
                  <th className="py-3 px-3 text-left text-xs font-semibold text-foreground">{t('columns.issuedTo')}</th>
                  <th className="py-3 px-3 text-left text-xs font-semibold text-foreground">{t('columns.createdBy')}</th>
                  <th className="py-3 pr-6 text-left text-xs font-semibold text-foreground">{t('columns.comments')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100 bg-surface-elevated">
                {issues.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="py-6 text-center text-sm text-muted">
                      No issues found for the selected filters
                    </td>
                  </tr>
                ) : (
                  issues.flatMap(issue => {
                    const date = toLuxonDateTime(issue.created_at);
                    const dateStr = date.toFormat(import.meta.env.VITE_DATE_FORMAT);
                    const locationName = issue.location?.name || 'N/A';
                    const issuedToName = issue.issued_to
                      ? `${issue.issued_to.first_name ?? ''} ${issue.issued_to.last_name ?? ''}`.trim() || issue.issued_to.login || 'Unknown'
                      : 'N/A';
                    const createdByName = issue.created_by
                      ? `${issue.created_by.first_name ?? ''} ${issue.created_by.last_name ?? ''}`.trim() || issue.created_by.login || 'Unknown'
                      : 'Unknown';

                    return issue.items?.map((item, index) => {
                      const itemName = item.item?.name || 'Unknown';
                      const quantity = safeNumber(item.quantity);
                      const price = safeNumber(item.price);
                      const amount = quantity * price;

                      return (
                        <tr key={`${issue.id}-${index}`}>
                          <td className="py-3 pl-6 pr-3 text-sm text-foreground">{dateStr}</td>
                          <td className="py-3 px-3 text-sm text-foreground">
                            {issue.id ? (
                              <a
                                className="text-primary-600 underline print:no-underline print:text-foreground"
                                href={inventoryPrintUrl("issue", String(issue.id))}
                                target="_blank"
                                rel="noreferrer"
                              >
                                {issue.invoice_number || 'N/A'}
                              </a>
                            ) : (
                              issue.invoice_number || 'N/A'
                            )}
                          </td>
                          <td className="py-3 px-3 text-sm text-foreground">{locationName}</td>
                          <td className="py-3 px-3 text-sm text-foreground">{itemName}</td>
                          <td className="py-3 px-3 text-right text-sm text-foreground">{formatNumber(quantity)}</td>
                          <td className="py-3 px-3 text-right text-sm text-foreground">{withCurrency(price)}</td>
                          <td className="py-3 px-3 text-right text-sm font-semibold text-foreground">{withCurrency(amount)}</td>
                          <td className="py-3 px-3 text-sm text-foreground">{issuedToName}</td>
                          <td className="py-3 px-3 text-sm text-foreground">{createdByName}</td>
                          <td className="py-3 pr-6 text-sm text-foreground">{item.comments || '-'}</td>
                        </tr>
                      );
                    }) || [];
                  })
                )}
              </tbody>
              {issues.length > 0 && (
                <tfoot className="bg-surface">
                  <tr>
                    <td colSpan={4} className="py-3 pl-6 pr-3 text-sm font-semibold text-foreground">{t('columns.total')}</td>
                    <td className="py-3 px-3 text-right text-sm font-bold text-foreground">
                      {formatNumber(totals.totalQuantity)}
                    </td>
                    <td colSpan={1}></td>
                    <td className="py-3 px-3 text-right text-sm font-bold text-foreground">
                      {withCurrency(totals.totalAmount)}
                    </td>
                    <td colSpan={3}></td>
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

