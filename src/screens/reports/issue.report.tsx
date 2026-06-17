import {useEffect, useMemo, useRef, useState} from "react";
import { useTranslation } from 'react-i18next';
import {ReportsLayout} from "@/screens/partials/reports.layout.tsx";
import {useDB} from "@/api/db/db.ts";
import {Tables} from "@/api/db/tables.ts";
import {InventoryIssue} from "@/api/model/inventory_issue.ts";
import {formatNumber, withCurrency} from "@/lib/utils.ts";
import { toLuxonDateTime } from "@/lib/datetime.ts";

const safeNumber = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
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

interface ReportFilters {
  startDate?: string | null;
  endDate?: string | null;
  storeIds: string[];
  itemIds: string[];
  kitchenIds: string[];
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
    storeIds: parseMulti('stores'),
    itemIds: parseMulti('items'),
    kitchenIds: parseMulti('kitchens'),
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
        const params: Record<string, string | string[]> = {};

        if (filters.startDate) {
          conditions.push(`time::format(created_at, "${import.meta.env.VITE_DB_DATABASE_FORMAT}") >= $startDate`);
          params.startDate = filters.startDate;
        }

        if (filters.endDate) {
          conditions.push(`time::format(created_at, "${import.meta.env.VITE_DB_DATABASE_FORMAT}") <= $endDate`);
          params.endDate = filters.endDate;
        }

        const query = `
          SELECT * FROM ${Tables.inventory_issues}
          ${conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''}
          ORDER BY created_at ASC
          FETCH items, items.item, items.item.category, created_by, kitchen, issued_to, store
        `;

        const result: any = await queryRef.current(query, params);
        let allIssues = (result?.[0]?.result ?? result?.[0] ?? []) as InventoryIssue[];

        // Apply client-side filters
        if (filters.storeIds.length > 0) {
          allIssues = allIssues.filter(issue => {
            const storeId = recordToString(issue.store?.id ?? issue.store);
            return filters.storeIds.includes(storeId);
          });
        }

        if (filters.itemIds.length > 0) {
          allIssues = allIssues.filter(issue => {
            return issue.items?.some(item => {
              const itemId = recordToString(item.item?.id ?? item.item);
              return filters.itemIds.includes(itemId);
            });
          });
        }

        if (filters.kitchenIds.length > 0) {
          allIssues = allIssues.filter(issue => {
            const kitchenId = recordToString(issue.kitchen?.id ?? issue.kitchen);
            return filters.kitchenIds.includes(kitchenId);
          });
        }

        if (filters.userIds.length > 0) {
          allIssues = allIssues.filter(issue => {
            const userId = recordToString(issue.created_by?.id ?? issue.created_by);
            return filters.userIds.includes(userId);
          });
        }

