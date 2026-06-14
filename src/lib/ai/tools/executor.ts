import {normalizeQueryDate, resolveNaturalDateRange} from "@/api/reports/shared/filters.ts";
import type {DateRangeFilter, DbClient} from "@/api/reports/shared/types.ts";
import {getProductMix, getSalesSummary, getTopSellingDishes} from "@/api/reports/sales";

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

export const executeAiReportTool = async (
  db: DbClient,
  toolName: string,
  args: Record<string, unknown>,
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
      const summary = await getSalesSummary(db, parseOptionalDateRangeArgs(args));

      return {
        totalNetSales: summary.totalNetSales,
        amountCollected: summary.paymentSummary.amountCollected,
        cashPayments: summary.paymentSummary.cashPayments,
        nonCashPayments: summary.paymentSummary.nonCashPayments,
        serviceCharges: summary.serviceCharges,
        taxes: summary.taxes,
        totalDiscounts: summary.totalDiscounts,
        totalCoupons: summary.totalCoupons,
        totalVoids: summary.totalVoids,
        orderTypeBreakdown: summary.orderTypeBreakdown,
        discountRows: summary.discountRows,
      };
    }

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

    default:
      throw new Error(`Unknown tool: ${toolName}`);
  }
};
