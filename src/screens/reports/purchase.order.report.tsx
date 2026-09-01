import {useEffect, useMemo, useRef, useState} from "react";
import { useTranslation } from 'react-i18next';
import {ReportsLayout} from "@/screens/partials/reports.layout.tsx";
import {useDB} from "@/api/db/db.ts";
import {Tables} from "@/api/db/tables.ts";
import {InventoryPurchaseOrder} from "@/api/model/inventory_purchase_order.ts";
import {formatNumber, safeNumber, withCurrency} from "@/lib/utils.ts";
import { toLuxonDateTime } from "@/lib/datetime.ts";
import {
  buildNestedRecordAnyCondition,
  buildRecordInsideCondition,
  buildStringInsideCondition,
} from "@/api/reports/shared/query.ts";
import {purchaseOrderListTotal} from "@/lib/inventory/document.list.total.ts";
import {resolveInventoryLineUnitCost, lineAmount} from "@/lib/inventory/line.cost.ts";
import {inventoryPrintUrl} from "@/routes/posr.ts";

interface ReportFilters {
  startDate?: string | null;
  endDate?: string | null;
  supplierIds: string[];
  itemIds: string[];
  userIds: string[];
  statuses: string[];
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
    startDate: params.get('start') || null,
    endDate: params.get('end') || null,
    supplierIds: parseMulti('suppliers'),
    itemIds: parseMulti('items'),
    userIds: parseMulti('users'),
    statuses: parseMulti('statuses'),
  };
};

