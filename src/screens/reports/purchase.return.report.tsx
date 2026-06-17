import {useEffect, useMemo, useRef, useState} from "react";
import { useTranslation } from 'react-i18next';
import {ReportsLayout} from "@/screens/partials/reports.layout.tsx";
import {useDB} from "@/api/db/db.ts";
import {Tables} from "@/api/db/tables.ts";
import {InventoryPurchaseReturn} from "@/api/model/inventory_purchase_return.ts";
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
  supplierIds: string[];
  storeIds: string[];
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
    supplierIds: parseMulti('suppliers'),
    storeIds: parseMulti('stores'),
    itemIds: parseMulti('items'),
    userIds: parseMulti('users'),
  };
};

export const PurchaseReturnReport = () => {
  const { t } = useTranslation('reports');
  const db = useDB();
  const queryRef = useRef(db.query);
  const [purchaseReturns, setPurchaseReturns] = useState<InventoryPurchaseReturn[]>([]);
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
          SELECT * FROM ${Tables.inventory_purchase_returns}
          ${conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''}
          ORDER BY created_at ASC
          FETCH items, items.item, items.item.category, created_by, store, items.supplier, purchase
        `;

        const result: any = await queryRef.current(query, params);
        let allPurchaseReturns = (result?.[0]?.result ?? result?.[0] ?? []) as InventoryPurchaseReturn[];

        // Apply client-side filters
        if (filters.supplierIds.length > 0) {
          allPurchaseReturns = allPurchaseReturns.filter(purchaseReturn => {
            return purchaseReturn.items?.some(item => {
              const supplierId = recordToString(item.supplier?.id ?? item.supplier);
              return filters.supplierIds.includes(supplierId);
            });
          });
        }

        if (filters.storeIds.length > 0) {
          allPurchaseReturns = allPurchaseReturns.filter(purchaseReturn => {
            const storeId = recordToString(purchaseReturn.store?.id ?? purchaseReturn.store);
            return filters.storeIds.includes(storeId);
          });
        }

        if (filters.itemIds.length > 0) {
          allPurchaseReturns = allPurchaseReturns.filter(purchaseReturn => {
            return purchaseReturn.items?.some(item => {
              const itemId = recordToString(item.item?.id ?? item.item);
              return filters.itemIds.includes(itemId);
            });
          });
        }

        if (filters.userIds.length > 0) {
          allPurchaseReturns = allPurchaseReturns.filter(purchaseReturn => {
            const userId = recordToString(purchaseReturn.created_by?.id ?? purchaseReturn.created_by);
            return filters.userIds.includes(userId);
          });
        }

        setPurchaseReturns(allPurchaseReturns);
      } catch (err) {
        console.error('Failed to load purchase return report:', err);
        setError(err instanceof Error ? err.message : t('errors.unableToLoad'));
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [filters.startDate, filters.endDate, filters.supplierIds, filters.storeIds, filters.itemIds, filters.userIds]);

  // Calculate totals
  const totals = useMemo(() => {
    let totalQuantity = 0;
    let totalAmount = 0;
    let totalItems = 0;

    purchaseReturns.forEach(purchaseReturn => {
      purchaseReturn.items?.forEach(item => {
        totalQuantity += safeNumber(item.quantity);
        totalAmount += safeNumber(item.price || 0) * safeNumber(item.quantity);
        totalItems += 1;
      });
    });

    return { totalQuantity, totalAmount, totalItems };
  }, [purchaseReturns]);

  if (loading) {
    return (
      <ReportsLayout title={t('titles.purchaseReturn')} subtitle={subtitle}>
        <div className="py-12 text-center text-neutral-500">{t('loading.purchaseReturn')}</div>
      </ReportsLayout>
    );
  }

  if (error) {
    return (
      <ReportsLayout title={t('titles.purchaseReturn')} subtitle={subtitle}>
        <div className="py-12 text-center text-red-600">{t('errors.failedToLoad', { error })}</div>
      </ReportsLayout>
    );
  }

  return (
    <ReportsLayout
      title={t('titles.purchaseReturn')}
      subtitle={subtitle}
    >
      <div className="space-y-8">
        {/* Summary */}
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-neutral-50 p-4 rounded-lg">
            <p className="text-sm text-neutral-600">Total Returns</p>
            <p className="text-2xl font-bold text-neutral-900">{formatNumber(purchaseReturns.length)}</p>
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
          <h3 className="bg-neutral-100 px-6 py-3 text-sm font-semibold text-neutral-700">Purchase Return Details</h3>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-neutral-200">
              <thead className="bg-neutral-50">
                <tr>
                  <th className="py-3 pl-6 pr-3 text-left text-xs font-semibold text-neutral-700">{t('columns.date')}</th>
                  <th className="py-3 px-3 text-left text-xs font-semibold text-neutral-700">{t('columns.invoice')}</th>
                  <th className="py-3 px-3 text-left text-xs font-semibold text-neutral-700">{t('filters.supplier')}</th>
                  <th className="py-3 px-3 text-left text-xs font-semibold text-neutral-700">{t('filters.store')}</th>
                  <th className="py-3 px-3 text-left text-xs font-semibold text-neutral-700">{t('filters.item')}</th>
                  <th className="py-3 px-3 text-right text-xs font-semibold text-neutral-700">{t('columns.quantity')}</th>
                  <th className="py-3 px-3 text-right text-xs font-semibold text-neutral-700">{t('columns.price')}</th>
                  <th className="py-3 px-3 text-right text-xs font-semibold text-neutral-700">{t('columns.amount')}</th>
                  <th className="py-3 px-3 text-left text-xs font-semibold text-neutral-700">{t('columns.createdBy')}</th>
                  <th className="py-3 pr-6 text-left text-xs font-semibold text-neutral-700">{t('columns.comments')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100 bg-white">
                {purchaseReturns.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="py-6 text-center text-sm text-neutral-500">
                      No purchase returns found for the selected filters
                    </td>
                  </tr>
                ) : (
                  purchaseReturns.flatMap(purchaseReturn => {
                    const date = toLuxonDateTime(purchaseReturn.created_at);
                    const dateStr = date.toFormat(import.meta.env.VITE_DATE_FORMAT);
                    const storeName = purchaseReturn.store?.name || 'N/A';
                    const createdByName = purchaseReturn.created_by
                      ? `${purchaseReturn.created_by.first_name ?? ''} ${purchaseReturn.created_by.last_name ?? ''}`.trim() || purchaseReturn.created_by.login || 'Unknown'
                      : 'Unknown';

                    return purchaseReturn.items?.map((item, index) => {
                      const itemName = item.item?.name || 'Unknown';
                      const supplierName = item.supplier?.name || 'N/A';
                      const quantity = safeNumber(item.quantity);
                      const price = safeNumber(item.price || 0);
                      const amount = quantity * price;

                      return (
                        <tr key={`${purchaseReturn.id}-${index}`}>
                          <td className="py-3 pl-6 pr-3 text-sm text-neutral-900">{dateStr}</td>
                          <td className="py-3 px-3 text-sm text-neutral-700">{purchaseReturn.invoice_number || 'N/A'}</td>
                          <td className="py-3 px-3 text-sm text-neutral-700">{supplierName}</td>
                          <td className="py-3 px-3 text-sm text-neutral-700">{storeName}</td>
                          <td className="py-3 px-3 text-sm text-neutral-700">{itemName}</td>
                          <td className="py-3 px-3 text-right text-sm text-neutral-700">{formatNumber(quantity)}</td>
                          <td className="py-3 px-3 text-right text-sm text-neutral-700">{withCurrency(price)}</td>
                          <td className="py-3 px-3 text-right text-sm font-semibold text-neutral-900">{withCurrency(amount)}</td>
                          <td className="py-3 px-3 text-sm text-neutral-700">{createdByName}</td>
                          <td className="py-3 pr-6 text-sm text-neutral-700">{item.comments || '-'}</td>
                        </tr>
                      );
                    }) || [];
                  })
                )}
              </tbody>
              {purchaseReturns.length > 0 && (
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

