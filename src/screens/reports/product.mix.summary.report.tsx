import {Fragment, useEffect, useMemo, useState} from "react";
import { useTranslation } from 'react-i18next';
import {ReportsLayout} from "@/screens/partials/reports.layout.tsx";
import {useDB} from "@/api/db/db.ts";
import {parseMultiFilter} from "@/api/reports/shared/filters.ts";
import type {CategoryGroup, ModifierSummaryMetrics} from "@/api/reports/shared/types.ts";
import {aggregateAccumulatedModifiersSummary, aggregateModifiersSummary, aggregateProductMixByCategory, fetchOrders, PRODUCT_MIX_FETCHES} from "@/api/reports/sales";
import {withCurrency, formatNumber} from "@/lib/utils.ts";
import {FontAwesomeIcon} from "@fortawesome/react-fontawesome";
import {faPlus, faMinus} from "@fortawesome/free-solid-svg-icons";
import { useShowInclusivePrices } from "@/hooks/useShowInclusivePrices.ts";

const COLUMN_COUNT = 15;

interface ModifierSummaryTotals {
  quantity: number;
  total: number;
}

interface ModifiersSummaryTableProps {
  title: string;
  rows: ModifierSummaryMetrics[];
  totals: ModifierSummaryTotals;
  emptyMessage: string;
  showDepthIndent?: boolean;
}

const ModifiersSummaryTable = ({
  title,
  rows,
  totals,
  emptyMessage,
  showDepthIndent = true,
}: ModifiersSummaryTableProps) => {
  const { t } = useTranslation('reports');
  return (
  <div className="mt-8 overflow-x-auto">
    <h3 className="mb-3 text-sm font-semibold text-foreground">{title}</h3>
    <table className="min-w-full divide-y divide-neutral-200 border border-border">
      <thead className="bg-surface">
        <tr>
          <th className="py-3 pl-6 pr-3 text-left text-xs font-semibold text-foreground">Modifier</th>
          <th className="py-3 px-3 text-right text-xs font-semibold text-foreground">{t('columns.quantity')}</th>
          <th className="py-3 px-3 text-right text-xs font-semibold text-foreground">{t('columns.price')}</th>
          <th className="py-3 pr-6 text-right text-xs font-semibold text-foreground">{t('columns.total')}</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-neutral-100 bg-surface-elevated">
        {rows.map((modifier) => (
          <tr key={modifier.rowKey} className="hover:bg-surface">
            <td className="py-3 pl-6 pr-3 text-sm text-foreground">
              {showDepthIndent ? (
                <span style={{paddingLeft: `${(modifier.depth - 1) * 1}rem`}}>
                  {modifier.modifierName}
                </span>
              ) : (
                modifier.modifierName
              )}
            </td>
            <td className="py-3 px-3 text-sm text-right text-foreground">{formatNumber(modifier.quantity)}</td>
            <td className="py-3 px-3 text-sm text-right text-foreground">{withCurrency(modifier.unitPrice)}</td>
            <td className="py-3 pr-6 text-sm text-right font-semibold text-foreground">{withCurrency(modifier.total)}</td>
          </tr>
        ))}
        {rows.length === 0 && (
          <tr>
            <td colSpan={4} className="py-6 text-center text-sm text-muted">
              {emptyMessage}
            </td>
          </tr>
        )}
      </tbody>
      <tfoot className="bg-surface font-semibold">
        <tr>
          <td className="py-3 pl-6 pr-3 text-sm text-foreground">Totals</td>
          <td className="py-3 px-3 text-sm text-right text-foreground">{formatNumber(totals.quantity)}</td>
          <td className="py-3 px-3 text-sm text-right text-foreground">-</td>
          <td className="py-3 pr-6 text-sm text-right text-foreground">{withCurrency(totals.total)}</td>
        </tr>
      </tfoot>
    </table>
  </div>
  );
};

interface ReportFilters {
  startDate?: string;
  endDate?: string;
  orderTakerIds: string[];
  orderTypeIds: string[];
  categoryIds: string[];
  menuItemIds: string[];
  modifierIds: string[];
}

