import type {DbClient} from "@/api/reports/shared/types.ts";
import {getHourlyLaborVsSales} from "@/api/reports/labor/hourly.ts";
import {getCashSettlementAudit} from "@/api/reports/operations/cash-audit.ts";
import {
  getKitchenStationDelays,
  getPrepTimesByOrderType,
} from "@/api/reports/operations/kitchen-timing.ts";
import {getVoidAndCancelSummary} from "@/api/reports/operations/void-cancel.ts";
import {getDiscountSummary} from "@/api/reports/sales/discounts.ts";
import {
  estimatePriceChangeImpact,
  getMenuEngineeringMatrix,
  getMenuSalesTrends,
} from "@/api/reports/sales/menu-engineering.ts";
import {
  getServerTicketTimes,
  getStaffAccountabilityMetrics,
} from "@/api/reports/sales/server-analytics.ts";
import {
  isCashAuditPrompt,
  isHourlyLaborPrompt,
  isKitchenDelayPrompt,
  isMenuEngineeringPrompt,
  isMenuTrendPrompt,
  isPrepTimePrompt,
  isPriceImpactPrompt,
  isServerTicketTimePrompt,
  isStaffAccountabilityPrompt,
  isVoidCancelSummaryPrompt,
  isPromotionalDiscountPrompt,
  resolveAnalyticsToolName,
  resolvePromptDateRange,
} from "@/lib/ai/analytics-query.ts";

export interface AnalyticsFastPathResult {
  toolName: string;
  args: Record<string, unknown>;
  data: unknown;
  hint: string;
}

export const tryAnalyticsFastPath = async (
  db: DbClient,
  prompt: string,
): Promise<AnalyticsFastPathResult | null> => {
  const dateRange = resolvePromptDateRange(prompt);

  if (isServerTicketTimePrompt(prompt)) {
    const data = await getServerTicketTimes(db, {...dateRange, limit: 3});
    return {
      toolName: "get_server_ticket_times",
      args: {...dateRange, limit: 3},
      data,
      hint: "Ticket time = created_at to completed_at. Report fastest, slowest, and lowestTurnaroundHighestCheck if relevant.",
    };
  }

  if (isStaffAccountabilityPrompt(prompt)) {
    const data = await getStaffAccountabilityMetrics(db, dateRange);
    return {
      toolName: "get_staff_accountability_metrics",
      args: {...dateRange} as Record<string, unknown>,
      data,
      hint: "Highlight flaggedStaff and compare rates to teamAverages.",
    };
  }

  if (isMenuEngineeringPrompt(prompt)) {
    const data = await getMenuEngineeringMatrix(db, dateRange);
    return {
      toolName: "get_menu_engineering_matrix",
      args: {...dateRange} as Record<string, unknown>,
      data,
      hint: "Focus on plowhorses and puzzles quadrants if asked. Explain thresholds used.",
    };
  }

  if (isMenuTrendPrompt(prompt)) {
    const data = await getMenuSalesTrends(db, {volumeDropPercent: 10, highProfitOnly: true});
    return {
      toolName: "get_menu_sales_trends",
      args: {volumeDropPercent: 10},
      data,
      hint: "List decliningHighProfitItems with volumeChangePercent.",
    };
  }

  if (isPriceImpactPrompt(prompt)) {
    const match = prompt.match(/(\d+)\s*%/);
    const priceChangePercent = match ? Number(match[1]) : 5;
    const data = await estimatePriceChangeImpact(db, {...dateRange, priceChangePercent, topN: 3});
    return {
      toolName: "estimate_price_change_impact",
      args: {...dateRange, priceChangePercent, topN: 3},
      data,
      hint: "State assumption: volume held constant. Report totalWeeklyProfitDelta.",
    };
  }

  if (isVoidCancelSummaryPrompt(prompt)) {
    const data = await getVoidAndCancelSummary(db, dateRange);
    return {
      toolName: "get_void_and_cancel_summary",
      args: {...dateRange} as Record<string, unknown>,
      data,
      hint: "Summarize combinedReasons by type (void, cancellation, comp).",
    };
  }

  if (isPromotionalDiscountPrompt(prompt)) {
    const data = await getDiscountSummary(db, {
      ...dateRange,
      billPercentThreshold: 20,
    });
    return {
      toolName: "get_discount_summary",
      args: {...dateRange, billPercentThreshold: 20},
      data,
      hint: "Highlight exceededBillPercentThreshold entries.",
    };
  }

  if (isHourlyLaborPrompt(prompt)) {
    const hourPhrase = /\bpeak\s+hours?\b/i.test(prompt) ? "peak hours" : undefined;
    const data = await getHourlyLaborVsSales(db, {...dateRange, hourPhrase});
    return {
      toolName: "get_hourly_labor_vs_sales",
      args: {...dateRange, hourPhrase},
      data,
      hint: "Highlight overStaffingWindows where laborPercent is high vs sales.",
    };
  }

  if (isPrepTimePrompt(prompt)) {
    const data = await getPrepTimesByOrderType(db, dateRange);
    return {
      toolName: "get_prep_times_by_order_type",
      args: {...dateRange} as Record<string, unknown>,
      data,
      hint: "Compare delivery vs dine-in using metricNote (ticket time).",
    };
  }

  if (isKitchenDelayPrompt(prompt)) {
    const hourPhrase = /\b(7\s*pm|peak)\b/i.test(prompt) ? "peak hours" : "7 PM - 9 PM";
    const data = await getKitchenStationDelays(db, {...dateRange, hourPhrase});
    return {
      toolName: "get_kitchen_station_delays",
      args: {...dateRange, hourPhrase},
      data,
      hint: "Report slowest byKitchen and byCategory during peak hours.",
    };
  }

  if (isCashAuditPrompt(prompt)) {
    const data = await getCashSettlementAudit(db, dateRange);
    return {
      toolName: "get_cash_settlement_audit",
      args: {...dateRange} as Record<string, unknown>,
      data,
      hint: "List cash orders with modifications before close.",
    };
  }

  return null;
};
