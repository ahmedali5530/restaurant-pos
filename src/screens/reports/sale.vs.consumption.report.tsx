import {useEffect, useMemo, useRef, useState} from "react";
import { useTranslation } from 'react-i18next';
import {ReportsLayout} from "@/screens/partials/reports.layout.tsx";
import {useDB} from "@/api/db/db.ts";
import {Tables} from "@/api/db/tables.ts";
import {Order} from "@/api/model/order.ts";
import {formatNumber, withCurrency} from "@/lib/utils.ts";
import {calculateOrderItemPrice} from "@/lib/cart.ts";
import {StringRecordId} from "surrealdb";

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

const calculateOrderNetSales = (order: Order): number => {
  const grossTotal = order.items?.reduce((sum, item) => sum + calculateOrderItemPrice(item), 0) ?? 0;
  const lineDiscounts = order.items?.reduce((sum, item) => sum + safeNumber(item?.discount), 0) ?? 0;
  const orderDiscount = safeNumber(order.discount_amount);
  const extraDiscount = Math.max(0, orderDiscount - lineDiscounts);
  const net = grossTotal - lineDiscounts - extraDiscount;
  return net > 0 ? net : 0;
};

interface ReportFilters {
  startDate?: string | null;
  endDate?: string | null;
}

const parseFilters = (): ReportFilters => {
  const params = new URLSearchParams(window.location.search);
  return {
    startDate: params.get('start') || params.get('start'),
    endDate: params.get('end') || params.get('end'),
  };
};

interface ReportData {
  saleTotal: number;
  consumptionTotal: number;
  consumptionProfit: number;
  consumptionProfitPercent: number;
  issuanceTotal: number;
  issuanceProfit: number;
  issuanceProfitPercent: number;
  purchaseTotal: number;
  purchaseProfit: number;
  purchaseProfitPercent: number;
}