const parseFilters = (): ReportFilters => {
  const params = new URLSearchParams(window.location.search);

  return {
    startDate: params.get('start') || params.get('start') || undefined,
    endDate: params.get('end') || params.get('end') || undefined,
    orderTakerIds: parseMultiFilter(params, 'order_takers'),
    orderTypeIds: parseMultiFilter(params, 'order_types'),
    categoryIds: parseMultiFilter(params, 'categories'),
    menuItemIds: parseMultiFilter(params, 'menu_items'),
    modifierIds: parseMultiFilter(params, 'modifiers'),
  };
};

export const ProductMixSummaryReport = () => {
  const { t } = useTranslation('reports');
  const db = useDB();
  const { enabled: showInclusive } = useShowInclusivePrices();
  const [categoryGroups, setCategoryGroups] = useState<CategoryGroup[]>([]);
  const [modifiersSummary, setModifiersSummary] = useState<ModifierSummaryMetrics[]>([]);
  const [accumulatedModifiersSummary, setAccumulatedModifiersSummary] = useState<ModifierSummaryMetrics[]>([]);
  const [expandedDishes, setExpandedDishes] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const filters = useMemo(parseFilters, []);
  const subtitle = filters.startDate && filters.endDate
    ? `${filters.startDate} to ${filters.endDate}`
    : undefined;

  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);

      const orders = await fetchOrders(db, {
        startDate: filters.startDate,
        endDate: filters.endDate,
        fetches: PRODUCT_MIX_FETCHES,
        orderTakerIds: filters.orderTakerIds,
        orderTypeIds: filters.orderTypeIds,
      });

      const productMixFilters = {
        categoryIds: filters.categoryIds,
        menuItemIds: filters.menuItemIds,
        modifierIds: filters.modifierIds,
        showInclusivePrices: showInclusive,
      };

      setCategoryGroups(aggregateProductMixByCategory(orders, productMixFilters));
      setModifiersSummary(aggregateModifiersSummary(orders, productMixFilters));
      setAccumulatedModifiersSummary(aggregateAccumulatedModifiersSummary(orders, productMixFilters));
    } catch (err) {
      console.error("Failed to load product mix summary report", err);
      setError(err instanceof Error ? err.message : t('errors.unableToLoad'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchData();
  }, [
    filters.startDate,
    filters.endDate,
    filters.orderTakerIds.join(','),
    filters.orderTypeIds.join(','),
    filters.categoryIds.join(','),
    filters.menuItemIds.join(','),
    filters.modifierIds.join(','),
    showInclusive,
  ]);

  const toggleExpand = (dishKey: string) => {
    setExpandedDishes(prev => {
      const next = new Set(prev);
      if (next.has(dishKey)) {
        next.delete(dishKey);
      } else {
        next.add(dishKey);
      }
      return next;
    });
  };

  const grandTotals = useMemo(() => {
    const totals = categoryGroups.reduce(
      (acc, category) => ({
        numSold: acc.numSold + category.totals.numSold,
        amount: acc.amount + category.totals.amount,
        cost: acc.cost + category.totals.cost,
        profit: acc.profit + category.totals.profit,
        salePercent: acc.salePercent + category.totals.salePercent,
        discount: acc.discount + category.totals.discount,
        tax: acc.tax + category.totals.tax,
        serviceCharges: acc.serviceCharges + category.totals.serviceCharges,
        totalCollected: acc.totalCollected + category.totals.totalCollected,
      }),
      {
        numSold: 0,
        amount: 0,
        cost: 0,
        profit: 0,
        salePercent: 0,
        discount: 0,
        tax: 0,
        serviceCharges: 0,
        totalCollected: 0,
      }
    );

    return {
      ...totals,
      priceSold: totals.numSold > 0 ? totals.amount / totals.numSold : 0,
      foodCostPercent: totals.amount > 0 ? (totals.cost / totals.amount) * 100 : 0,
    };
  }, [categoryGroups]);

  const modifierSummaryTotals = useMemo(() => {
    return modifiersSummary.reduce((totals, modifier) => ({
      quantity: totals.quantity + modifier.quantity,
      total: totals.total + modifier.total,
    }), {
      quantity: 0,
      total: 0,
    });
  }, [modifiersSummary]);

  const accumulatedModifierSummaryTotals = useMemo(() => {
    return accumulatedModifiersSummary.reduce((totals, modifier) => ({
      quantity: totals.quantity + modifier.quantity,
      total: totals.total + modifier.total,
    }), {
      quantity: 0,
      total: 0,
    });
  }, [accumulatedModifiersSummary]);

  if (loading) {
    return (
      <ReportsLayout title={t('reports.productMixSummary')} subtitle={subtitle}>
        <div className="py-12 text-center text-muted">{t('loading.productMixSummary')}</div>
      </ReportsLayout>
    );
  }

  if (error) {
    return (
      <ReportsLayout title={t('reports.productMixSummary')} subtitle={subtitle}>
        <div className="py-12 text-center text-red-600">{t('errors.failedToLoad', { error })}</div>
      </ReportsLayout>
    );
  }

  return (
    <ReportsLayout onRefresh={fetchData} title={t('reports.productMixSummary')} subtitle={subtitle}>
      <div className="alert alert-warning">This report doesn't include taxes, discounts, service charges, extras and tips</div>
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-neutral-200 border border-border">
          <thead className="bg-surface">
            <tr>
              <th className="py-3 pl-6 pr-3 text-left text-xs font-semibold text-foreground"></th>
              <th className="py-3 px-3 text-left text-xs font-semibold text-foreground">Rank</th>
              <th className="py-3 px-3 text-left text-xs font-semibold text-foreground">Item Number</th>
              <th className="py-3 px-3 text-left text-xs font-semibold text-foreground">{t('columns.name')}</th>
              <th className="py-3 px-3 text-right text-xs font-semibold text-foreground">Num Sold</th>
              <th className="py-3 px-3 text-right text-xs font-semibold text-foreground">Price Sold</th>
              <th className="py-3 px-3 text-right text-xs font-semibold text-foreground">{t('columns.amount')}</th>
              <th className="py-3 px-3 text-right text-xs font-semibold text-foreground">{t('columns.cost')}</th>
              <th className="py-3 px-3 text-right text-xs font-semibold text-foreground">{t('columns.profit')}</th>
              <th className="py-3 px-3 text-right text-xs font-semibold text-foreground">{t('labels.foodCostPercent')}</th>
              <th className="py-3 px-3 text-right text-xs font-semibold text-foreground">Sale %</th>
              <th className="py-3 px-3 text-right text-xs font-semibold text-foreground">{t('reports.discount')}</th>
              <th className="py-3 px-3 text-right text-xs font-semibold text-foreground">{t('reports.tax')}</th>
              <th className="py-3 px-3 text-right text-xs font-semibold text-foreground">Service Charges</th>
              <th className="py-3 pr-6 text-right text-xs font-semibold text-foreground">Total Collected</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100 bg-surface-elevated">
            {categoryGroups.flatMap((category) => [
              // Category header row with totals
              <tr key={`category-${category.categoryId}`} className="bg-surface dark:bg-neutral-700 font-bold border-b-2 border-border">
                <td className="py-3 pl-6 pr-3 text-sm text-foreground"></td>
                <td className="py-3 px-3 text-sm text-foreground"></td>
                <td className="py-3 px-3 text-sm text-foreground"></td>
                <td className="py-3 px-3 text-sm text-foreground uppercase">
                  {category.categoryName}
                </td>
                <td className="py-3 px-3 text-right text-sm text-foreground">
                  {formatNumber(category.totals.numSold)}
                </td>
                <td className="py-3 px-3 text-right text-sm text-foreground">
                  {withCurrency(category.totals.priceSold)}
                </td>
                <td className="py-3 px-3 text-right text-sm text-foreground">
                  {withCurrency(category.totals.amount)}
                </td>
                <td className="py-3 px-3 text-right text-sm text-foreground">
                  {withCurrency(category.totals.cost)}
                </td>
                <td className="py-3 px-3 text-right text-sm text-foreground">
                  {withCurrency(category.totals.profit)}
                </td>
                <td className="py-3 px-3 text-right text-sm text-foreground">
                  {formatNumber(category.totals.foodCostPercent)}%
                </td>
                <td className="py-3 px-3 text-right text-sm text-foreground">
                  {formatNumber(category.totals.salePercent)}%
                </td>
                <td className="py-3 px-3 text-right text-sm text-foreground">
                  {withCurrency(category.totals.discount)}
                </td>
                <td className="py-3 px-3 text-right text-sm text-foreground">
                  {withCurrency(category.totals.tax)}
                </td>
                <td className="py-3 px-3 text-right text-sm text-foreground">
                  {withCurrency(category.totals.serviceCharges)}
                </td>
                <td className="py-3 pr-6 text-right text-sm text-foreground">
                  {withCurrency(category.totals.totalCollected)}
                </td>
              </tr>,
              // Menu items under category
              ...category.items.flatMap((item, index) => {
                const dishKey = `${category.categoryId}-${item.dishId}`;
                const isExpanded = expandedDishes.has(dishKey);

                const rows = [
                  <tr key={`item-${dishKey}`} className="bg-surface-elevated hover:bg-surface border-b border-border">
                    <td className="py-2 pl-6 pr-3 text-center">
                      {item.hasModifiers && (
                        <button
                          onClick={() => toggleExpand(dishKey)}
                          className="text-muted hover:text-foreground"
                        >
                          <FontAwesomeIcon icon={isExpanded ? faMinus : faPlus} />
                        </button>
                      )}
                    </td>
                    <td className="py-2 px-3 text-sm text-muted">
                      {index + 1}
                    </td>
                    <td className="py-2 px-3 text-sm text-muted">
                      {item.itemNumber}
                    </td>
                    <td className="py-2 px-3 text-sm text-foreground pl-8">
                      {item.name}
                    </td>
                    <td className="py-2 px-3 text-right text-sm text-muted">
                      {formatNumber(item.numSold)}
                    </td>
                    <td className="py-2 px-3 text-right text-sm text-muted">
                      {withCurrency(item.priceSold)}
                    </td>
                    <td className="py-2 px-3 text-right text-sm text-foreground">
                      {withCurrency(item.amount)}
                    </td>
                    <td className="py-2 px-3 text-right text-sm text-muted">
                      {withCurrency(item.cost)}
                    </td>
                    <td className="py-2 px-3 text-right text-sm text-foreground">
                      {withCurrency(item.profit)}
                    </td>
                    <td className="py-2 px-3 text-right text-sm text-muted">
                      {formatNumber(item.foodCostPercent)}%
                    </td>
                    <td className="py-2 px-3 text-right text-sm text-muted">
                      {formatNumber(item.salePercent)}%
                    </td>
                    <td className="py-2 px-3 text-right text-sm text-muted">
                      {withCurrency(item.discount)}
                    </td>
                    <td className="py-2 px-3 text-right text-sm text-muted">
                      {withCurrency(item.tax)}
                    </td>
                    <td className="py-2 px-3 text-right text-sm text-muted">
                      {withCurrency(item.serviceCharges)}
                    </td>
                    <td className="py-2 pr-6 text-right text-sm font-semibold text-foreground">
                      {withCurrency(item.totalCollected)}
                    </td>
                  </tr>,
                ];

                if (isExpanded && item.modifiers.length > 0) {
                  rows.push(
                    <tr key={`item-${dishKey}-modifiers`}>
                      <td></td>
                      <td colSpan={COLUMN_COUNT - 1} className="py-0 px-0">
                        <div className="px-6 py-3 bg-surface">
                          <div className="text-xs font-semibold text-foreground mb-2">Modifiers:</div>
                          <table className="w-full border border-border rounded">
                            <thead className="bg-surface">
                              <tr>
                                <th className="py-2 px-3 text-left text-xs font-semibold text-foreground">Modifier</th>
                                <th className="py-2 px-3 text-right text-xs font-semibold text-foreground">{t('columns.quantity')}</th>
                                <th className="py-2 px-3 text-right text-xs font-semibold text-foreground">Unit Price</th>
                                <th className="py-2 px-3 text-right text-xs font-semibold text-foreground">{t('reports.discount')}</th>
                                <th className="py-2 px-3 text-right text-xs font-semibold text-foreground">{t('reports.tax')}</th>
                                <th className="py-2 px-3 text-right text-xs font-semibold text-foreground">Service Charges</th>
                                <th className="py-2 px-3 text-right text-xs font-semibold text-foreground">{t('columns.total')}</th>
                                <th className="py-2 px-3 text-right text-xs font-semibold text-foreground">Ratio</th>
                                <th className="py-2 px-3 text-right text-xs font-semibold text-foreground">Meal Price</th>
                              </tr>
                            </thead>
                            <tbody className="bg-surface-elevated divide-y divide-neutral-200">
                              {item.modifiers.map((modifier) => (
                                <tr key={`${dishKey}-${modifier.modifierKey}`} className="hover:bg-surface">
                                  <td className="py-2 px-3 text-sm text-muted">
                                    <span style={{paddingLeft: `${(modifier.depth - 1) * 1}rem`}}>
                                      {modifier.modifierName}
                                    </span>
                                  </td>
                                  <td className="py-2 px-3 text-sm text-right text-muted">{formatNumber(modifier.quantity)}</td>
                                  <td className="py-2 px-3 text-sm text-right text-muted">{withCurrency(modifier.unitPrice)}</td>
                                  <td className="py-2 px-3 text-sm text-right text-muted">{withCurrency(modifier.discount)}</td>
                                  <td className="py-2 px-3 text-sm text-right text-muted">{withCurrency(modifier.tax)}</td>
                                  <td className="py-2 px-3 text-sm text-right text-muted">{withCurrency(modifier.serviceCharges)}</td>
                                  <td className="py-2 px-3 text-sm text-right text-muted">{withCurrency(modifier.total)}</td>
                                  <td className="py-2 px-3 text-sm text-right text-muted">{formatNumber(modifier.ratio * 100)}%</td>
                                  <td className="py-2 px-3 text-sm text-right text-muted">{withCurrency(modifier.mealPrice)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </td>
                    </tr>
                  );
                }

                return rows;
              })
            ])}
            {categoryGroups.length === 0 && (
              <tr>
                <td colSpan={COLUMN_COUNT} className="py-6 text-center text-sm text-muted">
                  No data available for the selected filters
                </td>
              </tr>
            )}
          </tbody>
          {categoryGroups.length > 0 && (
            <tfoot className="bg-surface border-t-2 border-border">
              <tr className="font-semibold">
                <td className="py-3 pl-6 pr-3 text-sm text-foreground"></td>
                <td className="py-3 px-3 text-sm text-foreground"></td>
                <td className="py-3 px-3 text-sm text-foreground"></td>
                <td className="py-3 px-3 text-sm text-foreground uppercase">
                  TOTAL
                </td>
                <td className="py-3 px-3 text-right text-sm text-foreground">
                  {formatNumber(grandTotals.numSold)}
                </td>
                <td className="py-3 px-3 text-right text-sm text-foreground">
                  {withCurrency(grandTotals.priceSold)}
                </td>
                <td className="py-3 px-3 text-right text-sm text-foreground">
                  {withCurrency(grandTotals.amount)}
                </td>
                <td className="py-3 px-3 text-right text-sm text-foreground">
                  {withCurrency(grandTotals.cost)}
                </td>
                <td className="py-3 px-3 text-right text-sm text-foreground">
                  {withCurrency(grandTotals.profit)}
                </td>
                <td className="py-3 px-3 text-right text-sm text-foreground">
                  {formatNumber(grandTotals.foodCostPercent)}%
                </td>
                <td className="py-3 px-3 text-right text-sm text-foreground">
                  {formatNumber(grandTotals.salePercent)}%
                </td>
                <td className="py-3 px-3 text-right text-sm text-foreground">
                  {withCurrency(grandTotals.discount)}
                </td>
                <td className="py-3 px-3 text-right text-sm text-foreground">
                  {withCurrency(grandTotals.tax)}
                </td>
                <td className="py-3 px-3 text-right text-sm text-foreground">
                  {withCurrency(grandTotals.serviceCharges)}
                </td>
                <td className="py-3 pr-6 text-right text-sm text-foreground">
                  {withCurrency(grandTotals.totalCollected)}
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      <ModifiersSummaryTable
        title={t('filters.modifiers')}
        rows={modifiersSummary}
        totals={modifierSummaryTotals}
        emptyMessage="No modifiers available for the selected filters"
      />

      <ModifiersSummaryTable
        title={t('labels.accumulatedModifiers')}
        rows={accumulatedModifiersSummary}
        totals={accumulatedModifierSummaryTotals}
        emptyMessage="No accumulated modifiers available for the selected filters"
        showDepthIndent={false}
      />
    </ReportsLayout>
  );
};
