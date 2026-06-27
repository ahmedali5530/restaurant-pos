import {resolveNaturalDateRange} from "@/api/reports/shared/filters.ts";
import type {DateRangeFilter} from "@/api/reports/shared/types.ts";

export const isUnsoldProductsPrompt = (prompt: string): boolean => {
  const mentionsCatalog = /\b(products?|dishes?|menu\s*items?)\b/i.test(prompt);
  const mentionsUnsold = /\b(haven'?t|hasn'?t|not)\s+(been\s+)?sold\b|\bunsold\b|\bwithout\s+(any\s+)?sales\b|\bno\s+sales\b/i.test(prompt);
  return mentionsCatalog && mentionsUnsold;
};

export const parseLookbackPhrase = (prompt: string): string => {
  const daysMatch = prompt.match(/\b(\d+)\s+days?\b/i);
  if (daysMatch) {
    return `last ${daysMatch[1]} days`;
  }

  if (/\bthis\s+month\b/i.test(prompt)) {
    return "this month";
  }

  if (/\blast\s+month\b/i.test(prompt)) {
    return "last month";
  }

  if (/\blast\s+week\b/i.test(prompt)) {
    return "last week";
  }

  return "last 30 days";
};

export const resolveUnsoldProductsDateRange = (prompt: string): DateRangeFilter => {
  return resolveNaturalDateRange({phrase: parseLookbackPhrase(prompt)});
};
