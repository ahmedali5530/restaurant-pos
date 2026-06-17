import {useEffect, useMemo, useRef, useState} from "react";
import { useTranslation } from 'react-i18next';
import {ReportsLayout} from "@/screens/partials/reports.layout.tsx";
import {useDB} from "@/api/db/db.ts";
import {Tables} from "@/api/db/tables.ts";
import {OrderVoid} from "@/api/model/order_void.ts";
import {calculateOrderItemPrice} from "@/lib/cart.ts";
import {formatNumber, withCurrency} from "@/lib/utils.ts";
import { toLuxonDateTime } from "@/lib/datetime.ts";

const safeNumber = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const getVoidItems = (voidItem: OrderVoid) => (voidItem.items ?? []).filter(Boolean);

const getVoidLineAmount = (voidItem: OrderVoid, item: any) => {
  const quantity = safeNumber(voidItem.quantity ?? 1);
  return safeNumber(
    calculateOrderItemPrice({
      ...(item ?? {}),
      quantity,
    } as any),
  );
};

interface VoidModifierDetail {
  name: string;
  quantity: number;
  price: number;
  depth: number;
}

const getVoidItemModifiers = (voidItem: OrderVoid, item: any): VoidModifierDetail[] => {
  const parentQuantity = safeNumber(voidItem.quantity ?? 1);
  const rows: VoidModifierDetail[] = [];

  const walkGroups = (groups: any[] = [], depth = 1) => {
    groups.forEach(group => {
      (group?.selectedModifiers ?? []).forEach((selected: any) => {
        const name = selected?.dish?.name || selected?.name || 'Modifier';
        const quantity = safeNumber(selected?.quantity || 1) * parentQuantity;
        const price = safeNumber(selected?.price);
        rows.push({
          name,
          quantity,
          price,
          depth,
        });
        walkGroups(selected?.selectedGroups ?? [], depth + 1);
      });
    });
  };

  walkGroups(item?.modifiers ?? [], 1);
  return rows;
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
  reasonIds: string[];
  managerIds: string[];
  cashierIds: string[];
  menuItemIds: string[];
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
    reasonIds: parseMulti('reasons'),
    managerIds: parseMulti('managers'),
    cashierIds: parseMulti('cashiers'),
    menuItemIds: parseMulti('menu_items'),
  };
};

