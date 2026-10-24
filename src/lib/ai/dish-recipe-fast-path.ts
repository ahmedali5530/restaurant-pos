import type {DbClient} from "@/api/reports/shared/types.ts";
import {formatDishRecipeForPrompt, getDishRecipe} from "@/api/reports/sales/dish-recipe.ts";
import {
  isDishRecipeCatalogPrompt,
  isDishRecipePrompt,
  resolveDishRecipeCatalogOptionsFromPrompt,
  resolveDishRecipeQueryFromPrompt,
} from "@/lib/ai/product-query.ts";

export type DishRecipeFastPathResult = {
  toolName: string;
  args: Record<string, unknown>;
  result: unknown;
  instruction: string;
};

const catalogHintFor = (focus: string | undefined): string => {
  const tableHint =
    "When name/number/category fields are present, render a markdown table with columns "
    + "Name | Number | Category (use each row's category value; never leave Category blank if data has it). ";
  if (focus === "missing") {
    return "mode=catalog/missing: list missingIngredients (dishes with no recipe). "
      + tableHint
      + "Tell the user they can add ingredients in Settings → Dishes (or ask you to propose ingredient lines for a specific dish). ";
  }
  if (focus === "compare") {
    return "mode=catalog/compare: summarize withIngredients (brief) and list missingIngredients clearly so the user can fill them in. "
      + tableHint
      + "Mention withIngredientsCount and missingIngredientsCount. ";
  }
  return "mode=catalog: for each dishes[] row, show dish name then its ingredients (name, quantity, unit). "
    + tableHint
    + "Mention dishCount and truncation if truncated. ";
};

export const tryDishRecipeFastPath = async (
  db: DbClient,
  prompt: string,
  options: {onToolStart?: (name: string) => void} = {},
): Promise<DishRecipeFastPathResult | null> => {
  if (!isDishRecipePrompt(prompt)) {
    return null;
  }

  const catalog = isDishRecipeCatalogPrompt(prompt);
  const query = resolveDishRecipeQueryFromPrompt(prompt);
  const dishArgs = {
    dishName: query.dishName,
    dishNumber: query.dishNumber,
    search: query.search,
  };
  // No named dish → catalog (avoids empty single lookups and tool-markup leaks).
  const useCatalog = catalog || (!dishArgs.dishName && !dishArgs.dishNumber && !dishArgs.search);
  if (!useCatalog && !dishArgs.dishName && !dishArgs.dishNumber && !dishArgs.search) {
    return null;
  }

  const catalogOptions = useCatalog ? resolveDishRecipeCatalogOptionsFromPrompt(prompt) : {};
  const args = useCatalog ? {...catalogOptions} : dishArgs;

  options.onToolStart?.("get_dish_recipe");
  const result = await getDishRecipe(db, args);

  const catalogHint = result.mode === "catalog"
    ? catalogHintFor(result.catalogFocus)
    : "List each ingredient name, quantity, unit, and cost from ingredients[]. "
      + "If matches[] is returned, ask which dish. ";

  return {
    toolName: "get_dish_recipe",
    args,
    result,
    instruction:
      `${prompt}\n\nget_dish_recipe:\n${formatDishRecipeForPrompt(result)}\n\n`
      + catalogHint
      + "If found is false or there are no dishes/ingredients, say so clearly. Do not invent ingredients. "
      + "Reply in plain language only — never print tool call markup or DSML.",
  };
};
