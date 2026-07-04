import {resolveNaturalDateRange} from "@/api/reports/shared/filters.ts";
import type {DateRangeFilter} from "@/api/reports/shared/types.ts";

export const isTipsPrompt = (prompt: string): boolean => {
  return /\btips?\b/i.test(prompt);
};

export const wantsTipDistribution = (prompt: string): boolean => {
  return /\b(distribut|share|split|each\s+(person|staff|server|employee|worker)|who\s+gets|per\s+(user|person|staff|server))\b/i.test(prompt);
};

export const resolveTipsDateRange = (prompt: string): DateRangeFilter => {
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

  if (/\b(collected|earned|received)\b/i.test(prompt)) {
    return resolveNaturalDateRange({phrase: "today"});
  }

  return {};
};
