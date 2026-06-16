import type {DateRangeFilter, DbClient, ProductMixFilters} from "@/api/reports/shared/types.ts";
import {
  aggregateProductMixByCategory,
  aggregateSalesSummary,
  aggregateTopSellingDishes,
} from "@/api/reports/sales/aggregate.ts";
import {
  fetchDashboardOrders,
  fetchOrderVoids,
  fetchOrders,
  fetchPaidOrders,
  PRODUCT_MIX_FETCHES,
  SALES_SUMMARY_FETCHES,
} from "@/api/reports/sales/fetch.ts";

export {
  aggregateAccumulatedModifiersSummary,
  aggregateModifiersSummary,
  aggregateProductMixByCategory,
  aggregateSalesSummary,
  aggregateTopSellingDishes,
  calculateOrderNetSales,
  getOrderFigures,
} from "@/api/reports/sales/aggregate.ts";

export {
  fetchDashboardOrders,
  fetchOrderVoids,
  fetchOrders,
  fetchPaidOrders,
  PRODUCT_MIX_FETCHES,
  SALES_SUMMARY_FETCHES,
} from "@/api/reports/sales/fetch.ts";

export const getTopSellingDishes = async (
  db: DbClient,
  options: DateRangeFilter & {limit?: number; sortBy?: "quantity" | "revenue"},
) => {
  const {limit, sortBy, ...dateRange} = options;
  const orders = await fetchPaidOrders(db, {...dateRange, fetches: ["items", "items.item"]});
  return aggregateTopSellingDishes(orders, {limit, sortBy});
};

export const getSalesSummary = async (
  db: DbClient,
  options: DateRangeFilter,
) => {
  const [orders, voids] = await Promise.all([
    fetchPaidOrders(db, {...options, fetches: SALES_SUMMARY_FETCHES}),
    fetchOrderVoids(db, options),
  ]);
  return aggregateSalesSummary(orders, voids);
};

export const getProductMix = async (
  db: DbClient,
  options: DateRangeFilter & ProductMixFilters & {limit?: number},
) => {
  const {limit, categoryIds, menuItemIds, ...dateRange} = options;
  const orders = await fetchOrders(db, {
    ...dateRange,
    fetches: PRODUCT_MIX_FETCHES,
    paidOnly: true,
  });

  const categoryGroups = aggregateProductMixByCategory(orders, {categoryIds, menuItemIds});

  if (!limit) {
    return {categories: categoryGroups};
  }

  const topItems = categoryGroups
    .flatMap(category => category.items.map(item => ({
      ...item,
      categoryName: category.categoryName,
    })))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, limit);

  return {categories: categoryGroups, topItems};
};
