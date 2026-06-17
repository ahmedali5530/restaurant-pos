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
    <h3 className="mb-3 text-sm font-semibold text-neutral-800">{title}</h3>
    <table className="min-w-full divide-y divide-neutral-200 border border-neutral-200">
      <thead className="bg-neutral-50">
        <tr>
          <th className="py-3 pl-6 pr-3 text-left text-xs font-semibold text-neutral-700">Modifier</th>
          <th className="py-3 px-3 text-right text-xs font-semibold text-neutral-700">{t('columns.quantity')}</th>
          <th className="py-3 px-3 text-right text-xs font-semibold text-neutral-700">{t('columns.price')}</th>
          <th className="py-3 pr-6 text-right text-xs font-semibold text-neutral-700">{t('columns.total')}</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-neutral-100 bg-white">
        {rows.map((modifier) => (
          <tr key={modifier.rowKey} className="hover:bg-neutral-50">
            <td className="py-3 pl-6 pr-3 text-sm text-neutral-700">
              {showDepthIndent ? (
                <span style={{paddingLeft: `${(modifier.depth - 1) * 1}rem`}}>
                  {modifier.modifierName}
                </span>
              ) : (
                modifier.modifierName
              )}
            </td>
            <td className="py-3 px-3 text-sm text-right text-neutral-700">{formatNumber(modifier.quantity)}</td>
            <td className="py-3 px-3 text-sm text-right text-neutral-700">{withCurrency(modifier.unitPrice)}</td>
            <td className="py-3 pr-6 text-sm text-right font-semibold text-neutral-900">{withCurrency(modifier.total)}</td>
          </tr>
        ))}
        {rows.length === 0 && (
          <tr>
            <td colSpan={4} className="py-6 text-center text-sm text-neutral-500">
              {emptyMessage}
            </td>
          </tr>
        )}
      </tbody>
      <tfoot className="bg-neutral-50 font-semibold">
        <tr>
          <td className="py-3 pl-6 pr-3 text-sm text-neutral-900">Totals</td>
          <td className="py-3 px-3 text-sm text-right text-neutral-900">{formatNumber(totals.quantity)}</td>
          <td className="py-3 px-3 text-sm text-right text-neutral-900">-</td>
          <td className="py-3 pr-6 text-sm text-right text-neutral-900">{withCurrency(totals.total)}</td>
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
        <div className="py-12 text-center text-neutral-500">{t('loading.productMixSummary')}</div>
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
        <table className="min-w-full divide-y divide-neutral-200 border border-neutral-200">
          <thead className="bg-neutral-50">
            <tr>
              <th className="py-3 pl-6 pr-3 text-left text-xs font-semibold text-neutral-700"></th>
              <th className="py-3 px-3 text-left text-xs font-semibold text-neutral-700">Rank</th>
              <th className="py-3 px-3 text-left text-xs font-semibold text-neutral-700">Item Number</th>
              <th className="py-3 px-3 text-left text-xs font-semibold text-neutral-700">{t('columns.name')}</th>
              <th className="py-3 px-3 text-right text-xs font-semibold text-neutral-700">Num Sold</th>
              <th className="py-3 px-3 text-right text-xs font-semibold text-neutral-700">Price Sold</th>
              <th className="py-3 px-3 text-right text-xs font-semibold text-neutral-700">{t('columns.amount')}</th>
              <th className="py-3 px-3 text-right text-xs font-semibold text-neutral-700">{t('columns.cost')}</th>
              <th className="py-3 px-3 text-right text-xs font-semibold text-neutral-700">{t('columns.profit')}</th>
              <th className="py-3 px-3 text-right text-xs font-semibold text-neutral-700">{t('labels.foodCostPercent')}</th>
              <th className="py-3 px-3 text-right text-xs font-semibold text-neutral-700">Sale %</th>
              <th className="py-3 px-3 text-right text-xs font-semibold text-neutral-700">{t('reports.discount')}</th>
              <th className="py-3 px-3 text-right text-xs font-semibold text-neutral-700">{t('reports.tax')}</th>
              <th className="py-3 px-3 text-right text-xs font-semibold text-neutral-700">Service Charges</th>
              <th className="py-3 pr-6 text-right text-xs font-semibold text-neutral-700">Total Collected</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100 bg-white">
            {categoryGroups.flatMap((category) => [
              // Category header row with totals
              <tr key={`category-${category.categoryId}`} className="bg-neutral-200 font-bold border-b-2 border-neutral-400">
                <td className="py-3 pl-6 pr-3 text-sm text-neutral-900"></td>
                <td className="py-3 px-3 text-sm text-neutral-900"></td>
                <td className="py-3 px-3 text-sm text-neutral-900"></td>
                <td className="py-3 px-3 text-sm text-neutral-900 uppercase">
                  {category.categoryName}
                </td>
                <td className="py-3 px-3 text-right text-sm text-neutral-900">
                  {formatNumber(category.totals.numSold)}
                </td>
                <td className="py-3 px-3 text-right text-sm text-neutral-900">
                  {withCurrency(category.totals.priceSold)}
                </td>
                <td className="py-3 px-3 text-right text-sm text-neutral-900">
                  {withCurrency(category.totals.amount)}
                </td>
                <td className="py-3 px-3 text-right text-sm text-neutral-900">
                  {withCurrency(category.totals.cost)}
                </td>
                <td className="py-3 px-3 text-right text-sm text-neutral-900">
                  {withCurrency(category.totals.profit)}
                </td>
                <td className="py-3 px-3 text-right text-sm text-neutral-900">
                  {formatNumber(category.totals.foodCostPercent)}%
                </td>
                <td className="py-3 px-3 text-right text-sm text-neutral-900">
                  {formatNumber(category.totals.salePercent)}%
                </td>
                <td className="py-3 px-3 text-right text-sm text-neutral-900">
                  {withCurrency(category.totals.discount)}
                </td>
                <td className="py-3 px-3 text-right text-sm text-neutral-900">
                  {withCurrency(category.totals.tax)}
                </td>
                <td className="py-3 px-3 text-right text-sm text-neutral-900">
                  {withCurrency(category.totals.serviceCharges)}
                </td>
                <td className="py-3 pr-6 text-right text-sm text-neutral-900">
                  {withCurrency(category.totals.totalCollected)}
                </td>
              </tr>,
              // Menu items under category
              ...category.items.flatMap((item, index) => {
                const dishKey = `${category.categoryId}-${item.dishId}`;
                const isExpanded = expandedDishes.has(dishKey);

                const rows = [
                  <tr key={`item-${dishKey}`} className="bg-white hover:bg-neutral-50 border-b border-neutral-100">
                    <td className="py-2 pl-6 pr-3 text-center">
                      {item.hasModifiers && (
                        <button
                          onClick={() => toggleExpand(dishKey)}
                          className="text-neutral-600 hover:text-neutral-900"
                        >
                          <FontAwesomeIcon icon={isExpanded ? faMinus : faPlus} />
                        </button>
                      )}
                    </td>
                    <td className="py-2 px-3 text-sm text-neutral-600">
                      {index + 1}
                    </td>
                    <td className="py-2 px-3 text-sm text-neutral-600">
                      {item.itemNumber}
                    </td>
                    <td className="py-2 px-3 text-sm text-neutral-700 pl-8">
                      {item.name}
                    </td>
                    <td className="py-2 px-3 text-right text-sm text-neutral-600">
                      {formatNumber(item.numSold)}
                    </td>
                    <td className="py-2 px-3 text-right text-sm text-neutral-600">
                      {withCurrency(item.priceSold)}
                    </td>
                    <td className="py-2 px-3 text-right text-sm text-neutral-700">
                      {withCurrency(item.amount)}
                    </td>
                    <td className="py-2 px-3 text-right text-sm text-neutral-600">
                      {withCurrency(item.cost)}
                    </td>
                    <td className="py-2 px-3 text-right text-sm text-neutral-700">
                      {withCurrency(item.profit)}
                    </td>
                    <td className="py-2 px-3 text-right text-sm text-neutral-600">
                      {formatNumber(item.foodCostPercent)}%
                    </td>
                    <td className="py-2 px-3 text-right text-sm text-neutral-600">
                      {formatNumber(item.salePercent)}%
                    </td>
                    <td className="py-2 px-3 text-right text-sm text-neutral-600">
                      {withCurrency(item.discount)}
                    </td>
                    <td className="py-2 px-3 text-right text-sm text-neutral-600">
                      {withCurrency(item.tax)}
                    </td>
                    <td className="py-2 px-3 text-right text-sm text-neutral-600">
                      {withCurrency(item.serviceCharges)}
                    </td>
                    <td className="py-2 pr-6 text-right text-sm font-semibold text-neutral-900">
                      {withCurrency(item.totalCollected)}
                    </td>
                  </tr>,
                ];

                if (isExpanded && item.modifiers.length > 0) {
                  rows.push(
                    <tr key={`item-${dishKey}-modifiers`}>
                      <td></td>
                      <td colSpan={COLUMN_COUNT - 1} className="py-0 px-0">
                        <div className="px-6 py-3 bg-neutral-50">
                          <div className="text-xs font-semibold text-neutral-700 mb-2">Modifiers:</div>
                          <table className="w-full border border-neutral-200 rounded">
                            <thead className="bg-neutral-100">
                              <tr>
                                <th className="py-2 px-3 text-left text-xs font-semibold text-neutral-700">Modifier</th>
                                <th className="py-2 px-3 text-right text-xs font-semibold text-neutral-700">{t('columns.quantity')}</th>
                                <th className="py-2 px-3 text-right text-xs font-semibold text-neutral-700">Unit Price</th>
                                <th className="py-2 px-3 text-right text-xs font-semibold text-neutral-700">{t('reports.discount')}</th>
                                <th className="py-2 px-3 text-right text-xs font-semibold text-neutral-700">{t('reports.tax')}</th>
                                <th className="py-2 px-3 text-right text-xs font-semibold text-neutral-700">Service Charges</th>
                                <th className="py-2 px-3 text-right text-xs font-semibold text-neutral-700">{t('columns.total')}</th>
                                <th className="py-2 px-3 text-right text-xs font-semibold text-neutral-700">Ratio</th>
                                <th className="py-2 px-3 text-right text-xs font-semibold text-neutral-700">Meal Price</th>
                              </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-neutral-200">
                              {item.modifiers.map((modifier) => (
                                <tr key={`${dishKey}-${modifier.modifierKey}`} className="hover:bg-neutral-50">
                                  <td className="py-2 px-3 text-sm text-neutral-600">
                                    <span style={{paddingLeft: `${(modifier.depth - 1) * 1}rem`}}>
                                      {modifier.modifierName}
                                    </span>
                                  </td>
                                  <td className="py-2 px-3 text-sm text-right text-neutral-600">{formatNumber(modifier.quantity)}</td>
                                  <td className="py-2 px-3 text-sm text-right text-neutral-600">{withCurrency(modifier.unitPrice)}</td>
                                  <td className="py-2 px-3 text-sm text-right text-neutral-600">{withCurrency(modifier.discount)}</td>
                                  <td className="py-2 px-3 text-sm text-right text-neutral-600">{withCurrency(modifier.tax)}</td>
                                  <td className="py-2 px-3 text-sm text-right text-neutral-600">{withCurrency(modifier.serviceCharges)}</td>
                                  <td className="py-2 px-3 text-sm text-right text-neutral-600">{withCurrency(modifier.total)}</td>
                                  <td className="py-2 px-3 text-sm text-right text-neutral-600">{formatNumber(modifier.ratio * 100)}%</td>
                                  <td className="py-2 px-3 text-sm text-right text-neutral-600">{withCurrency(modifier.mealPrice)}</td>
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
                <td colSpan={COLUMN_COUNT} className="py-6 text-center text-sm text-neutral-500">
                  No data available for the selected filters
                </td>
              </tr>
            )}
          </tbody>
          {categoryGroups.length > 0 && (
            <tfoot className="bg-neutral-100 border-t-2 border-neutral-300">
              <tr className="font-semibold">
                <td className="py-3 pl-6 pr-3 text-sm text-neutral-900"></td>
                <td className="py-3 px-3 text-sm text-neutral-900"></td>
                <td className="py-3 px-3 text-sm text-neutral-900"></td>
                <td className="py-3 px-3 text-sm text-neutral-900 uppercase">
                  TOTAL
                </td>
                <td className="py-3 px-3 text-right text-sm text-neutral-900">
                  {formatNumber(grandTotals.numSold)}
                </td>
                <td className="py-3 px-3 text-right text-sm text-neutral-900">
                  {withCurrency(grandTotals.priceSold)}
                </td>
                <td className="py-3 px-3 text-right text-sm text-neutral-900">
                  {withCurrency(grandTotals.amount)}
                </td>
                <td className="py-3 px-3 text-right text-sm text-neutral-900">
                  {withCurrency(grandTotals.cost)}
                </td>
                <td className="py-3 px-3 text-right text-sm text-neutral-900">
                  {withCurrency(grandTotals.profit)}
                </td>
                <td className="py-3 px-3 text-right text-sm text-neutral-900">
                  {formatNumber(grandTotals.foodCostPercent)}%
                </td>
                <td className="py-3 px-3 text-right text-sm text-neutral-900">
                  {formatNumber(grandTotals.salePercent)}%
                </td>
                <td className="py-3 px-3 text-right text-sm text-neutral-900">
                  {withCurrency(grandTotals.discount)}
                </td>
                <td className="py-3 px-3 text-right text-sm text-neutral-900">
                  {withCurrency(grandTotals.tax)}
                </td>
                <td className="py-3 px-3 text-right text-sm text-neutral-900">
                  {withCurrency(grandTotals.serviceCharges)}
                </td>
                <td className="py-3 pr-6 text-right text-sm text-neutral-900">
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