export const SaleVsConsumptionReport = () => {
  const { t } = useTranslation('reports');
  const db = useDB();
  const queryRef = useRef(db.query);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const filters = useMemo(parseFilters, []);
  const subtitle = filters.startDate && filters.endDate ? `${filters.startDate} to ${filters.endDate}` : undefined;

  useEffect(() => {
    queryRef.current = db.query;
  }, [db]);

  const [data, setData] = useState<ReportData | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        setError(null);

        const conditions: string[] = [];
        const params: Record<string, string> = {};

        if (filters.startDate) {
          conditions.push(`time::format(created_at, "${import.meta.env.VITE_DB_DATABASE_FORMAT}") >= $startDate`);
          params.startDate = filters.startDate;
        }

        if (filters.endDate) {
          conditions.push(`time::format(created_at, "${import.meta.env.VITE_DB_DATABASE_FORMAT}") <= $endDate`);
          params.endDate = filters.endDate;
        }

        // Fetch orders
        const ordersQuery = `
          SELECT * FROM ${Tables.orders}
          WHERE status = 'Paid'
          ${conditions.length ? `AND ${conditions.join(' AND ')}` : ''}
          FETCH items, items.item
        `;

        // Fetch issues
        const issuanceQuery = `
          SELECT * FROM ${Tables.inventory_issues}
          ${conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''}
          FETCH items
        `;

        // Fetch purchases
        const purchaseQuery = `
          SELECT * FROM ${Tables.inventory_purchases}
          ${conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''}
          FETCH items
        `;

        const [ordersResult, issuanceResult, purchaseResult]: any = await Promise.all([
          queryRef.current(ordersQuery, params),
          queryRef.current(issuanceQuery, params),
          queryRef.current(purchaseQuery, params),
        ]);

        const orders = (ordersResult?.[0]?.result ?? ordersResult?.[0] ?? []) as Order[];
        const issues = (issuanceResult?.[0]?.result ?? issuanceResult?.[0] ?? []) as any[];
        const purchases = (purchaseResult?.[0]?.result ?? purchaseResult?.[0] ?? []) as any[];

        // Calculate total sales
        const saleTotal = orders.reduce((sum, order) => sum + calculateOrderNetSales(order), 0);

        // Fetch recipes for all dishes
        const dishIds = new Set<string>();
        orders.forEach(order => {
          order.items?.forEach(orderItem => {
            if (orderItem.item?.id) {
              const dishId = recordToString(orderItem.item.id);
              dishIds.add(dishId);
            }
          });
        });

        const recipesMap = new Map<string, any[]>();
        if (dishIds.size > 0) {
          const dishIdsArray = Array.from(dishIds);
          for (const dishId of dishIdsArray) {
            try {
              const recipesQuery = `
                SELECT * FROM ${Tables.dishes_recipes}
                WHERE menu_item = $dishId
                FETCH item
              `;
              const recipesResult: any = await queryRef.current(recipesQuery, { dishId: new StringRecordId(dishId) });
              const recipes = (recipesResult?.[0]?.result ?? recipesResult?.[0] ?? []) as any[];
              if (recipes.length > 0) {
                recipesMap.set(dishId, recipes);
              }
            } catch (err) {
              console.warn(`Failed to fetch recipes for dish ${dishId}:`, err);
            }
          }
        }

        // Calculate total consumption costs (using average price)
        let consumptionTotal = 0;

        orders.forEach(order => {
          order.items?.forEach(orderItem => {
            const dish = orderItem.item;
            if (!dish) return;

            const orderItemQuantity = safeNumber(orderItem.quantity);
            const dishId = recordToString(dish.id);
            const recipes = recipesMap.get(dishId) || [];

            recipes.forEach((recipe: any) => {
              const inventoryItem = recipe.item;
              if (!inventoryItem) return;

              const recipeQuantity = safeNumber(recipe.quantity);
              const consumedQuantity = orderItemQuantity * recipeQuantity;
              const averagePrice = safeNumber(inventoryItem.average_price || 0);
              consumptionTotal += consumedQuantity * averagePrice;
            });
          });
        });

        // Calculate total issuance costs
        const issuanceTotal = issues.reduce((sum, issue) => {
          return sum + (issue.items || []).reduce((itemSum: number, item: any) => {
            const quantity = safeNumber(item.quantity);
            const price = safeNumber(item.price);
            return itemSum + (quantity * price);
          }, 0);
        }, 0);

        // Calculate total purchase costs
        const purchaseTotal = purchases.reduce((sum, purchase) => {
          return sum + (purchase.items || []).reduce((itemSum: number, item: any) => {
            const quantity = safeNumber(item.quantity);
            const price = safeNumber(item.price);
            return itemSum + (quantity * price);
          }, 0);
        }, 0);

        // Calculate profits
        const consumptionProfit = saleTotal - consumptionTotal;
        const consumptionProfitPercent = saleTotal > 0 ? (consumptionProfit / saleTotal) * 100 : 0;

        const issuanceProfit = saleTotal - issuanceTotal;
        const issuanceProfitPercent = saleTotal > 0 ? (issuanceProfit / saleTotal) * 100 : 0;

        const purchaseProfit = saleTotal - purchaseTotal;
        const purchaseProfitPercent = saleTotal > 0 ? (purchaseProfit / saleTotal) * 100 : 0;

        setData({
          saleTotal,
          consumptionTotal,
          consumptionProfit,
          consumptionProfitPercent,
          issuanceTotal,
          issuanceProfit,
          issuanceProfitPercent,
          purchaseTotal,
          purchaseProfit,
          purchaseProfitPercent,
        });
      } catch (err) {
        console.error('Failed to load sale vs consumption report:', err);
        setError(err instanceof Error ? err.message : t('errors.unableToLoad'));
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [filters.startDate, filters.endDate]);

  if (loading) {
    return (
      <ReportsLayout title={t('titles.saleVsConsumption')} subtitle={subtitle}>
        <div className="py-12 text-center text-neutral-500">{t('loading.generic')}</div>
      </ReportsLayout>
    );
  }

  if (error) {
    return (
      <ReportsLayout title={t('titles.saleVsConsumption')} subtitle={subtitle}>
        <div className="py-12 text-center text-red-600">{t('errors.failedToLoad', { error })}</div>
      </ReportsLayout>
    );
  }

  if (!data) {
    return (
      <ReportsLayout title={t('titles.saleVsConsumption')} subtitle={subtitle}>
        <div className="py-12 text-center text-neutral-500">No data available</div>
      </ReportsLayout>
    );
  }

  return (
    <ReportsLayout
      title={t('titles.saleVsConsumption')}
      subtitle={subtitle}
    >
      <div className="space-y-8">
        {/* Sale vs Consumption */}
        <div className="overflow-hidden rounded-lg border border-neutral-200">
          <h3 className="bg-neutral-100 px-6 py-3 text-sm font-semibold text-neutral-700">Sale vs Consumption</h3>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-neutral-200">
              <thead className="bg-neutral-50">
                <tr>
                  <th className="py-3 pl-6 pr-3 text-left text-xs font-semibold text-neutral-700">Metric</th>
                  <th className="py-3 px-3 text-right text-xs font-semibold text-neutral-700">{t('columns.amount')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100 bg-white">
                <tr>
                  <td className="py-3 pl-6 pr-3 text-sm font-medium text-neutral-900">Sale Total</td>
                  <td className="py-3 px-3 text-right text-sm text-neutral-700">{withCurrency(data.saleTotal)}</td>
                </tr>
                <tr>
                  <td className="py-3 pl-6 pr-3 text-sm font-medium text-neutral-900">{t('labels.consumptionTotal')}</td>
                  <td className="py-3 px-3 text-right text-sm text-neutral-700">{withCurrency(data.consumptionTotal)}</td>
                </tr>
                <tr>
                  <td className="py-3 pl-6 pr-3 text-sm font-medium text-neutral-900">{t('labels.estimatedProfit')}</td>
                  <td className={`py-3 px-3 text-right text-sm font-semibold ${data.consumptionProfit >= 0 ? 'text-success-600' : 'text-danger-600'}`}>
                    {withCurrency(data.consumptionProfit)}
                  </td>
                </tr>
                <tr>
                  <td className="py-3 pl-6 pr-3 text-sm font-medium text-neutral-900">Profit Percent</td>
                  <td className={`py-3 px-3 text-right text-sm font-semibold ${data.consumptionProfitPercent >= 0 ? 'text-success-600' : 'text-danger-600'}`}>
                    {formatNumber(data.consumptionProfitPercent)}%
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Sale vs Inventory (Issuance) */}
        <div className="overflow-hidden rounded-lg border border-neutral-200">
          <h3 className="bg-neutral-100 px-6 py-3 text-sm font-semibold text-neutral-700">Sale vs Inventory (Issuance)</h3>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-neutral-200">
              <thead className="bg-neutral-50">
                <tr>
                  <th className="py-3 pl-6 pr-3 text-left text-xs font-semibold text-neutral-700">Metric</th>
                  <th className="py-3 px-3 text-right text-xs font-semibold text-neutral-700">{t('columns.amount')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100 bg-white">
                <tr>
                  <td className="py-3 pl-6 pr-3 text-sm font-medium text-neutral-900">Sale Total</td>
                  <td className="py-3 px-3 text-right text-sm text-neutral-700">{withCurrency(data.saleTotal)}</td>
                </tr>
                <tr>
                  <td className="py-3 pl-6 pr-3 text-sm font-medium text-neutral-900">{t('labels.issuanceTotal')}</td>
                  <td className="py-3 px-3 text-right text-sm text-neutral-700">{withCurrency(data.issuanceTotal)}</td>
                </tr>
                <tr>
                  <td className="py-3 pl-6 pr-3 text-sm font-medium text-neutral-900">{t('labels.estimatedProfit')}</td>
                  <td className={`py-3 px-3 text-right text-sm font-semibold ${data.issuanceProfit >= 0 ? 'text-success-600' : 'text-danger-600'}`}>
                    {withCurrency(data.issuanceProfit)}
                  </td>
                </tr>
                <tr>
                  <td className="py-3 pl-6 pr-3 text-sm font-medium text-neutral-900">Profit Percent</td>
                  <td className={`py-3 px-3 text-right text-sm font-semibold ${data.issuanceProfitPercent >= 0 ? 'text-success-600' : 'text-danger-600'}`}>
                    {formatNumber(data.issuanceProfitPercent)}%
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Sale vs Purchase */}
        <div className="overflow-hidden rounded-lg border border-neutral-200">
          <h3 className="bg-neutral-100 px-6 py-3 text-sm font-semibold text-neutral-700">Sale vs Purchase</h3>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-neutral-200">
              <thead className="bg-neutral-50">
                <tr>
                  <th className="py-3 pl-6 pr-3 text-left text-xs font-semibold text-neutral-700">Metric</th>
                  <th className="py-3 px-3 text-right text-xs font-semibold text-neutral-700">{t('columns.amount')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100 bg-white">
                <tr>
                  <td className="py-3 pl-6 pr-3 text-sm font-medium text-neutral-900">Sale Total</td>
                  <td className="py-3 px-3 text-right text-sm text-neutral-700">{withCurrency(data.saleTotal)}</td>
                </tr>
                <tr>
                  <td className="py-3 pl-6 pr-3 text-sm font-medium text-neutral-900">Purchase Total</td>
                  <td className="py-3 px-3 text-right text-sm text-neutral-700">{withCurrency(data.purchaseTotal)}</td>
                </tr>
                <tr>
                  <td className="py-3 pl-6 pr-3 text-sm font-medium text-neutral-900">{t('labels.estimatedProfit')}</td>
                  <td className={`py-3 px-3 text-right text-sm font-semibold ${data.purchaseProfit >= 0 ? 'text-success-600' : 'text-danger-600'}`}>
                    {withCurrency(data.purchaseProfit)}
                  </td>
                </tr>
                <tr>
                  <td className="py-3 pl-6 pr-3 text-sm font-medium text-neutral-900">Profit Percent</td>
                  <td className={`py-3 px-3 text-right text-sm font-semibold ${data.purchaseProfitPercent >= 0 ? 'text-success-600' : 'text-danger-600'}`}>
                    {formatNumber(data.purchaseProfitPercent)}%
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </ReportsLayout>
  );
};
