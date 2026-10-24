import {resolveNaturalDateRange} from "@/api/reports/shared/filters.ts";
import type {DateRangeFilter} from "@/api/reports/shared/types.ts";

export const isUnsoldProductsPrompt = (prompt: string): boolean => {
  const mentionsCatalog = /\b(products?|dishes?|menu\s*items?)\b/i.test(prompt);
  const mentionsUnsold = /\b(haven'?t|hasn'?t|not)\s+(been\s+)?sold\b|\bunsold\b|\bwithout\s+(any\s+)?sales\b|\bno\s+sales\b/i.test(prompt);
  return mentionsCatalog && mentionsUnsold;
};

/** Soft match for "ingredient(s)" including common typos like "ingridents". */
const hasIngredientOrRecipeWord = (text: string): boolean =>
  /\b(ingredi?e?nts?|ingridents?|recipes?|bom|bill of materials)\b/i.test(text);

/** Soft match for dish/dishes including "dishs". */
const hasDishWord = (text: string): boolean =>
  /\b(dish(?:e?s)?|menu\s*items?|product|yemek|yemeği)\b/i.test(text)
  || /\b(?:#|no\.?|number)\s*\d+\b/i.test(text);

/** Dishes that have no recipe lines (so the user can fill them in). */
export const isDishRecipeMissingIngredientsPrompt = (prompt: string): boolean => {
  const text = prompt.trim();
  if (!text) {
    return false;
  }
  return (
    /\b(?:no|without|missing|empty|zero)\s+(?:any\s+)?(?:ingredi?e?nts?|ingridents?|recipes?)\b/i.test(text)
    || /\b(?:haven't|have\s+not|has\s+no|with\s+no)\s+(?:any\s+)?(?:ingredi?e?nts?|ingridents?|recipes?)\b/i.test(text)
    || /\b(?:dishes?|dishs|menu\s*items?)\s+(?:that\s+)?(?:have|with)\s+(?:no|zero|0|missing)\b/i.test(text)
  );
};

/** Compare dishes that have recipes vs those that do not. */
export const isDishRecipeComparePrompt = (prompt: string): boolean => {
  const text = prompt.trim();
  if (!text || !hasIngredientOrRecipeWord(text)) {
    return false;
  }
  return (
    /\b(cross[-\s]?compar|compar(?:e|ison|ing)|with\s+(?:vs\.?|versus|and\s+without)|vs\.?\s+(?:no|without|missing))\b/i.test(text)
    || (isDishRecipeMissingIngredientsPrompt(text)
      && /\b(?:with|have)\s+(?:their\s+)?(?:ingredi?e?nts?|ingridents?|recipes?)\b/i.test(text))
  );
};

/** Read-only: "what ingredients / recipe does this dish have?" (not add/update recipe). */
export const isDishRecipePrompt = (prompt: string): boolean => {
  const text = prompt.trim();
  if (!text) {
    return false;
  }
  const looksLikeWrite = /\b(add|create|update|change|set|remove|delete|import)\b/i.test(text)
    && hasIngredientOrRecipeWord(text);
  const looksLikeReadList = /\b(show|list|find|which|compare|cross|without|missing|no\s+ingredients?|display|get)\b/i.test(text)
    || isDishRecipeMissingIngredientsPrompt(text);
  if (looksLikeWrite && !looksLikeReadList) {
    return false;
  }
  if (hasIngredientOrRecipeWord(text) && hasDishWord(text)) {
    return true;
  }
  if (/\b(ingredi?e?nts?|recipe)\s+(?:of|for|in|on)\b/i.test(text)) {
    return true;
  }
  if (/\bwhat(?:'s| is| are)?\s+(?:the\s+)?(?:ingredi?e?nts?|recipe)\b/i.test(text)) {
    return true;
  }
  return false;
};

/** True when the user wants many dishes' recipes, not one named dish. */
export const isDishRecipeCatalogPrompt = (prompt: string): boolean => {
  const text = prompt.trim();
  if (!text || !isDishRecipePrompt(text)) {
    return false;
  }
  if (isDishRecipeMissingIngredientsPrompt(text) || isDishRecipeComparePrompt(text)) {
    return true;
  }
  if (/\b(?:all|every|each)\s+(?:the\s+)?(?:dishes?|dishs|menu\s*items?|products?)\b/i.test(text)) {
    return true;
  }
  if (/\bdishes?\s+with\s+(?:their\s+)?(?:ingredi?e?nts?|ingridents?|recipes?)\b/i.test(text)) {
    return true;
  }
  if (/\b(?:list|show|display|get|compare)\s+(?:me\s+)?(?:all\s+)?(?:the\s+)?(?:dishes?|dishs|menu\s*items?)\b/i.test(text)
    && hasIngredientOrRecipeWord(text)
    && !/\b(?:dish|menu\s*item|product)\s+(?:#|no\.?|number)?\s*\d+/i.test(text)
    && !/["'“”]/.test(text)) {
    return true;
  }
  return false;
};

/** Exclude dishes in a "Modifier" / "Modifiers" category. */
export const wantsOmitModifierCategories = (prompt: string): boolean =>
  /\b(?:omit|exclude|ignore|without|skip)\s+(?:the\s+)?modifier\b/i.test(prompt)
  || /\bmodifier\s+categor(?:y|ies)\b/i.test(prompt)
    && /\b(?:omit|exclude|ignore|without|skip|except|not)\b/i.test(prompt);

/** Catalog filter flags derived from the user prompt. */
export const resolveDishRecipeCatalogOptionsFromPrompt = (prompt: string): {
  onlyWithIngredients?: boolean;
  onlyMissingIngredients?: boolean;
  omitModifierCategories?: boolean;
  /** High enough to cover full menus for missing/compare lists. */
  limit?: number;
} => {
  const omit = wantsOmitModifierCategories(prompt) ? {omitModifierCategories: true as const} : {};
  // Missing / compare lists should not silently stop at the old 40-row default.
  const fullList = {limit: 2000 as const};
  if (isDishRecipeComparePrompt(prompt)) {
    return {onlyWithIngredients: false, ...omit, ...fullList};
  }
  if (isDishRecipeMissingIngredientsPrompt(prompt)) {
    return {
      onlyMissingIngredients: true,
      onlyWithIngredients: false,
      ...omit,
      ...fullList,
    };
  }
  return {onlyWithIngredients: true, ...omit};
};

/** Extract dish name / number for get_dish_recipe from common phrasings. */
export const resolveDishRecipeQueryFromPrompt = (prompt: string): {
  dishName?: string;
  dishNumber?: string;
  search?: string;
} => {
  if (isDishRecipeCatalogPrompt(prompt)) {
    return {};
  }

  const numberMatch = prompt.match(
    /\b(?:dish|menu\s*item|product|item)\s*(?:#|no\.?|number)?\s*([A-Za-z0-9-]+)\b/i,
  )
    || prompt.match(/\b(?:#|no\.?)\s*([A-Za-z0-9-]+)\b/i);
  if (numberMatch?.[1] && /^\d/.test(numberMatch[1])) {
    return {dishNumber: numberMatch[1]};
  }

  const quoted = prompt.match(/["'“”](.+?)["'“”]/);
  if (quoted?.[1]?.trim()) {
    return {dishName: quoted[1].trim()};
  }

  const ofFor = prompt.match(
    /\b(?:ingredients?|recipe)\s+(?:are\s+|is\s+)?(?:of|for|in|on)\s+(?:the\s+)?(?:dish|menu\s*item|product)?\s*[:#]?\s*(.+)$/i,
  );
  if (ofFor?.[1]) {
    const cleaned = ofFor[1]
      .replace(/\b(please|thanks|thank you)\b/gi, "")
      .replace(/[?.!]+$/g, "")
      .trim();
    if (cleaned) {
      if (/^\d+[A-Za-z0-9-]*$/.test(cleaned)) {
        return {dishNumber: cleaned};
      }
      return {dishName: cleaned, search: cleaned};
    }
  }

  const dishNamed = prompt.match(
    /\b(?:dish|menu\s*item|product)\s+([A-Za-z0-9][A-Za-z0-9 &'/-]{1,80})$/i,
  );
  if (dishNamed?.[1]) {
    const cleaned = dishNamed[1].replace(/[?.!]+$/g, "").trim();
    if (cleaned) {
      return {dishName: cleaned, search: cleaned};
    }
  }

  return {};
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
