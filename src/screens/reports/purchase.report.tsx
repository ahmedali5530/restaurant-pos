import {useEffect, useMemo, useRef, useState} from "react";
import { useTranslation } from 'react-i18next';
import {ReportsLayout} from "@/screens/partials/reports.layout.tsx";
import {useDB} from "@/api/db/db.ts";
import {Tables} from "@/api/db/tables.ts";
import {InventoryPurchase} from "@/api/model/inventory_purchase.ts";
import {formatNumber, safeNumber, withCurrency} from "@/lib/utils.ts";
import { toLuxonDateTime } from "@/lib/datetime.ts";
import {
  buildLocationInsideCondition,
  buildNestedRecordAnyCondition,
  buildRecordInsideCondition,
} from "@/api/reports/shared/query.ts";
import {extrasTotal} from "@/lib/inventory/purchase.totals.ts";
import {inventoryPrintUrl} from "@/routes/posr.ts";

interface ReportFilters {
  startDate?: string | null;
  endDate?: string | null;
  supplierIds: string[];
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
    supplierIds: parseMulti('suppliers'),
    locationIds: parseMulti('locations'),
    itemIds: parseMulti('items'),
    userIds: parseMulti('users'),
  };
};

export const PurchaseReport = () => {
  const { t } = useTranslation('reports');
  const db = useDB();
  const queryRef = useRef(db.query);
  const [purchases, setPurchases] = useState<InventoryPurchase[]>([]);
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

        const supplierFilter = buildRecordInsideCondition('supplier', filters.supplierIds, 'supplierIds');
        if (supplierFilter.condition) {
          conditions.push(supplierFilter.condition);
          Object.assign(params, supplierFilter.params);
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
          SELECT * FROM ${Tables.inventory_purchases}
          ${conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''}
          ORDER BY created_at ASC
          FETCH items, items.item, items.item.category, created_by, supplier, location, store
        `;

        const result: any = await queryRef.current(query, params);
        setPurchases((result?.[0]?.result ?? result?.[0] ?? []) as InventoryPurchase[]);
      } catch (err) {
        console.error('Failed to load purchase report:', err);
        setError(err instanceof Error ? err.message : t('errors.unableToLoad'));
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [filters.startDate, filters.endDate, filters.supplierIds, filters.locationIds, filters.itemIds, filters.userIds]);

  // Calculate totals
  const totals = useMemo(() => {
    let totalQuantity = 0;
    let totalSubtotal = 0;
    let totalTax = 0;
    let totalExtras = 0;
    let totalItems = 0;
    let totalFinalInventory = 0;
    let totalLanded = 0;

    purchases.forEach(purchase => {
      purchase.items?.forEach(item => {
        const qty = safeNumber(item.quantity);
        const base = safeNumber(item.base_quantity) || 1;
        totalQuantity += qty * base;
        totalSubtotal += safeNumber(item.price) * qty;
        totalItems += 1;
        if (item.total_inventory_cost != null) {
          totalFinalInventory += safeNumber(item.total_inventory_cost);
        } else {
          totalFinalInventory += safeNumber(item.price) * qty;
        }
      });
      totalTax += safeNumber(purchase.tax_amount);
      totalExtras += extrasTotal(purchase.extras);
      const snap = purchase.cost_allocation_snapshot?.summary;
      if (snap) {
        totalLanded += safeNumber(snap.capitalized_extras);
      }
    });

    return {
      totalQuantity,
      totalSubtotal,
      totalTax,
      totalExtras,
      totalGrand: totalSubtotal + totalTax + totalExtras,
      totalItems,
      totalFinalInventory,
      totalLanded,
    };
  }, [purchases]);

  if (loading) {
    return (
      <ReportsLayout title={t('titles.purchase')} subtitle={subtitle}>
        <div className="py-12 text-center text-muted">{t('loading.purchase')}</div>
      </ReportsLayout>
    );
  }

  if (error) {
    return (
      <ReportsLayout title={t('titles.purchase')} subtitle={subtitle}>
        <div className="py-12 text-center text-red-600">{t('errors.failedToLoad', { error })}</div>
      </ReportsLayout>
    );
  }

  return (
    <ReportsLayout
      title={t('titles.purchase')}
      subtitle={subtitle}
    >
      <div className="space-y-8">
        {/* Summary */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-8 gap-4">
          <div className="bg-surface p-4 rounded-lg">
            <p className="text-sm text-muted">Total Purchases</p>
            <p className="text-2xl font-bold text-foreground">{formatNumber(purchases.length)}</p>
          </div>
          <div className="bg-surface p-4 rounded-lg">
            <p className="text-sm text-muted">Total Items</p>
            <p className="text-2xl font-bold text-foreground">{formatNumber(totals.totalItems)}</p>
          </div>
          <div className="bg-surface p-4 rounded-lg">
            <p className="text-sm text-muted">{t('columns.subtotal')}</p>
            <p className="text-2xl font-bold text-foreground">{withCurrency(totals.totalSubtotal)}</p>
          </div>
          <div className="bg-surface p-4 rounded-lg">
            <p className="text-sm text-muted">{t('columns.tax')}</p>
            <p className="text-2xl font-bold text-foreground">{withCurrency(totals.totalTax)}</p>
          </div>
          <div className="bg-surface p-4 rounded-lg">
            <p className="text-sm text-muted">{t('columns.extras')}</p>
            <p className="text-2xl font-bold text-foreground">{withCurrency(totals.totalExtras)}</p>
          </div>
          <div className="bg-surface p-4 rounded-lg">
            <p className="text-sm text-muted">{t('columns.landedCost')}</p>
            <p className="text-2xl font-bold text-foreground">{withCurrency(totals.totalLanded)}</p>
          </div>
          <div className="bg-surface p-4 rounded-lg">
            <p className="text-sm text-muted">{t('columns.finalInventory')}</p>
            <p className="text-2xl font-bold text-foreground">{withCurrency(totals.totalFinalInventory)}</p>
          </div>
          <div className="bg-surface p-4 rounded-lg">
            <p className="text-sm text-muted">{t('columns.grandTotal')}</p>
            <p className="text-2xl font-bold text-foreground">{withCurrency(totals.totalGrand)}</p>
          </div>
        </div>

        {/* Detailed table */}
        <div className="overflow-hidden rounded-lg border border-border">
          <h3 className="bg-surface px-6 py-3 text-sm font-semibold text-foreground">Purchase Details</h3>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-neutral-200">
              <thead className="bg-surface">
                <tr>
                  <th className="py-3 pl-6 pr-3 text-left text-xs font-semibold text-foreground">{t('columns.date')}</th>
                  <th className="py-3 px-3 text-left text-xs font-semibold text-foreground">{t('columns.invoice')}</th>
                  <th className="py-3 px-3 text-left text-xs font-semibold text-foreground">{t('filters.supplier')}</th>
                  <th className="py-3 px-3 text-left text-xs font-semibold text-foreground">{t('columns.location')}</th>
                  <th className="py-3 px-3 text-left text-xs font-semibold text-foreground">{t('filters.item')}</th>
                  <th className="py-3 px-3 text-left text-xs font-semibold text-foreground">{t('columns.taxable')}</th>
                  <th className="py-3 px-3 text-right text-xs font-semibold text-foreground">{t('columns.quantity')}</th>
                  <th className="py-3 px-3 text-right text-xs font-semibold text-foreground">{t('columns.price')}</th>
                  <th className="py-3 px-3 text-right text-xs font-semibold text-foreground">{t('columns.amount')}</th>
                  <th className="py-3 px-3 text-right text-xs font-semibold text-foreground">{t('columns.tax')}</th>
                  <th className="py-3 px-3 text-right text-xs font-semibold text-foreground">{t('columns.extras')}</th>
                  <th className="py-3 px-3 text-left text-xs font-semibold text-foreground">{t('columns.createdBy')}</th>
                  <th className="py-3 pr-6 text-left text-xs font-semibold text-foreground">{t('columns.comments')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100 bg-surface-elevated">
                {purchases.length === 0 ? (
                  <tr>
                    <td colSpan={13} className="py-6 text-center text-sm text-muted">
                      No purchases found for the selected filters
                    </td>
                  </tr>
                ) : (
                  purchases.flatMap(purchase => {
                    const date = toLuxonDateTime(purchase.created_at);
                    const dateStr = date.toFormat(import.meta.env.VITE_DATE_FORMAT);
                    const supplierName = purchase.supplier?.name || 'N/A';
                    const locationName = purchase.location?.name || 'N/A';
                    const createdByName = purchase.created_by
                      ? `${purchase.created_by.first_name ?? ''} ${purchase.created_by.last_name ?? ''}`.trim() || purchase.created_by.login || 'Unknown'
                      : 'Unknown';
                    const purchaseTax = safeNumber(purchase.tax_amount);
                    const purchaseExtras = extrasTotal(purchase.extras);

                    return purchase.items?.map((item, index) => {
                      const itemName = item.item?.name || 'Unknown';
                      const quantity = safeNumber(item.quantity);
                      const base = safeNumber(item.base_quantity) || 1;
                      const effectiveQty = quantity * base;
                      const price = safeNumber(item.price);
                      const amount = quantity * price;
                      const isFirst = index === 0;

                      return (
                        <tr key={`${purchase.id}-${index}`}>
                          <td className="py-3 pl-6 pr-3 text-sm text-foreground">{dateStr}</td>
                          <td className="py-3 px-3 text-sm text-foreground">
                            {purchase.id ? (
                              <a
                                className="text-primary-600 underline print:no-underline print:text-foreground"
                                href={inventoryPrintUrl("purchase", String(purchase.id))}
                                target="_blank"
                                rel="noreferrer"
                              >
                                {purchase.invoice_number || 'N/A'}
                              </a>
                            ) : (
                              purchase.invoice_number || 'N/A'
                            )}
                          </td>
                          <td className="py-3 px-3 text-sm text-foreground">{supplierName}</td>
                          <td className="py-3 px-3 text-sm text-foreground">{locationName}</td>
                          <td className="py-3 px-3 text-sm text-foreground">{itemName}</td>
                          <td className="py-3 px-3 text-sm text-foreground">{item.taxable ? 'Yes' : 'No'}</td>
                          <td className="py-3 px-3 text-right text-sm text-foreground">{formatNumber(effectiveQty)}</td>
                          <td className="py-3 px-3 text-right text-sm text-foreground">{withCurrency(price)}</td>
                          <td className="py-3 px-3 text-right text-sm font-semibold text-foreground">{withCurrency(amount)}</td>
                          <td className="py-3 px-3 text-right text-sm text-foreground">
                            {isFirst ? withCurrency(purchaseTax) : '—'}
                          </td>
                          <td className="py-3 px-3 text-right text-sm text-foreground">
                            {isFirst ? withCurrency(purchaseExtras) : '—'}
                          </td>
                          <td className="py-3 px-3 text-sm text-foreground">{createdByName}</td>
                          <td className="py-3 pr-6 text-sm text-foreground">{item.comments || purchase.comments || '-'}</td>
                        </tr>
                      );
                    }) || [];
                  })
                )}
              </tbody>
              {purchases.length > 0 && (
                <tfoot className="bg-surface">
                  <tr>
                    <td colSpan={6} className="py-3 pl-6 pr-3 text-sm font-semibold text-foreground">{t('columns.total')}</td>
                    <td className="py-3 px-3 text-right text-sm font-bold text-foreground">
                      {formatNumber(totals.totalQuantity)}
                    </td>
                    <td colSpan={1}></td>
                    <td className="py-3 px-3 text-right text-sm font-bold text-foreground">
                      {withCurrency(totals.totalSubtotal)}
                    </td>
                    <td className="py-3 px-3 text-right text-sm font-bold text-foreground">
                      {withCurrency(totals.totalTax)}
                    </td>
                    <td className="py-3 px-3 text-right text-sm font-bold text-foreground">
                      {withCurrency(totals.totalExtras)}
                    </td>
                    <td colSpan={2}></td>
                  </tr>
                  <tr>
                    <td colSpan={8} className="py-3 pl-6 pr-3 text-sm font-semibold text-foreground">{t('columns.grandTotal')}</td>
                    <td colSpan={3} className="py-3 px-3 text-right text-sm font-bold text-foreground">
                      {withCurrency(totals.totalGrand)}
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