export const VoidsReport = () => {
  const { t } = useTranslation('reports');
  const db = useDB();
  const queryRef = useRef(db.query);
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
          SELECT * FROM ${Tables.order_voids}
          ${conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''}
          order by created_at ASC
          FETCH deleted_by, order, order.cashier, items, items.item
        `;

        const result: any = await queryRef.current(query, params);
        let voids = (result?.[0] ?? []) as OrderVoid[];

        // Apply client-side filters
        if (filters.reasonIds.length > 0) {
          voids = voids.filter(voidItem => 
            filters.reasonIds.includes(voidItem.reason)
          );
        }

        if (filters.managerIds.length > 0) {
          voids = voids.filter(voidItem => {
            const managerId = recordToString(voidItem.deleted_by?.id ?? voidItem.deleted_by);
            return filters.managerIds.includes(managerId);
          });
        }

        if (filters.cashierIds.length > 0) {
          voids = voids.filter(voidItem => {
            const cashierId = recordToString(voidItem.order?.cashier?.id ?? voidItem.order?.cashier);
            return filters.cashierIds.includes(cashierId);
          });
        }

        if (filters.menuItemIds.length > 0) {
          voids = voids.filter(voidItem => {
            const menuItemIds = getVoidItems(voidItem).map(item => recordToString(item?.item?.id ?? item?.item));
            return menuItemIds.some(menuItemId => filters.menuItemIds.includes(menuItemId));
          });
        }

        setOrderVoids(voids);
      } catch (err) {
        console.error('Failed to load voids report:', err);
        setError(err instanceof Error ? err.message : t('errors.unableToLoad'));
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [filters.startDate, filters.endDate, filters.reasonIds, filters.managerIds, filters.cashierIds, filters.menuItemIds]);

  // Summary: Voids by reason
  const voidsByReason = useMemo(() => {
    const map = new Map<string, {count: number; quantity: number; amount: number}>();
    
    orderVoids.forEach(voidItem => {
      const reason = voidItem.reason || 'Unknown';
      const voidItems = getVoidItems(voidItem);
      const quantity = safeNumber(voidItem.quantity ?? 1) * voidItems.length;
      const amount = voidItems.reduce((sum, item) => sum + getVoidLineAmount(voidItem, item), 0);
      
      const existing = map.get(reason) || {count: 0, quantity: 0, amount: 0};
      existing.count += 1;
      existing.quantity = safeNumber(existing.quantity + quantity);
      existing.amount = safeNumber(existing.amount + amount);
      map.set(reason, existing);
    });
    
    return Array.from(map.entries())
      .map(([reason, data]) => ({reason, ...data}))
      .sort((a, b) => b.count - a.count);
  }, [orderVoids]);

  // Summary: Voids by managers
  const voidsByManager = useMemo(() => {
    const map = new Map<string, {count: number; quantity: number; amount: number}>();
    
    orderVoids.forEach(voidItem => {
      const managerName = voidItem.deleted_by 
        ? `${voidItem.deleted_by.first_name ?? ''} ${voidItem.deleted_by.last_name ?? ''}`.trim() || voidItem.deleted_by.login || 'Unknown'
        : 'Unknown';
      const voidItems = getVoidItems(voidItem);
      const quantity = safeNumber(voidItem.quantity ?? 1) * voidItems.length;
      const amount = voidItems.reduce((sum, item) => sum + getVoidLineAmount(voidItem, item), 0);
      
      const existing = map.get(managerName) || {count: 0, quantity: 0, amount: 0};
      existing.count += 1;
      existing.quantity = safeNumber(existing.quantity + quantity);
      existing.amount = safeNumber(existing.amount + amount);
      map.set(managerName, existing);
    });
    
    return Array.from(map.entries())
      .map(([manager, data]) => ({manager, ...data}))
      .sort((a, b) => b.count - a.count);
  }, [orderVoids]);

  // Summary: Voids by menu items
  const voidsByMenuItem = useMemo(() => {
    const map = new Map<string, {count: number; quantity: number; amount: number}>();
    
    orderVoids.forEach(voidItem => {
      getVoidItems(voidItem).forEach(item => {
        const menuItemName = item?.item?.name || 'Unknown';
        const quantity = safeNumber(voidItem.quantity ?? 1);
        const amount = getVoidLineAmount(voidItem, item);

        const existing = map.get(menuItemName) || {count: 0, quantity: 0, amount: 0};
        existing.count += 1;
        existing.quantity = safeNumber(existing.quantity + quantity);
        existing.amount = safeNumber(existing.amount + amount);
        map.set(menuItemName, existing);
      });
    });
    
    return Array.from(map.entries())
      .map(([menuItem, data]) => ({menuItem, ...data}))
      .sort((a, b) => b.count - a.count);
  }, [orderVoids]);

  if (loading) {
    return (
      <ReportsLayout title={t('titles.voids')} subtitle={subtitle}>
        <div className="py-12 text-center text-neutral-500">{t('loading.voids')}</div>
      </ReportsLayout>
    );
  }

  if (error) {
    return (
      <ReportsLayout title={t('titles.voids')} subtitle={subtitle}>
        <div className="py-12 text-center text-red-600">{t('errors.failedToLoad', { error })}</div>
      </ReportsLayout>
    );
  }

  return (
    <ReportsLayout
      title={t('titles.voids')}
      subtitle={subtitle}
    >
      <div className="space-y-8">
        {/* Summary sections */}
        <div className="grid grid-cols-3 gap-4">
          {/* Voids by Reason */}
          <div className="overflow-hidden rounded-lg border border-neutral-200">
            <h3 className="bg-neutral-100 px-6 py-3 text-sm font-semibold text-neutral-700">Voids by Reason</h3>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-neutral-200">
                <thead className="bg-neutral-50">
                  <tr>
                    <th className="py-3 pl-6 pr-3 text-left text-xs font-semibold text-neutral-700">{t('columns.reason')}</th>
                    <th className="py-3 px-3 text-right text-xs font-semibold text-neutral-700">{t('metrics.count')}</th>
                    <th className="py-3 px-3 text-right text-xs font-semibold text-neutral-700">{t('columns.quantity')}</th>
                    <th className="py-3 pr-6 text-right text-xs font-semibold text-neutral-700">{t('columns.amount')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100 bg-white">
                  {voidsByReason.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="py-6 text-center text-sm text-neutral-500">
                        No voids by reason
                      </td>
                    </tr>
                  ) : (
                    voidsByReason.map((item) => (
                      <tr key={item.reason}>
                        <td className="py-3 pl-6 pr-3 text-sm font-medium text-neutral-900">{item.reason}</td>
                        <td className="py-3 px-3 text-right text-sm text-neutral-700">{formatNumber(item.count)}</td>
                        <td className="py-3 px-3 text-right text-sm text-neutral-700">{formatNumber(item.quantity)}</td>
                        <td className="py-3 pr-6 text-right text-sm font-semibold text-neutral-900">
                          {withCurrency(item.amount)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Voids by Managers */}
          <div className="overflow-hidden rounded-lg border border-neutral-200">
            <h3 className="bg-neutral-100 px-6 py-3 text-sm font-semibold text-neutral-700">Voids by Managers</h3>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-neutral-200">
                <thead className="bg-neutral-50">
                  <tr>
                    <th className="py-3 pl-6 pr-3 text-left text-xs font-semibold text-neutral-700">Manager</th>
                    <th className="py-3 px-3 text-right text-xs font-semibold text-neutral-700">{t('metrics.count')}</th>
                    <th className="py-3 px-3 text-right text-xs font-semibold text-neutral-700">{t('columns.quantity')}</th>
                    <th className="py-3 pr-6 text-right text-xs font-semibold text-neutral-700">{t('columns.amount')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100 bg-white">
                  {voidsByManager.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="py-6 text-center text-sm text-neutral-500">
                        No voids by manager
                      </td>
                    </tr>
                  ) : (
                    voidsByManager.map((item) => (
                      <tr key={item.manager}>
                        <td className="py-3 pl-6 pr-3 text-sm font-medium text-neutral-900">{item.manager}</td>
                        <td className="py-3 px-3 text-right text-sm text-neutral-700">{formatNumber(item.count)}</td>
                        <td className="py-3 px-3 text-right text-sm text-neutral-700">{formatNumber(item.quantity)}</td>
                        <td className="py-3 pr-6 text-right text-sm font-semibold text-neutral-900">
                          {withCurrency(item.amount)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Voids by Menu Items */}
          <div className="overflow-hidden rounded-lg border border-neutral-200">
            <h3 className="bg-neutral-100 px-6 py-3 text-sm font-semibold text-neutral-700">Voids by Menu Items</h3>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-neutral-200">
                <thead className="bg-neutral-50">
                  <tr>
                    <th className="py-3 pl-6 pr-3 text-left text-xs font-semibold text-neutral-700">Menu Item</th>
                    <th className="py-3 px-3 text-right text-xs font-semibold text-neutral-700">{t('metrics.count')}</th>
                    <th className="py-3 px-3 text-right text-xs font-semibold text-neutral-700">{t('columns.quantity')}</th>
                    <th className="py-3 pr-6 text-right text-xs font-semibold text-neutral-700">{t('columns.amount')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100 bg-white">
                  {voidsByMenuItem.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="py-6 text-center text-sm text-neutral-500">
                        No voids by menu item
                      </td>
                    </tr>
                  ) : (
                    voidsByMenuItem.map((item) => (
                      <tr key={item.menuItem}>
                        <td className="py-3 pl-6 pr-3 text-sm font-medium text-neutral-900">{item.menuItem}</td>
                        <td className="py-3 px-3 text-right text-sm text-neutral-700">{formatNumber(item.count)}</td>
                        <td className="py-3 px-3 text-right text-sm text-neutral-700">{formatNumber(item.quantity)}</td>
                        <td className="py-3 pr-6 text-right text-sm font-semibold text-neutral-900">
                          {withCurrency(item.amount)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Detailed voids table */}
        <div className="overflow-hidden rounded-lg border border-neutral-200">
          <h3 className="bg-neutral-100 px-6 py-3 text-sm font-semibold text-neutral-700">Voids Detail</h3>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-neutral-200">
              <thead className="bg-neutral-50">
                <tr>
                  <th className="py-3 pl-6 pr-3 text-left text-xs font-semibold text-neutral-700">{t('columns.date')}</th>
                  <th className="py-3 px-3 text-left text-xs font-semibold text-neutral-700">{t('common:actions.time')}</th>
                  <th className="py-3 px-3 text-left text-xs font-semibold text-neutral-700">{t('columns.reason')}</th>
                  <th className="py-3 px-3 text-left text-xs font-semibold text-neutral-700">Menu Item</th>
                  <th className="py-3 px-3 text-right text-xs font-semibold text-neutral-700">{t('columns.quantity')}</th>
                  <th className="py-3 px-3 text-right text-xs font-semibold text-neutral-700">{t('metrics.lineTotal')}</th>
                  <th className="py-3 px-3 text-left text-xs font-semibold text-neutral-700">Manager</th>
                  <th className="py-3 px-3 text-left text-xs font-semibold text-neutral-700">{t('metrics.cashier')}</th>
                  <th className="py-3 px-3 text-right text-xs font-semibold text-neutral-700">Order #</th>
                  <th className="py-3 pr-6 text-left text-xs font-semibold text-neutral-700">{t('columns.comments')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100 bg-white">
                {orderVoids.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="py-6 text-center text-sm text-neutral-500">
                      No voids found for the selected filters
                    </td>
                  </tr>
                ) : (
                  orderVoids.map((voidItem) => {
                    const date = toLuxonDateTime(voidItem.created_at);
                    const dateStr = date.toFormat(import.meta.env.VITE_DATE_FORMAT);
                    const timeStr = date.toFormat(import.meta.env.VITE_TIME_FORMAT);
                    const managerName = voidItem.deleted_by 
                      ? `${voidItem.deleted_by.first_name ?? ''} ${voidItem.deleted_by.last_name ?? ''}`.trim() || voidItem.deleted_by.login || 'Unknown'
                      : 'Unknown';
                    const cashierName = voidItem.order?.cashier
                      ? `${voidItem.order.cashier.first_name ?? ''} ${voidItem.order.cashier.last_name ?? ''}`.trim() || voidItem.order.cashier.login || 'Unknown'
                      : 'N/A';
                    const voidItems = getVoidItems(voidItem);
                    const lineTotal = getVoidItems(voidItem).reduce((sum, item) => sum + getVoidLineAmount(voidItem, item), 0);
                    const orderNumber = voidItem.order?.invoice_number || 'N/A';

                    return (
                      <tr key={voidItem.id}>
                        <td className="py-3 pl-6 pr-3 text-sm text-neutral-900">{dateStr}</td>
                        <td className="py-3 px-3 text-sm text-neutral-700">{timeStr}</td>
                        <td className="py-3 px-3 text-sm text-neutral-700">{voidItem.reason}</td>
                        <td className="py-3 px-3 text-sm text-neutral-700">
                          <div className="space-y-2">
                            {voidItems.length === 0 ? (
                              <div>{t('common:actions.unknown')}</div>
                            ) : (
                              voidItems.map((item, itemIndex) => {
                                const modifiers = getVoidItemModifiers(voidItem, item);
                                return (
                                  <div
                                    key={`${recordToString(voidItem.id)}-item-${itemIndex}`}
                                    className="rounded-md border border-neutral-200 bg-neutral-50/60 px-2.5 py-2"
                                  >
                                    <div className="font-semibold text-neutral-900">{item?.item?.name || 'Unknown'}</div>
                                    {modifiers.length > 0 ? (
                                      <div className="mt-1.5 space-y-1">
                                        {modifiers.map((modifier, modifierIndex) => (
                                          <div
                                            key={`${recordToString(voidItem.id)}-item-${itemIndex}-modifier-${modifierIndex}`}
                                            className="flex items-center justify-between gap-2 rounded bg-white px-2 py-1 text-xs text-neutral-700 border border-neutral-200"
                                            style={{marginLeft: `${Math.max(0, modifier.depth - 1) * 14}px`}}
                                          >
                                            <span className="font-medium text-neutral-800">{modifier.name}</span>
                                            <span className="inline-flex items-center gap-2 text-neutral-600">
                                              <span className="rounded bg-neutral-100 px-1.5 py-0.5">Qty {formatNumber(modifier.quantity)}</span>
                                              <span className="rounded bg-neutral-100 px-1.5 py-0.5">{withCurrency(modifier.price)}</span>
                                            </span>
                                          </div>
                                        ))}
                                      </div>
                                    ) : (
                                      <div className="mt-1 text-xs text-neutral-500">No modifiers</div>
                                    )}
                                  </div>
                                );
                              })
                            )}
                          </div>
                        </td>
                        <td className="py-3 px-3 text-right text-sm text-neutral-700">{formatNumber(voidItem.quantity)}</td>
                        <td className="py-3 px-3 text-right text-sm text-neutral-700">{withCurrency(lineTotal)}</td>
                        <td className="py-3 px-3 text-sm text-neutral-700">{managerName}</td>
                        <td className="py-3 px-3 text-sm text-neutral-700">{cashierName}</td>
                        <td className="py-3 px-3 text-right text-sm text-neutral-700">{orderNumber}</td>
                        <td className="py-3 pr-6 text-sm text-neutral-700">{voidItem.comments || '-'}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
              {orderVoids.length > 0 && (
                <tfoot className="bg-neutral-50">
                  <tr>
                    <td colSpan={4} className="py-3 pl-6 pr-3 text-sm font-semibold text-neutral-900">{t('columns.total')}</td>
                    <td className="py-3 px-3 text-right text-sm font-bold text-neutral-900">
                      {formatNumber(orderVoids.reduce((sum, v) => sum + safeNumber(v.quantity), 0))}
                    </td>
                    <td className="py-3 px-3 text-right text-sm font-bold text-neutral-900">
                      {withCurrency(orderVoids.reduce((sum, v) => sum + getVoidItems(v).reduce((lineSum, item) => lineSum + getVoidLineAmount(v, item), 0), 0))}
                    </td>
                    <td colSpan={4}></td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      </div>
    </ReportsLayout>
  );
}