export const PurchaseOrderReport = () => {
  const { t } = useTranslation('reports');
  const db = useDB();
  const queryRef = useRef(db.query);
  const [orders, setOrders] = useState<InventoryPurchaseOrder[]>([]);
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

        const statusFilter = buildStringInsideCondition('status', filters.statuses, 'statuses');
        if (statusFilter.condition) {
          conditions.push(statusFilter.condition);
          Object.assign(params, statusFilter.params);
        }

        const supplierFilter = buildRecordInsideCondition('supplier', filters.supplierIds, 'supplierIds');
        if (supplierFilter.condition) {
          conditions.push(supplierFilter.condition);
          Object.assign(params, supplierFilter.params);
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
          SELECT * FROM ${Tables.inventory_purchase_orders}
          ${conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''}
          ORDER BY created_at ASC
          FETCH items, items.item, created_by, supplier, approved_by, submitted_by
        `;

        const result: any = await queryRef.current(query, params);
        setOrders((result?.[0]?.result ?? result?.[0] ?? []) as InventoryPurchaseOrder[]);
      } catch (err) {
        console.error('Failed to load purchase order report:', err);
        setError(err instanceof Error ? err.message : t('errors.unableToLoad'));
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [filters.startDate, filters.endDate, filters.supplierIds, filters.itemIds, filters.userIds, filters.statuses]);

  const totals = useMemo(() => {
    let totalQuantity = 0;
    let totalAmount = 0;
    let totalItems = 0;

    orders.forEach(order => {
      totalAmount += purchaseOrderListTotal(order.items);
      order.items?.forEach(item => {
        totalQuantity += safeNumber(item.quantity);
        totalItems += 1;
      });
    });

    return {
      totalQuantity,
      totalAmount,
      totalItems,
    };
  }, [orders]);

  if (loading) {
    return (
      <ReportsLayout title={t('titles.purchaseOrder')} subtitle={subtitle}>
        <div className="py-12 text-center text-neutral-500">{t('loading.purchaseOrder')}</div>
      </ReportsLayout>
    );
  }

  if (error) {
    return (
      <ReportsLayout title={t('titles.purchaseOrder')} subtitle={subtitle}>
        <div className="py-12 text-center text-red-600">{t('errors.failedToLoad', { error })}</div>
      </ReportsLayout>
    );
  }

  return (
    <ReportsLayout
      title={t('titles.purchaseOrder')}
      subtitle={subtitle}
    >
      <div className="space-y-8">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-neutral-50 p-4 rounded-lg">
            <p className="text-sm text-neutral-600">{t('reports.purchaseOrder')}</p>
            <p className="text-2xl font-bold text-neutral-900">{formatNumber(orders.length)}</p>
          </div>
          <div className="bg-neutral-50 p-4 rounded-lg">
            <p className="text-sm text-neutral-600">{t('columns.items')}</p>
            <p className="text-2xl font-bold text-neutral-900">{formatNumber(totals.totalItems)}</p>
          </div>
          <div className="bg-neutral-50 p-4 rounded-lg">
            <p className="text-sm text-neutral-600">{t('columns.quantity')}</p>
            <p className="text-2xl font-bold text-neutral-900">{formatNumber(totals.totalQuantity)}</p>
          </div>
          <div className="bg-neutral-50 p-4 rounded-lg">
            <p className="text-sm text-neutral-600">{t('columns.total')}</p>
            <p className="text-2xl font-bold text-neutral-900">{withCurrency(totals.totalAmount)}</p>
          </div>
        </div>

        <div className="overflow-hidden rounded-lg border border-neutral-200">
          <h3 className="bg-neutral-100 px-6 py-3 text-sm font-semibold text-neutral-700">{t('titles.purchaseOrder')}</h3>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-neutral-200">
              <thead className="bg-neutral-50">
                <tr>
                  <th className="py-3 pl-6 pr-3 text-left text-xs font-semibold text-neutral-700">{t('columns.date')}</th>
                  <th className="py-3 px-3 text-left text-xs font-semibold text-neutral-700">{t('columns.invoice')}</th>
                  <th className="py-3 px-3 text-left text-xs font-semibold text-neutral-700">{t('columns.status')}</th>
                  <th className="py-3 px-3 text-left text-xs font-semibold text-neutral-700">{t('filters.supplier')}</th>
                  <th className="py-3 px-3 text-left text-xs font-semibold text-neutral-700">{t('filters.item')}</th>
                  <th className="py-3 px-3 text-right text-xs font-semibold text-neutral-700">{t('columns.quantity')}</th>
                  <th className="py-3 px-3 text-right text-xs font-semibold text-neutral-700">{t('columns.price')}</th>
                  <th className="py-3 px-3 text-right text-xs font-semibold text-neutral-700">{t('columns.amount')}</th>
                  <th className="py-3 pr-6 text-left text-xs font-semibold text-neutral-700">{t('columns.createdBy')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100 bg-white">
                {orders.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-6 text-center text-sm text-neutral-500">
                      No purchase orders found for the selected filters
                    </td>
                  </tr>
                ) : (
                  orders.flatMap(order => {
                    const date = toLuxonDateTime(order.created_at);
                    const dateStr = date.toFormat(import.meta.env.VITE_DATE_FORMAT);
                    const supplierName = order.supplier?.name || 'N/A';
                    const createdBy = (order as any).created_by;
                    const createdByName = createdBy
                      ? `${createdBy.first_name ?? ''} ${createdBy.last_name ?? ''}`.trim() || createdBy.login || 'Unknown'
                      : 'Unknown';

                    const lines = order.items?.length
                      ? order.items
                      : [null];

                    return lines.map((item, index) => {
                      const itemName = item?.item?.name || '—';
                      const quantity = item ? safeNumber(item.quantity) : 0;
                      const price = item
                        ? resolveInventoryLineUnitCost({
                          price: item.price,
                          item: item.item,
                        })
                        : 0;
                      const amount = item ? lineAmount(price, quantity) : 0;

                      return (
                        <tr key={`${order.id}-${index}`}>
                          <td className="py-3 pl-6 pr-3 text-sm text-neutral-900">{dateStr}</td>
                          <td className="py-3 px-3 text-sm text-neutral-700">
                            {order.id ? (
                              <a
                                className="text-primary-600 underline print:no-underline print:text-neutral-700"
                                href={inventoryPrintUrl("purchase-order", String(order.id))}
                                target="_blank"
                                rel="noreferrer"
                              >
                                #{order.po_number}
                              </a>
                            ) : (
                              `#${order.po_number}`
                            )}
                          </td>
                          <td className="py-3 px-3 text-sm text-neutral-700">{order.status}</td>
                          <td className="py-3 px-3 text-sm text-neutral-700">{supplierName}</td>
                          <td className="py-3 px-3 text-sm text-neutral-700">{itemName}</td>
                          <td className="py-3 px-3 text-right text-sm text-neutral-700">{formatNumber(quantity)}</td>
                          <td className="py-3 px-3 text-right text-sm text-neutral-700">{withCurrency(price)}</td>
                          <td className="py-3 px-3 text-right text-sm font-semibold text-neutral-900">{withCurrency(amount)}</td>
                          <td className="py-3 pr-6 text-sm text-neutral-700">{createdByName}</td>
                        </tr>
                      );
                    });
                  })
                )}
              </tbody>
              {orders.length > 0 && (
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
                    <td></td>
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
