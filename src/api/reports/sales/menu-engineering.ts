import type {DateRangeFilter, DbClient} from "@/api/reports/shared/types.ts";
import {resolveNaturalDateRange} from "@/api/reports/shared/filters.ts";
import {aggregateProductMixByCategory} from "@/api/reports/sales/aggregate.ts";
import {fetchPaidOrders, PRODUCT_MIX_FETCHES} from "@/api/reports/sales/fetch.ts";
import {safeNumber} from "@/lib/utils.ts";

export type MenuQuadrant = "star" | "plowhorse" | "puzzle" | "dog";

export interface MenuEngineeringItem {
  dishId: string;
  name: string;
  categoryName: string;
  numSold: number;
  amount: number;
  profit: number;
  marginPercent: number;
  popularityPercent: number;
  quadrant: MenuQuadrant;
}

const classifyQuadrant = (
  popularity: number,
  margin: number,
  popMedian: number,
  marginMedian: number,
): MenuQuadrant => {
  const highPop = popularity >= popMedian;
  const highMargin = margin >= marginMedian;
  if (highPop && highMargin) return "star";
  if (highPop && !highMargin) return "plowhorse";
  if (!highPop && highMargin) return "puzzle";
  return "dog";
};

const medianOf = (values: number[]): number => {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
};

export const getMenuEngineeringMatrix = async (
  db: DbClient,
  options: DateRangeFilter = {},
) => {
  const orders = await fetchPaidOrders(db, {
    ...options,
    fetches: PRODUCT_MIX_FETCHES,
  });
  const categories = aggregateProductMixByCategory(orders);
  const flatItems = categories.flatMap(category =>
    category.items.map(item => ({
      dishId: item.dishId,
      name: item.name,
      categoryName: category.categoryName,
      numSold: item.numSold,
      amount: item.amount,
      profit: item.profit,
      marginPercent: item.amount > 0 ? safeNumber((item.profit / item.amount) * 100) : 0,
      popularityPercent: item.salePercent,
    })),
  );

  const popMedian = medianOf(flatItems.map(i => i.popularityPercent));
  const marginMedian = medianOf(flatItems.map(i => i.marginPercent));

  const items: MenuEngineeringItem[] = flatItems.map(item => ({
    ...item,
    quadrant: classifyQuadrant(item.popularityPercent, item.marginPercent, popMedian, marginMedian),
  }));

  const quadrants = {
    stars: items.filter(i => i.quadrant === "star"),
    plowhorses: items.filter(i => i.quadrant === "plowhorse"),
    puzzles: items.filter(i => i.quadrant === "puzzle"),
    dogs: items.filter(i => i.quadrant === "dog"),
  };

  return {
    itemCount: items.length,
    thresholds: {popularityMedian: popMedian, marginMedian},
    quadrants,
    items,
  };
};

export const getMenuSalesTrends = async (
  db: DbClient,
  options: {
    period1?: DateRangeFilter;
    period2?: DateRangeFilter;
    volumeDropPercent?: number;
    highProfitOnly?: boolean;
  } = {},
) => {
  const period1 = options.period1?.startDate
    ? options.period1
    : resolveNaturalDateRange({phrase: "this month"});
  const period2 = options.period2?.startDate
    ? options.period2
    : resolveNaturalDateRange({phrase: "last month"});

  const [orders1, orders2] = await Promise.all([
    fetchPaidOrders(db, {...period1, fetches: PRODUCT_MIX_FETCHES}),
    fetchPaidOrders(db, {...period2, fetches: PRODUCT_MIX_FETCHES}),
  ]);

  const aggregateVolume = (orders: typeof orders1) => {
    const map = new Map<string, {name: string; volume: number; revenue: number; profit: number}>();
    aggregateProductMixByCategory(orders).forEach(category => {
      category.items.forEach(item => {
        const existing = map.get(item.dishId) || {
          name: item.name,
          volume: 0,
          revenue: 0,
          profit: 0,
        };
        existing.volume += item.numSold;
        existing.revenue += item.amount;
        existing.profit += item.profit;
        map.set(item.dishId, existing);
      });
    });
    return map;
  };

  const current = aggregateVolume(orders1);
  const previous = aggregateVolume(orders2);
  const dropThreshold = options.volumeDropPercent ?? 10;

  const trends = Array.from(current.entries()).map(([dishId, cur]) => {
    const prev = previous.get(dishId);
    const prevVolume = prev?.volume ?? 0;
    const volumeChangePercent = prevVolume > 0
      ? safeNumber(((cur.volume - prevVolume) / prevVolume) * 100)
      : cur.volume > 0 ? 100 : 0;
    const marginPercent = cur.revenue > 0 ? safeNumber((cur.profit / cur.revenue) * 100) : 0;
    return {
      dishId,
      name: cur.name,
      currentVolume: cur.volume,
      previousVolume: prevVolume,
      volumeChangePercent,
      currentRevenue: cur.revenue,
      currentProfit: cur.profit,
      marginPercent,
    };
  });

  const profits = trends.map(t => t.marginPercent).sort((a, b) => a - b);
  const profitQ3 = profits[Math.floor(profits.length * 0.75)] ?? 0;

  let filtered = trends.filter(t => t.volumeChangePercent <= -dropThreshold);
  if (options.highProfitOnly !== false) {
    filtered = filtered.filter(t => t.marginPercent >= profitQ3);
  }

  return {
    period1,
    period2,
    volumeDropThreshold: dropThreshold,
    decliningHighProfitItems: filtered.sort((a, b) => a.volumeChangePercent - b.volumeChangePercent),
    allTrends: trends.sort((a, b) => a.volumeChangePercent - b.volumeChangePercent),
  };
};

export const estimatePriceChangeImpact = async (
  db: DbClient,
  options: DateRangeFilter & {priceChangePercent?: number; topN?: number} = {},
) => {
  const priceChangePercent = options.priceChangePercent ?? 5;
  const topN = options.topN ?? 3;
  const range = options.startDate
    ? options
    : resolveNaturalDateRange({phrase: "this week"});

  const orders = await fetchPaidOrders(db, {
    ...range,
    fetches: PRODUCT_MIX_FETCHES,
  });
  const categories = aggregateProductMixByCategory(orders);
  const items = categories
    .flatMap(c => c.items)
    .sort((a, b) => b.numSold - a.numSold)
    .slice(0, topN);

  const multiplier = 1 + priceChangePercent / 100;
  const scenarioItems = items.map(item => {
    const unitPrice = item.numSold > 0 ? safeNumber(item.amount / item.numSold) : 0;
    const unitCost = item.numSold > 0 ? safeNumber(item.cost / item.numSold) : 0;
    const weeklyQty = item.numSold;
    const baselineWeeklyProfit = item.profit;
    const newUnitPrice = unitPrice * multiplier;
    const projectedWeeklyProfit = safeNumber((newUnitPrice - unitCost) * weeklyQty);
    return {
      name: item.name,
      weeklyQuantity: weeklyQty,
      currentUnitPrice: safeNumber(unitPrice),
      currentUnitCost: safeNumber(unitCost),
      baselineWeeklyProfit,
      projectedWeeklyProfit,
      weeklyProfitDelta: safeNumber(projectedWeeklyProfit - baselineWeeklyProfit),
      assumption: "Volume held constant",
    };
  });

  return {
    priceChangePercent,
    baselineDateRange: range,
    assumption: "Volume held constant — no demand elasticity applied.",
    items: scenarioItems,
    totalWeeklyProfitDelta: scenarioItems.reduce((s, i) => s + i.weeklyProfitDelta, 0),
  };
};
