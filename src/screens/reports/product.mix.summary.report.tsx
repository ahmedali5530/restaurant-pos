import {useEffect, useMemo, useRef, useState} from "react";
import {ReportsLayout} from "@/screens/partials/reports.layout.tsx";
import {useDB} from "@/api/db/db.ts";
import {Tables} from "@/api/db/tables.ts";
import {Order} from "@/api/model/order.ts";
import {withCurrency, formatNumber} from "@/lib/utils.ts";
import {calculateOrderItemPrice} from "@/lib/cart.ts";
import {getOrderFilteredItems} from "@/lib/order.ts";

const safeNumber = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

interface ReportFilters {
  startDate?: string;
  endDate?: string;
  orderTakerIds: string[];
  orderTypeIds: string[];
  categoryIds: string[];
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
    startDate: params.get('start') || params.get('start') || undefined,
    endDate: params.get('end') || params.get('end') || undefined,
    orderTakerIds: parseMulti('order_takers'),
    orderTypeIds: parseMulti('order_types'),
    categoryIds: parseMulti('categories'),
    menuItemIds: parseMulti('menu_items'),
  };
};

const recordToString = (value: any): string => {
  if (!value) {
    return '';
  }
  if (typeof value === 'string') {
    return value;
  }
  if (value?.id) {
    return typeof value.id === 'string' ? value.id : value.id.toString();
  }
  return String(value);
};

const collectCategories = (item: any) => {
  if (!item?.item) {
    return [{id: 'uncategorized', name: 'Uncategorized'}];
  }

  const categories = item.item?.categories || [];
  if (Array.isArray(categories) && categories.length > 0) {
    return categories
      .map((cat: any) => ({
        id: recordToString(cat?.id ?? cat),
        name: cat?.name ?? 'Uncategorized',
      }))
      .filter((cat: any) => Boolean(cat.id));
  }

  if (item.category) {
    return [{
      id: item.category,
      name: item.category,
    }];
  }

  return [{id: 'uncategorized', name: 'Uncategorized'}];
};

interface MenuItemMetrics {
  dishId: string;
  itemNumber: string;
  name: string;
  numSold: number;
  priceSold: number; // average price per item
  amount: number; // total sales amount
  cost: number; // total cost
  profit: number;
  foodCostPercent: number;
  salePercent: number;
}

interface CategoryGroup {
  categoryId: string;
  categoryName: string;
  items: MenuItemMetrics[];
  totals: {
    numSold: number;
    priceSold: number;
    amount: number;
    cost: number;
    profit: number;
    foodCostPercent: number;
    salePercent: number;
  };
}

