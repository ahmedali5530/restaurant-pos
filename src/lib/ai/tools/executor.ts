import {normalizeQueryDate, parseDateRangeWithPhrase, resolveNaturalDateRange} from "@/api/reports/shared/filters.ts";
import type {DateRangeFilter, DbClient} from "@/api/reports/shared/types.ts";
import {getProductMix, getSalesSummary, getTopSellingDishes, getUnsoldProducts, listMenuItems} from "@/api/reports/sales";
import {getDiscountSummary} from "@/api/reports/sales/discounts.ts";
import {
  getHourlyProductSales,
  getOrderFinanceSummary,
  getSalesDashboardSnapshot,
  getServerSales,
  getTips,
  getVoids,
  getWeeklySales,
  listCategories,
  listStaff,
} from "@/api/reports/sales/extended.ts";
import {
  getConsumptionSummary,
  getCurrentInventory,
  getInventoryMovements,
  getKitchenReconciliationSummary,
  getSaleVsConsumption,
  getWasteSummary,
  listInventoryItems,
  type InventoryMovementType,
} from "@/api/reports/inventory/index.ts";
import {getOrders} from "@/api/reports/operations/orders.ts";
import {extractOrderStatusesFromArgs, inferOrderStatusesFromPrompt, isOrderListByStatusPrompt} from "@/lib/ai/order-query.ts";
import {
  getActivityLog,
  getCashClosing,
  getExpenses,
  getOrderLifecycleStats,
} from "@/api/reports/operations/index.ts";
import {comparePeriods, getTimeSeries, type TimeSeriesMetric} from "@/api/reports/time-series.ts";
import {forecastFromPoints, forecastInventoryConsumption} from "@/lib/ai/forecast.ts";
import {type AiChartSpec, validateChartSpec, dedupeCharts} from "@/lib/ai/charts.ts";

const hasDateValue = (value: unknown) => {
  if (value === undefined || value === null) {
    return false;
  }

  const trimmed = String(value).trim();
  return trimmed.length > 0 && trimmed !== "undefined" && trimmed !== "null";
};

const parseOptionalDateRangeArgs = (args: Record<string, unknown>): DateRangeFilter => {
  const range: DateRangeFilter = {};

  if (hasDateValue(args.startDate)) {
    range.startDate = normalizeQueryDate(String(args.startDate));
  }

  if (hasDateValue(args.endDate)) {
    range.endDate = normalizeQueryDate(String(args.endDate));
  }

  return range;
};

export interface ExecuteToolContext {
  charts: AiChartSpec[];
}