        setIssues(allIssues);
      } catch (err) {
        console.error('Failed to load issue report:', err);
        setError(err instanceof Error ? err.message : t('errors.unableToLoad'));
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [filters.startDate, filters.endDate, filters.storeIds, filters.itemIds, filters.kitchenIds, filters.userIds]);

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
        <div className="py-12 text-center text-neutral-500">{t('loading.issue')}</div>
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
          <div className="bg-neutral-50 p-4 rounded-lg">
            <p className="text-sm text-neutral-600">Total Issues</p>
            <p className="text-2xl font-bold text-neutral-900">{formatNumber(issues.length)}</p>
          </div>
          <div className="bg-neutral-50 p-4 rounded-lg">
            <p className="text-sm text-neutral-600">Total Items</p>
            <p className="text-2xl font-bold text-neutral-900">{formatNumber(totals.totalItems)}</p>
          </div>
          <div className="bg-neutral-50 p-4 rounded-lg">
            <p className="text-sm text-neutral-600">Total Amount</p>
            <p className="text-2xl font-bold text-neutral-900">{withCurrency(totals.totalAmount)}</p>
          </div>
        </div>

        {/* Detailed table */}
        <div className="overflow-hidden rounded-lg border border-neutral-200">
          <h3 className="bg-neutral-100 px-6 py-3 text-sm font-semibold text-neutral-700">{t('labels.issueDetails')}</h3>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-neutral-200">
              <thead className="bg-neutral-50">
                <tr>
                  <th className="py-3 pl-6 pr-3 text-left text-xs font-semibold text-neutral-700">{t('columns.date')}</th>
                  <th className="py-3 px-3 text-left text-xs font-semibold text-neutral-700">{t('columns.invoice')}</th>
                  <th className="py-3 px-3 text-left text-xs font-semibold text-neutral-700">{t('filters.kitchen')}</th>
                  <th className="py-3 px-3 text-left text-xs font-semibold text-neutral-700">{t('filters.store')}</th>
                  <th className="py-3 px-3 text-left text-xs font-semibold text-neutral-700">{t('filters.item')}</th>
                  <th className="py-3 px-3 text-right text-xs font-semibold text-neutral-700">{t('columns.quantity')}</th>
                  <th className="py-3 px-3 text-right text-xs font-semibold text-neutral-700">{t('columns.price')}</th>
                  <th className="py-3 px-3 text-right text-xs font-semibold text-neutral-700">{t('columns.amount')}</th>
                  <th className="py-3 px-3 text-left text-xs font-semibold text-neutral-700">{t('columns.issuedTo')}</th>
                  <th className="py-3 px-3 text-left text-xs font-semibold text-neutral-700">{t('columns.createdBy')}</th>
                  <th className="py-3 pr-6 text-left text-xs font-semibold text-neutral-700">{t('columns.comments')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100 bg-white">
                {issues.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="py-6 text-center text-sm text-neutral-500">
                      No issues found for the selected filters
                    </td>
                  </tr>
                ) : (
                  issues.flatMap(issue => {
                    const date = toLuxonDateTime(issue.created_at);
                    const dateStr = date.toFormat(import.meta.env.VITE_DATE_FORMAT);
                    const kitchenName = issue.kitchen?.name || 'N/A';
                    const storeName = issue.store?.name || 'N/A';
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
                          <td className="py-3 pl-6 pr-3 text-sm text-neutral-900">{dateStr}</td>
                          <td className="py-3 px-3 text-sm text-neutral-700">{issue.invoice_number || 'N/A'}</td>
                          <td className="py-3 px-3 text-sm text-neutral-700">{kitchenName}</td>
                          <td className="py-3 px-3 text-sm text-neutral-700">{storeName}</td>
                          <td className="py-3 px-3 text-sm text-neutral-700">{itemName}</td>
                          <td className="py-3 px-3 text-right text-sm text-neutral-700">{formatNumber(quantity)}</td>
                          <td className="py-3 px-3 text-right text-sm text-neutral-700">{withCurrency(price)}</td>
                          <td className="py-3 px-3 text-right text-sm font-semibold text-neutral-900">{withCurrency(amount)}</td>
                          <td className="py-3 px-3 text-sm text-neutral-700">{issuedToName}</td>
                          <td className="py-3 px-3 text-sm text-neutral-700">{createdByName}</td>
                          <td className="py-3 pr-6 text-sm text-neutral-700">{item.comments || '-'}</td>
                        </tr>
                      );
                    }) || [];
                  })
                )}
              </tbody>
              {issues.length > 0 && (
                <tfoot className="bg-neutral-50">
                  <tr>
                    <td colSpan={5} className="py-3 pl-6 pr-3 text-sm font-semibold text-neutral-900">{t('columns.total')}</td>
                    <td className="py-3 px-3 text-right text-sm font-bold text-neutral-900">
                      {formatNumber(totals.totalQuantity)}
                    </td>
                    <td colSpan={1}></td>
                    <td className="py-3 px-3 text-right text-sm font-bold text-neutral-900">
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

