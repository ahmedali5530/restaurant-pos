import {useEffect, useMemo, useRef, useState} from "react";
import { useTranslation } from 'react-i18next';
import {ReportsLayout} from "@/screens/partials/reports.layout.tsx";
import {useDB} from "@/api/db/db.ts";
import {Tables} from "@/api/db/tables.ts";
import {Order} from "@/api/model/order.ts";
import {formatNumber, withCurrency} from "@/lib/utils.ts";
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

interface ReportFilters {
  startDate?: string | null;
  endDate?: string | null;
  itemIds: string[];
  dishIds: string[];
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
    itemIds: parseMulti('items'),
    dishIds: parseMulti('dishes'),
  };
};

interface ConsumptionItem {
  itemId: string;
  itemName: string;
  itemCode?: string;
  uom?: string;
  totalQuantity: number;
  totalSalePrice: number;
  totalCostAverage: number;
  totalCostCurrent: number;
  differenceAverage: number;
  differenceCurrent: number;
}

export const ConsumptionReport = () => {
  const { t } = useTranslation('reports');
  const db = useDB();
  const queryRef = useRef(db.query);
  const [consumptionData, setConsumptionData] = useState<ConsumptionItem[]>([]);
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

        // Fetch orders with items and dishes
        const ordersQuery = `
          SELECT * FROM ${Tables.orders}
          ${conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''}
          ORDER BY created_at ASC
          FETCH items, items.item
        `;

        const ordersResult: any = await queryRef.current(ordersQuery, params);
        const orders = (ordersResult?.[0]?.result ?? ordersResult?.[0] ?? []) as Order[];

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

        // Filter orders by dishes if filter is set
        let filteredOrders = orders;
        if (filters.dishIds.length > 0) {
          filteredOrders = orders.filter(order => {
            return order.items?.some(orderItem => {
              const dishId = recordToString(orderItem.item?.id ?? orderItem.item);
              return filters.dishIds.includes(dishId);
            });
          });
        }

        // Calculate consumption
        const consumptionMap = new Map<string, ConsumptionItem>();

        filteredOrders.forEach(order => {
          order.items?.forEach(orderItem => {
            const dish = orderItem.item;
            if (!dish) return;

            // Filter by dish if filter is set
            if (filters.dishIds.length > 0) {
              const dishId = recordToString(dish.id);
              if (!filters.dishIds.includes(dishId)) {
                return;
              }
            }

            const orderItemQuantity = safeNumber(orderItem.quantity);
            const orderItemPrice = safeNumber(orderItem.price);
            const orderItemSalePrice = orderItemQuantity * orderItemPrice;

            // Get recipes for this dish
            const dishId = recordToString(dish.id);
            const recipes = recipesMap.get(dishId) || [];
            
            // Calculate total recipe cost for proportional allocation
            let totalRecipeCost = 0;
            const recipeCosts = new Map<string, number>();
            
            recipes.forEach((recipe: any) => {
              const inventoryItem = recipe.item;
              if (!inventoryItem) return;
              
              const itemId = recordToString(inventoryItem.id);
              const recipeQuantity = safeNumber(recipe.quantity);
              const recipeCost = safeNumber(recipe.cost);
              const itemCost = recipeQuantity * recipeCost;
              
              recipeCosts.set(itemId, itemCost);
              totalRecipeCost += itemCost;
            });

            // Allocate sale price proportionally based on recipe costs
            recipes.forEach((recipe: any) => {
              const inventoryItem = recipe.item;
              if (!inventoryItem) return;

              const itemId = recordToString(inventoryItem.id);
              
              // Filter by inventory item if filter is set
              if (filters.itemIds.length > 0 && !filters.itemIds.includes(itemId)) {
                return;
              }

              const recipeQuantity = safeNumber(recipe.quantity);
              const consumedQuantity = orderItemQuantity * recipeQuantity;
              
              const averagePrice = safeNumber(inventoryItem.average_price || 0);
              const currentPrice = safeNumber(inventoryItem.price || 0);
              
              const costAverage = consumedQuantity * averagePrice;
              const costCurrent = consumedQuantity * currentPrice;

              // Allocate sale price proportionally
              const recipeCost = recipeCosts.get(itemId) || 0;
              const allocatedSalePrice = totalRecipeCost > 0 
                ? (orderItemSalePrice * recipeCost) / totalRecipeCost 
                : 0;

              // Get or create consumption item
              let consumptionItem = consumptionMap.get(itemId);
              if (!consumptionItem) {
                consumptionItem = {
                  itemId,
                  itemName: inventoryItem.name || 'Unknown',
                  itemCode: inventoryItem.code,
                  uom: inventoryItem.uom,
                  totalQuantity: 0,
                  totalSalePrice: 0,
                  totalCostAverage: 0,
                  totalCostCurrent: 0,
                  differenceAverage: 0,
                  differenceCurrent: 0,
                };
                consumptionMap.set(itemId, consumptionItem);
              }

              // Accumulate values
              consumptionItem.totalQuantity += consumedQuantity;
              consumptionItem.totalSalePrice += allocatedSalePrice;
              consumptionItem.totalCostAverage += costAverage;
              consumptionItem.totalCostCurrent += costCurrent;
            });
          });
        });

        // Calculate differences
        const consumptionItems = Array.from(consumptionMap.values()).map(item => ({
          ...item,
          differenceAverage: item.totalSalePrice - item.totalCostAverage,
          differenceCurrent: item.totalSalePrice - item.totalCostCurrent,
        }));

        // Sort by item name
        consumptionItems.sort((a, b) => a.itemName.localeCompare(b.itemName));

        setConsumptionData(consumptionItems);
      } catch (err) {
        console.error('Failed to load consumption report:', err);
        setError(err instanceof Error ? err.message : t('errors.unableToLoad'));
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [filters.startDate, filters.endDate, filters.itemIds.join(','), filters.dishIds.join(',')]);

  // Calculate totals
  const totals = useMemo(() => {
    return consumptionData.reduce((acc, item) => {
      acc.totalQuantity += item.totalQuantity;
      acc.totalSalePrice += item.totalSalePrice;
      acc.totalCostAverage += item.totalCostAverage;
      acc.totalCostCurrent += item.totalCostCurrent;
      acc.differenceAverage += item.differenceAverage;
      acc.differenceCurrent += item.differenceCurrent;
      return acc;
    }, {
      totalQuantity: 0,
      totalSalePrice: 0,
      totalCostAverage: 0,
      totalCostCurrent: 0,
      differenceAverage: 0,
      differenceCurrent: 0,
    });
  }, [consumptionData]);

  if (loading) {
    return (
      <ReportsLayout title={t('titles.consumption')} subtitle={subtitle}>
        <div className="py-12 text-center text-neutral-500">{t('loading.consumption')}</div>
      </ReportsLayout>
    );
  }

  if (error) {
    return (
      <ReportsLayout title={t('titles.consumption')} subtitle={subtitle}>
        <div className="py-12 text-center text-red-600">{t('errors.failedToLoad', { error })}</div>
      </ReportsLayout>
    );
  }

  return (
    <ReportsLayout
      title={t('titles.consumption')}
      subtitle={subtitle}
    >
      <div className="space-y-8">
        {/* Summary */}
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-neutral-50 p-4 rounded-lg">
            <p className="text-sm text-neutral-600">Total Items</p>
            <p className="text-2xl font-bold text-neutral-900">{formatNumber(consumptionData.length)}</p>
          </div>
          <div className="bg-neutral-50 p-4 rounded-lg">
            <p className="text-sm text-neutral-600">Total Sale Price</p>
            <p className="text-2xl font-bold text-neutral-900">{withCurrency(totals.totalSalePrice)}</p>
          </div>
          <div className="bg-neutral-50 p-4 rounded-lg">
            <p className="text-sm text-neutral-600">Total Cost (Average)</p>
            <p className="text-2xl font-bold text-neutral-900">{withCurrency(totals.totalCostAverage)}</p>
          </div>
        </div>

        {/* Detailed table */}
        <div className="overflow-hidden rounded-lg border border-neutral-200">
          <h3 className="bg-neutral-100 px-6 py-3 text-sm font-semibold text-neutral-700">{t('labels.consumptionDetails')}</h3>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-neutral-200">
              <thead className="bg-neutral-50">
                <tr>
                  <th className="py-3 pl-6 pr-3 text-left text-xs font-semibold text-neutral-700">{t('filters.item')}</th>
                  <th className="py-3 px-3 text-left text-xs font-semibold text-neutral-700">{t('columns.code')}</th>
                  <th className="py-3 px-3 text-right text-xs font-semibold text-neutral-700">{t('columns.quantity')}</th>
                  <th className="py-3 px-3 text-left text-xs font-semibold text-neutral-700">{t('columns.uom')}</th>
                  <th className="py-3 px-3 text-right text-xs font-semibold text-neutral-700">Sale Price</th>
                  <th className="py-3 px-3 text-right text-xs font-semibold text-neutral-700">{t('metrics.costAvg')}</th>
                  <th className="py-3 px-3 text-right text-xs font-semibold text-neutral-700">{t('metrics.costCurrent')}</th>
                  <th className="py-3 px-3 text-right text-xs font-semibold text-neutral-700">{t('metrics.differenceAvg')}</th>
                  <th className="py-3 pr-6 text-right text-xs font-semibold text-neutral-700">{t('metrics.differenceCurrent')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100 bg-white">
                {consumptionData.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-6 text-center text-sm text-neutral-500">
                      No consumption data found for the selected filters
                    </td>
                  </tr>
                ) : (
                  consumptionData.map((item) => (
                    <tr key={item.itemId}>
                      <td className="py-3 pl-6 pr-3 text-sm font-medium text-neutral-900">{item.itemName}</td>
                      <td className="py-3 px-3 text-sm text-neutral-700">{item.itemCode || '-'}</td>
                      <td className="py-3 px-3 text-right text-sm text-neutral-700">{formatNumber(item.totalQuantity)}</td>
                      <td className="py-3 px-3 text-sm text-neutral-700">{item.uom || '-'}</td>
                      <td className="py-3 px-3 text-right text-sm text-neutral-700">{withCurrency(item.totalSalePrice)}</td>
                      <td className="py-3 px-3 text-right text-sm text-neutral-700">{withCurrency(item.totalCostAverage)}</td>
                      <td className="py-3 px-3 text-right text-sm text-neutral-700">{withCurrency(item.totalCostCurrent)}</td>
                      <td className={`py-3 px-3 text-right text-sm font-semibold ${item.differenceAverage >= 0 ? 'text-success-600' : 'text-danger-600'}`}>
                        {withCurrency(item.differenceAverage)}
                      </td>
                      <td className={`py-3 pr-6 text-right text-sm font-semibold ${item.differenceCurrent >= 0 ? 'text-success-600' : 'text-danger-600'}`}>
                        {withCurrency(item.differenceCurrent)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
              {consumptionData.length > 0 && (
                <tfoot className="bg-neutral-50">
                  <tr>
                    <td colSpan={2} className="py-3 pl-6 pr-3 text-sm font-semibold text-neutral-900">{t('columns.total')}</td>
                    <td className="py-3 px-3 text-right text-sm font-bold text-neutral-900">
                      {formatNumber(totals.totalQuantity)}
                    </td>
                    <td colSpan={1}></td>
                    <td className="py-3 px-3 text-right text-sm font-bold text-neutral-900">
                      {withCurrency(totals.totalSalePrice)}
                    </td>
                    <td className="py-3 px-3 text-right text-sm font-bold text-neutral-900">
                      {withCurrency(totals.totalCostAverage)}
                    </td>
                    <td className="py-3 px-3 text-right text-sm font-bold text-neutral-900">
                      {withCurrency(totals.totalCostCurrent)}
                    </td>
                    <td className={`py-3 px-3 text-right text-sm font-bold ${totals.differenceAverage >= 0 ? 'text-success-600' : 'text-danger-600'}`}>
                      {withCurrency(totals.differenceAverage)}
                    </td>
                    <td className={`py-3 pr-6 text-right text-sm font-bold ${totals.differenceCurrent >= 0 ? 'text-success-600' : 'text-danger-600'}`}>
                      {withCurrency(totals.differenceCurrent)}
                    </td>
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

