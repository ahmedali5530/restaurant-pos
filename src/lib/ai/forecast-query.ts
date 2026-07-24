import {resolveNaturalDateRange} from "@/api/reports/shared/filters.ts";
import type {DateRangeFilter} from "@/api/reports/shared/types.ts";

/** "Forecast inventory consumption for the next 14 days" style prompts. */
export const isInventoryConsumptionForecastPrompt = (prompt: string): boolean => {
  const hasForecast = /\b(forecast|predict|project(?:ion)?)\b/i.test(prompt);
  const hasConsumption = /\bconsumption\b/i.test(prompt);
  const hasInventory = /\b(inventory|stock|ingredient)\b/i.test(prompt)
    || (hasConsumption && !/\b(sales?|revenue)\b/i.test(prompt));
  return hasForecast && hasConsumption && hasInventory;
};

export const resolveForecastDaysFromPrompt = (prompt: string, fallback = 14): number => {
  const nextMatch = prompt.match(/\b(?:next|coming|following)\s+(\d+)\s*days?\b/i);
  if (nextMatch?.[1]) {
    return Math.min(90, Math.max(1, Number(nextMatch[1])));
  }
  const forMatch = prompt.match(/\bfor\s+(\d+)\s*days?\b/i);
  if (forMatch?.[1]) {
    return Math.min(90, Math.max(1, Number(forMatch[1])));
  }
  return fallback;
};

/** History window for forecasting (need enough daily points). */
export const resolveConsumptionHistoryRange = (_prompt: string): DateRangeFilter => {
  return resolveNaturalDateRange({phrase: "last 30 days"});
};