export const executeAiReportTool = async (
  db: DbClient,
  toolName: string,
  args: Record<string, unknown>,
  context: ExecuteToolContext = {charts: []},
): Promise<unknown> => {
  switch (toolName) {
    case "resolve_date_range": {
      const phrase = String(args.phrase ?? "");
      return resolveNaturalDateRange({phrase});
    }

    case "get_top_selling_dishes": {
      return getTopSellingDishes(db, {
        ...parseOptionalDateRangeArgs(args),
        limit: args.limit ? Number(args.limit) : 10,
        sortBy: (args.sortBy as "revenue" | "quantity" | undefined) ?? "revenue",
      });
    }

    case "get_sales_summary": {
      const summary = await getSalesSummary(db, parseDateRangeWithPhrase(args));

      return {
        totalNetSales: summary.totalNetSales,
        amountDue: summary.paymentSummary.amountDue,
        amountCollected: summary.paymentSummary.amountCollected,
        cashPayments: summary.paymentSummary.cashPayments,
        nonCashPayments: summary.paymentSummary.nonCashPayments,
        nonCashBreakdown: summary.paymentSummary.nonCashBreakdown,
        roundingBenefit: summary.roundingBenefit,
        serviceCharges: summary.serviceCharges,
        taxes: summary.taxes,
        totalDiscounts: summary.totalDiscounts,
        totalCoupons: summary.totalCoupons,
        totalVoids: summary.totalVoids,
        dayPartTotals: summary.dayPartTotals,
        orderTypeBreakdown: summary.orderTypeBreakdown,
        discountRows: summary.discountRows,
      };
    }

    case "get_unsold_products":
      return getUnsoldProducts(db, {
        ...parseDateRangeWithPhrase(args),
        limit: args.limit ? Number(args.limit) : 100,
      });

    case "get_product_mix": {
      const mix = await getProductMix(db, {
        ...parseOptionalDateRangeArgs(args),
        limit: args.limit ? Number(args.limit) : undefined,
      });

      return {
        categories: mix.categories.map(category => ({
          categoryName: category.categoryName,
          totals: category.totals,
          topItems: category.items.slice(0, 5).map(item => ({
            name: item.name,
            numSold: item.numSold,
            amount: item.amount,
            profit: item.profit,
          })),
        })),
        topItems: mix.topItems,
      };
    }

    case "get_voids":
      return getVoids(db, {
        ...parseOptionalDateRangeArgs(args),
        limit: args.limit ? Number(args.limit) : 50,
      });

    case "get_tips":
      return getTips(db, {
        ...parseOptionalDateRangeArgs(args),
        shiftId: args.shiftId ? String(args.shiftId) : undefined,
      });

    case "get_server_sales":
      return getServerSales(db, {
        ...parseOptionalDateRangeArgs(args),
        limit: args.limit ? Number(args.limit) : 20,
      });

    case "get_tax_summary":
      return getOrderFinanceSummary(db, {
        ...parseOptionalDateRangeArgs(args),
        metric: "tax_amount",
      });

    case "get_discount_summary":
      return getDiscountSummary(db, parseDateRangeWithPhrase(args));

    case "get_coupon_summary":
      return getOrderFinanceSummary(db, {
        ...parseOptionalDateRangeArgs(args),
        metric: "coupon_discount",
      });

    case "get_weekly_sales":
      return getWeeklySales(db, parseOptionalDateRangeArgs(args));

    case "get_hourly_product_sales":
      return getHourlyProductSales(db, {
        ...parseOptionalDateRangeArgs(args),
        limit: args.limit ? Number(args.limit) : 20,
      });

    case "get_current_inventory":
      return getCurrentInventory(db, {limit: args.limit ? Number(args.limit) : 100});

    case "get_inventory_movements":
      return getInventoryMovements(db, {
        ...parseOptionalDateRangeArgs(args),
        type: String(args.type) as InventoryMovementType,
        limit: args.limit ? Number(args.limit) : 50,
      });

    case "get_consumption":
      return getConsumptionSummary(db, {
        ...parseOptionalDateRangeArgs(args),
        limit: args.limit ? Number(args.limit) : 50,
      });

    case "get_waste_summary":
      return getWasteSummary(db, {
        ...parseOptionalDateRangeArgs(args),
        limit: args.limit ? Number(args.limit) : 50,
      });

    case "get_sale_vs_consumption":
      return getSaleVsConsumption(db, parseOptionalDateRangeArgs(args));

    case "get_kitchen_reconciliation":
      return getKitchenReconciliationSummary(db, {
        ...parseOptionalDateRangeArgs(args),
        limit: args.limit ? Number(args.limit) : 20,
      });

    case "get_expenses":
      return getExpenses(db, parseOptionalDateRangeArgs(args));

    case "get_activity_log":
      return getActivityLog(db, {
        ...parseOptionalDateRangeArgs(args),
        limit: args.limit ? Number(args.limit) : 50,
      });

    case "get_cash_closing":
      return getCashClosing(db, {date: args.date ? String(args.date) : undefined});

    case "get_orders":
      return getOrders(db, {
        ...parseOptionalDateRangeArgs(args),
        statuses: extractOrderStatusesFromArgs(args),
        deliveryOnly: args.deliveryOnly === true || args.deliveryOnly === "true",
        limit: args.limit ? Number(args.limit) : 50,
      });

    case "get_order_lifecycle":
      return getOrderLifecycleStats(db, parseOptionalDateRangeArgs(args));

    case "get_time_series":
      return getTimeSeries(db, {
        ...parseOptionalDateRangeArgs(args),
        metric: String(args.metric) as TimeSeriesMetric,
        granularity: (args.granularity as "daily" | "weekly" | "hourly" | undefined) ?? "daily",
      });

    case "forecast_sales": {
      const points = (args.points as Array<{period: string; value: number}>) ?? [];
      const forecastDays = args.forecastDays ? Number(args.forecastDays) : 7;
      const method = (args.method as "linear_regression" | "moving_average" | "exponential_smoothing") ?? "linear_regression";
      return forecastFromPoints(
        points.map(p => ({period: p.period, value: p.value})),
        forecastDays,
        method,
      );
    }

    case "forecast_inventory": {
      const consumptionPoints = (args.consumptionPoints as Array<{period: string; value: number}>) ?? [];
      return forecastInventoryConsumption(
        Number(args.currentStock ?? 0),
        consumptionPoints.map(p => ({period: p.period, value: p.value})),
        args.forecastDays ? Number(args.forecastDays) : 14,
        args.reorderLevel ? Number(args.reorderLevel) : undefined,
      );
    }

    case "compare_periods":
      return comparePeriods(db, {
        metric: String(args.metric) as Parameters<typeof comparePeriods>[1]["metric"],
        period1: {
          startDate: normalizeQueryDate(String(args.period1Start)),
          endDate: normalizeQueryDate(String(args.period1End)),
        },
        period2: {
          startDate: normalizeQueryDate(String(args.period2Start)),
          endDate: normalizeQueryDate(String(args.period2End)),
        },
      });

    case "get_dashboard_snapshot":
      return getSalesDashboardSnapshot(db, parseOptionalDateRangeArgs(args));

    case "render_chart": {
      const spec = validateChartSpec(args);
      const next = dedupeCharts([...context.charts, spec]);
      context.charts.length = 0;
      context.charts.push(...next);
      return {success: true, chartId: spec.id, message: `Chart "${spec.title}" registered.`};
    }

    case "list_staff":
      return listStaff(db, {
        search: args.search ? String(args.search) : undefined,
        limit: args.limit ? Number(args.limit) : 50,
      });

    case "list_categories":
      return listCategories(db, {limit: args.limit ? Number(args.limit) : 50});

    case "list_menu_items":
      return listMenuItems(db, {
        search: args.search ? String(args.search) : undefined,
        limit: args.limit ? Number(args.limit) : 500,
      });

    case "list_inventory_items":
      return listInventoryItems(db, {
        search: args.search ? String(args.search) : undefined,
        limit: args.limit ? Number(args.limit) : 50,
      });

    default:
      throw new Error(`Unknown tool: ${toolName}`);
  }
};