export const ProductMixSummaryReport = () => {
  const db = useDB();
  const queryRef = useRef(db.query);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const filters = useMemo(parseFilters, []);
  const subtitle = filters.startDate && filters.endDate 
    ? `${filters.startDate} to ${filters.endDate}` 
    : undefined;

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

        // Date range filter
        if (filters.startDate) {
          conditions.push(`time::format(created_at, "${import.meta.env.VITE_DB_DATABASE_FORMAT}") >= $startDate`);
          params.startDate = filters.startDate;
        }

        if (filters.endDate) {
          conditions.push(`time::format(created_at, "${import.meta.env.VITE_DB_DATABASE_FORMAT}") <= $endDate`);
          params.endDate = filters.endDate;
        }

        // Order takers filter
        if (filters.orderTakerIds.length > 0) {
          const userIdConditions = filters.orderTakerIds.map((id, index) => {
            const paramName = `user${index}`;
            params[paramName] = id;
            return `user = $${paramName}`;
          });
          conditions.push(`(${userIdConditions.join(' OR ')})`);
        }

        // Order types filter
        if (filters.orderTypeIds.length > 0) {
          const orderTypeConditions = filters.orderTypeIds.map((id, index) => {
            const paramName = `orderType${index}`;
            params[paramName] = id;
            return `order_type = $${paramName}`;
          });
          conditions.push(`(${orderTypeConditions.join(' OR ')})`);
        }

        const ordersQuery = `
          SELECT * FROM ${Tables.orders}
          ${conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''}
          FETCH user, order_type, items, items.item, items.item.categories
        `;

        const ordersResult: any = await queryRef.current(ordersQuery, params);
        setOrders((ordersResult?.[0] ?? []) as Order[]);
      } catch (err) {
        console.error("Failed to load product mix summary report", err);
        setError(err instanceof Error ? err.message : "Unable to load report");
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [filters.startDate, filters.endDate, filters.orderTakerIds.join(','), filters.orderTypeIds.join(',')]);

  // Filter orders by category and menu item
  const filteredOrders = useMemo(() => {
    return orders.filter(order => {
      // Check if order has items matching category filter
      if (filters.categoryIds.length > 0) {
        const hasMatchingCategory = order.items?.some(item => {
          const itemCategories = item.item?.categories || [];
          if (Array.isArray(itemCategories)) {
            return itemCategories.some((cat: any) => {
              const catId = recordToString(cat?.id ?? cat);
              return catId && filters.categoryIds.includes(catId);
            });
          }
          return false;
        });
        if (!hasMatchingCategory) {
          return false;
        }
      }

      // Check if order has items matching menu item filter
      if (filters.menuItemIds.length > 0) {
        const hasMatchingMenuItem = order.items?.some(item => {
          const itemId = recordToString(item.item?.id);
          return itemId && filters.menuItemIds.includes(itemId);
        });
        if (!hasMatchingMenuItem) {
          return false;
        }
      }

      return true;
    });
  }, [orders, filters.categoryIds, filters.menuItemIds]);

  // Get filtered order items
  const getFilteredOrderItems = (order: Order) => {
    return getOrderFilteredItems(order)?.filter(item => {
      // Filter by category
      if (filters.categoryIds.length > 0) {
        const itemCategories = item.item?.categories || [];
        const hasMatchingCategory = Array.isArray(itemCategories)
          ? itemCategories.some((cat: any) => {
              const catId = recordToString(cat?.id ?? cat);
              return catId && filters.categoryIds.includes(catId);
            })
          : false;
        if (!hasMatchingCategory) {
          return false;
        }
      }

      // Filter by menu item
      if (filters.menuItemIds.length > 0) {
        const itemId = recordToString(item.item?.id);
        if (!itemId || !filters.menuItemIds.includes(itemId)) {
          return false;
        }
      }

      return true;
    }) || [];
  };

  // Calculate metrics grouped by category and menu item
  const categoryGroups = useMemo(() => {
    // First, collect all items by dish and category
    const dishMap = new Map<string, {
      dishId: string;
      itemNumber: string;
      name: string;
      categoryId: string;
      categoryName: string;
      numSold: number;
      totalAmount: number;
      totalCost: number;
    }>();

    filteredOrders.forEach(order => {
      const filteredItems = getFilteredOrderItems(order);

      filteredItems.forEach(item => {
        if (!item.item) return;

        const dishId = recordToString(item.item.id);
        const itemNumber = item.item.number || '';
        const name = item.item.name || 'Unknown';
        const categories = collectCategories(item);
        const quantity = safeNumber(item.quantity);
        const itemPrice = calculateOrderItemPrice(item);
        const amount = safeNumber(itemPrice);
        const cost = safeNumber(item.item.cost || 0);
        const totalCost = cost * quantity;

        categories.forEach(category => {
          const key = `${category.id}-${dishId}`;
          const existing = dishMap.get(key) || {
            dishId,
            itemNumber,
            name,
            categoryId: category.id,
            categoryName: category.name,
            numSold: 0,
            totalAmount: 0,
            totalCost: 0,
          };

          existing.numSold += quantity;
          existing.totalAmount += amount;
          existing.totalCost += totalCost;

          dishMap.set(key, existing);
        });
      });
    });

    // Group by category
    const categoryMap = new Map<string, CategoryGroup>();

    dishMap.forEach((dishData) => {
      if (!categoryMap.has(dishData.categoryId)) {
        categoryMap.set(dishData.categoryId, {
          categoryId: dishData.categoryId,
          categoryName: dishData.categoryName,
          items: [],
          totals: {
            numSold: 0,
            priceSold: 0,
            amount: 0,
            cost: 0,
            profit: 0,
            foodCostPercent: 0,
            salePercent: 0,
          },
        });
      }

      const category = categoryMap.get(dishData.categoryId)!;
      const priceSold = dishData.numSold > 0 ? dishData.totalAmount / dishData.numSold : 0;
      const profit = dishData.totalAmount - dishData.totalCost;
      const foodCostPercent = dishData.totalAmount > 0 
        ? (dishData.totalCost / dishData.totalAmount) * 100 
        : 0;

      category.items.push({
        dishId: dishData.dishId,
        itemNumber: dishData.itemNumber,
        name: dishData.name,
        numSold: dishData.numSold,
        priceSold,
        amount: dishData.totalAmount,
        cost: dishData.totalCost,
        profit,
        foodCostPercent,
        salePercent: 0, // Will be calculated later with total sales
      });
    });

    // Calculate total sales for percentage calculation
    const totalSales = Array.from(categoryMap.values()).reduce(
      (sum, cat) => sum + cat.items.reduce((s, item) => s + item.amount, 0),
      0
    );

    // Calculate sale percentages and sort items by amount (for ranking)
    categoryMap.forEach((category) => {
      // Sort items by amount descending for ranking
      category.items.sort((a, b) => b.amount - a.amount);

      // Add rank and calculate sale percent
      category.items.forEach((item) => {
        item.salePercent = totalSales > 0 ? (item.amount / totalSales) * 100 : 0;
      });

      // Calculate category totals
      category.totals = category.items.reduce(
        (acc, item) => ({
          numSold: acc.numSold + item.numSold,
          priceSold: 0, // Average will be calculated
          amount: acc.amount + item.amount,
          cost: acc.cost + item.cost,
          profit: acc.profit + item.profit,
          foodCostPercent: 0, // Will be calculated
          salePercent: acc.salePercent + item.salePercent,
        }),
        {
          numSold: 0,
          priceSold: 0,
          amount: 0,
          cost: 0,
          profit: 0,
          foodCostPercent: 0,
          salePercent: 0,
        }
      );

      category.totals.priceSold = category.totals.numSold > 0
        ? category.totals.amount / category.totals.numSold
        : 0;
      category.totals.foodCostPercent = category.totals.amount > 0
        ? (category.totals.cost / category.totals.amount) * 100
        : 0;
    });

    // Sort categories by total amount descending
    return Array.from(categoryMap.values()).sort((a, b) => b.totals.amount - a.totals.amount);
  }, [filteredOrders, filters.categoryIds, filters.menuItemIds]);

  const grandTotals = useMemo(() => {
    const totals = categoryGroups.reduce(
      (acc, category) => ({
        numSold: acc.numSold + category.totals.numSold,
        amount: acc.amount + category.totals.amount,
        cost: acc.cost + category.totals.cost,
        profit: acc.profit + category.totals.profit,
        salePercent: acc.salePercent + category.totals.salePercent,
      }),
      {
        numSold: 0,
        amount: 0,
        cost: 0,
        profit: 0,
        salePercent: 0,
      }
    );

    return {
      ...totals,
      priceSold: totals.numSold > 0 ? totals.amount / totals.numSold : 0,
      foodCostPercent: totals.amount > 0 ? (totals.cost / totals.amount) * 100 : 0,
    };
  }, [categoryGroups]);

  if (loading) {
    return (
      <ReportsLayout title="Product Mix Summary" subtitle={subtitle}>
        <div className="py-12 text-center text-neutral-500">Loading product mix summary report…</div>
      </ReportsLayout>
    );
  }

  if (error) {
    return (
      <ReportsLayout title="Product Mix Summary" subtitle={subtitle}>
        <div className="py-12 text-center text-red-600">Failed to load report: {error}</div>
      </ReportsLayout>
    );
  }

  return (
    <ReportsLayout title="Product Mix Summary" subtitle={subtitle}>
      <div className="alert alert-warning">This report doesn't include taxes, discounts, service charges, extras and tips</div>
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-neutral-200 border border-neutral-200">
          <thead className="bg-neutral-50">
            <tr>
              <th className="py-3 pl-6 pr-3 text-left text-xs font-semibold text-neutral-700">Rank</th>
              <th className="py-3 px-3 text-left text-xs font-semibold text-neutral-700">Item Number</th>
              <th className="py-3 px-3 text-left text-xs font-semibold text-neutral-700">Name</th>
              <th className="py-3 px-3 text-right text-xs font-semibold text-neutral-700">Num Sold</th>
              <th className="py-3 px-3 text-right text-xs font-semibold text-neutral-700">Price Sold</th>
              <th className="py-3 px-3 text-right text-xs font-semibold text-neutral-700">Amount</th>
              <th className="py-3 px-3 text-right text-xs font-semibold text-neutral-700">Cost</th>
              <th className="py-3 px-3 text-right text-xs font-semibold text-neutral-700">Profit</th>
              <th className="py-3 px-3 text-right text-xs font-semibold text-neutral-700">Food Cost %</th>
              <th className="py-3 pr-6 text-right text-xs font-semibold text-neutral-700">Sale %</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100 bg-white">
            {categoryGroups.flatMap((category) => [
              // Category header row with totals
              <tr key={`category-${category.categoryId}`} className="bg-neutral-200 font-bold border-b-2 border-neutral-400">
                <td className="py-3 pl-6 pr-3 text-sm text-neutral-900"></td>
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
                <td className="py-3 pr-6 text-right text-sm text-neutral-900">
                  {formatNumber(category.totals.salePercent)}%
                </td>
              </tr>,
              // Menu items under category
              ...category.items.map((item, index) => (
                <tr key={`item-${category.categoryId}-${item.dishId}`} className="bg-white hover:bg-neutral-50 border-b border-neutral-100">
                  <td className="py-2 pl-6 pr-3 text-sm text-neutral-600">
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
                  <td className="py-2 pr-6 text-right text-sm text-neutral-600">
                    {formatNumber(item.salePercent)}%
                  </td>
                </tr>
              ))
            ])}
            {categoryGroups.length === 0 && (
              <tr>
                <td colSpan={10} className="py-6 text-center text-sm text-neutral-500">
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
                <td className="py-3 pr-6 text-right text-sm text-neutral-900">
                  {formatNumber(grandTotals.salePercent)}%
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </ReportsLayout>
  );
};
