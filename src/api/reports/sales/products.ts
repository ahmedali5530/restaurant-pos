import {Tables} from "@/api/db/tables.ts";
import type {Dish} from "@/api/model/dish.ts";
import {aggregateTopSellingDishes} from "@/api/reports/sales/aggregate.ts";
import {fetchPaidOrders} from "@/api/reports/sales/fetch.ts";
import {recordToString} from "@/api/reports/shared/records.ts";
import {unwrapQueryResult} from "@/api/reports/shared/query.ts";
import type {DateRangeFilter, DbClient} from "@/api/reports/shared/types.ts";
import {safeNumber} from "@/lib/utils.ts";

export interface ListMenuItemsOptions {
  search?: string;
  limit?: number;
}

export interface MenuItemSummary {
  id: string;
  name: string;
  number?: string;
  price: number;
  categories: string[];
}

export const listMenuItems = async (
  db: DbClient,
  options: ListMenuItemsOptions = {},
): Promise<MenuItemSummary[]> => {
  const limit = Math.min(options.limit ?? 5000, 5000);
  const query = `
    SELECT id, name, number, price FROM ${Tables.dishes}
    WHERE deleted_at = NONE
    ORDER BY name ASC
    LIMIT ${limit}
    FETCH categories
  `;

  const dishes = unwrapQueryResult<Dish>(await db.query(query));
  const search = options.search?.trim().toLowerCase();

  return dishes
    .map(dish => ({
      id: recordToString(dish.id),
      name: dish.name ?? "Unknown",
      number: dish.number,
      price: safeNumber(dish.price),
      categories: (dish.categories ?? []).map(cat =>
        typeof cat === "object" && cat && "name" in cat ? String((cat as {name?: string}).name ?? "") : "",
      ).filter(Boolean),
    }))
    .filter(item => !search || item.name.toLowerCase().includes(search));
};

export interface GetUnsoldProductsOptions extends DateRangeFilter {
  limit?: number;
}

export const getUnsoldProducts = async (
  db: DbClient,
  options: GetUnsoldProductsOptions = {},
) => {
  const {limit = 100, ...dateRange} = options;

  const [menuItems, orders] = await Promise.all([
    listMenuItems(db),
    fetchPaidOrders(db, {
      ...dateRange,
      fetches: ["items", "items.item", "items.item.categories"],
    }),
  ]);

  const soldDishes = aggregateTopSellingDishes(orders);
  const soldIds = new Set<string>();
  const soldNames = new Set<string>();

  soldDishes.forEach(dish => {
    if (dish.dishId) {
      soldIds.add(dish.dishId);
    }
    if (dish.name) {
      soldNames.add(dish.name.trim().toLowerCase());
    }
  });

  const unsoldProducts = menuItems.filter(item => {
    const normalizedName = item.name.trim().toLowerCase();
    return !soldIds.has(item.id) && !soldNames.has(normalizedName);
  });

  return {
    startDate: dateRange.startDate,
    endDate: dateRange.endDate,
    totalMenuItems: menuItems.length,
    soldProductCount: soldDishes.length,
    paidOrderCount: orders.length,
    unsoldCount: unsoldProducts.length,
    unsoldProducts: unsoldProducts.slice(0, Math.min(limit, 500)),
  };
};
