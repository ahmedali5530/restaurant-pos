import {resolveNaturalDateRange} from "@/api/reports/shared/filters.ts";
import type {DateRangeFilter} from "@/api/reports/shared/types.ts";

export const isServerTicketTimePrompt = (prompt: string): boolean => {
  const mentionsSpeed = /\b(fastest|slowest|ticket\s*time|turn[\s-]?around|speed)\b/i.test(prompt);
  const mentionsServer = /\b(servers?|order\s*takers?)\b/i.test(prompt);
  const turnaroundCheck = /\bturn[\s-]?around\b/i.test(prompt)
    && /\b(average\s+check|avg\s+check)\b/i.test(prompt);
  return (mentionsSpeed && mentionsServer) || turnaroundCheck;
};

export const isStaffAccountabilityPrompt = (prompt: string): boolean => {
  return /\b(voids?|discounts?|deleted\s+items?)\b/i.test(prompt)
    && /\b(order\s*takers?|servers?|staff|team\s+average|unusually\s+high)\b/i.test(prompt);
};

export const isMenuEngineeringPrompt = (prompt: string): boolean => {
  return /\b(menu\s+engineering|plowhorses?|puzzles?|stars?|dogs?)\b/i.test(prompt)
    || (/\b(high|low)\s+(popularity|margin)\b/i.test(prompt) && /\bmenu\b/i.test(prompt));
};

export const isMenuTrendPrompt = (prompt: string): boolean => {
  return /\b(drop|declin|month[\s-]?over[\s-]?month|mom)\b/i.test(prompt)
    && /\b(sales\s+volume|volume|dishes?|products?)\b/i.test(prompt);
};

export const isPriceImpactPrompt = (prompt: string): boolean => {
  return /\b(price\s+adjust(?:ment)?|price\s+increase|price\s+change)\b/i.test(prompt)
    && /\b(profit|volume|impact)\b/i.test(prompt);
};

export const isHourlyLaborPrompt = (prompt: string): boolean => {
  return /\b(labor\s+cost|labour\s+cost|labor\s*%|labour\s*%|over[\s-]?staff)\b/i.test(prompt)
    && /\b(hour|hourly)\b/i.test(prompt);
};

export const isPrepTimePrompt = (prompt: string): boolean => {
  return /\b(prep|preparation|delay|ticket\s*time)\b/i.test(prompt)
    && /\b(delivery|dine[\s-]?in|order\s+type)\b/i.test(prompt);
};

export const isKitchenDelayPrompt = (prompt: string): boolean => {
  return /\b(kitchen|station|category)\b/i.test(prompt)
    && /\b(delay|slowest|longest)\b/i.test(prompt);
};

export const isCashAuditPrompt = (prompt: string): boolean => {
  return /\bcash\b/i.test(prompt)
    && /\b(modified|removed|before\s+clos|settled)\b/i.test(prompt);
};

export const isVoidCancelSummaryPrompt = (prompt: string): boolean => {
  return /\b(cancel|comp|void)\b/i.test(prompt)
    && /\b(reasons?|summar)\b/i.test(prompt);
};

export const isPromotionalDiscountPrompt = (prompt: string): boolean => {
  return /\bpromotional\b/i.test(prompt) && /\bdiscount/i.test(prompt);
};

export const resolveAnalyticsToolName = (prompt: string): string | null => {
  if (isServerTicketTimePrompt(prompt)) return "get_server_ticket_times";
  if (isStaffAccountabilityPrompt(prompt)) return "get_staff_accountability_metrics";
  if (isMenuEngineeringPrompt(prompt)) return "get_menu_engineering_matrix";
  if (isMenuTrendPrompt(prompt)) return "get_menu_sales_trends";
  if (isPriceImpactPrompt(prompt)) return "estimate_price_change_impact";
  if (isVoidCancelSummaryPrompt(prompt)) return "get_void_and_cancel_summary";
  if (isPromotionalDiscountPrompt(prompt)) return "get_discount_summary";
  if (isHourlyLaborPrompt(prompt)) return "get_hourly_labor_vs_sales";
  if (isPrepTimePrompt(prompt)) return "get_prep_times_by_order_type";
  if (isKitchenDelayPrompt(prompt)) return "get_kitchen_station_delays";
  if (isCashAuditPrompt(prompt)) return "get_cash_settlement_audit";
  return null;
};

export const resolvePromptDateRange = (prompt: string): DateRangeFilter => {
  if (/\blast\s+friday\b/i.test(prompt)) {
    return resolveNaturalDateRange({phrase: "last friday"});
  }
  if (/\btoday\b/i.test(prompt)) {
    return resolveNaturalDateRange({phrase: "today"});
  }
  if (/\byesterday\b/i.test(prompt)) {
    return resolveNaturalDateRange({phrase: "yesterday"});
  }
  if (/\bthis\s+week\b/i.test(prompt)) {
    return resolveNaturalDateRange({phrase: "this week"});
  }
  if (/\blast\s+week\b/i.test(prompt)) {
    return resolveNaturalDateRange({phrase: "last week"});
  }
  if (/\bthis\s+month\b/i.test(prompt)) {
    return resolveNaturalDateRange({phrase: "this month"});
  }
  if (/\blast\s+month\b/i.test(prompt)) {
    return resolveNaturalDateRange({phrase: "last month"});
  }
  const daysMatch = prompt.match(/\b(\d+)\s+days?\b/i);
  if (daysMatch) {
    return resolveNaturalDateRange({phrase: `last ${daysMatch[1]} days`});
  }
  return {};
};
