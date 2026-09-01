import {resolveNaturalDateRange} from "@/api/reports/shared/filters.ts";
import type {DateRangeFilter} from "@/api/reports/shared/types.ts";

export const FRAUD_AUDIT_TOOL_NAMES = [
  "get_activity_log",
  "get_cash_settlement_audit",
  "get_staff_accountability_metrics",
  "get_void_and_cancel_summary",
  "get_voids",
] as const;

export const isFraudSuspiciousPrompt = (prompt: string): boolean => {
  return /\b(fraud|fraudulent|suspicious|suspicion|anomal\w*|irregular|tamper(?:ing)?|unauthorized|theft|steal|stolen|manipulat(?:e|ion)|red\s+flags?|shady|sketchy|misappropriat(?:e|ion)|embezzl(?:e|ement)|cover[\s-]?up)\b/i.test(
    prompt,
  );
};

export const resolveFraudPromptDateRange = (prompt: string): DateRangeFilter => {
  if (/\blast\s+month\b/i.test(prompt)) {
    return resolveNaturalDateRange({phrase: "last month"});
  }
  if (/\bthis\s+month\b/i.test(prompt)) {
    return resolveNaturalDateRange({phrase: "this month"});
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
  const daysMatch = prompt.match(/\b(\d+)\s+days?\b/i);
  if (daysMatch) {
    return resolveNaturalDateRange({phrase: `last ${daysMatch[1]} days`});
  }
  return resolveNaturalDateRange({phrase: "this week"});
};
