import {describe, expect, it} from "vitest";
import {
  isDishRecipeCatalogPrompt,
  isDishRecipeComparePrompt,
  isDishRecipeCountsPrompt,
  isDishRecipeMissingIngredientsPrompt,
  isDishRecipePrompt,
  resolveDishRecipeCatalogOptionsFromPrompt,
  resolveDishRecipeQueryFromPrompt,
  wantsOmitModifierCategories,
} from "@/lib/ai/product-query.ts";
import {formatDishRecipeAsAnswer, isModifierCategoryName} from "@/api/reports/sales/dish-recipe.ts";
import {selectToolsForPrompt} from "@/lib/ai/tools/select-tools.ts";
import {detectWriteToolsForPrompt} from "@/lib/ai/tools/write-tool-registry.ts";

const toolNames = (prompt: string) =>
  selectToolsForPrompt(prompt, "table", [], true).tools.map(tool => tool.function.name);

const COMPARE_PROMPT =
  "cross compare dishes with ingridents and show dishs with no ingredients , so i can input their ingredients";

describe("isDishRecipePrompt", () => {
  it("detects ingredient / recipe read questions", () => {
    expect(isDishRecipePrompt("What ingredients are in dish Margherita Pizza?")).toBe(true);
    expect(isDishRecipePrompt("Show recipe for dish #12")).toBe(true);
    expect(isDishRecipePrompt("ingredients of Chicken Burger")).toBe(true);
    expect(isDishRecipePrompt("Show me dishes with their ingredients")).toBe(true);
    expect(isDishRecipePrompt(COMPARE_PROMPT)).toBe(true);
  });

  it("does not treat write intents as recipe reads", () => {
    expect(isDishRecipePrompt("add ingredient Tomato to dish #12")).toBe(false);
    expect(isDishRecipePrompt("update recipe quantity for dish Pizza")).toBe(false);
  });

  it("still treats list-then-fill prompts as reads", () => {
    expect(isDishRecipePrompt("Show dishes with no ingredients so I can add them")).toBe(true);
  });

  it("does not treat sales dish prompts as recipe reads", () => {
    expect(isDishRecipePrompt("Top 10 dishes by revenue this week")).toBe(false);
  });
});

describe("isDishRecipeCatalogPrompt", () => {
  it("detects multi-dish ingredient listings", () => {
    expect(isDishRecipeCatalogPrompt("Show me dishes with their ingredients")).toBe(true);
    expect(isDishRecipeCatalogPrompt("list all dishes with recipes")).toBe(true);
    expect(isDishRecipeCatalogPrompt(COMPARE_PROMPT)).toBe(true);
  });

  it("does not treat a single named dish as catalog", () => {
    expect(isDishRecipeCatalogPrompt("What ingredients are in dish Margherita Pizza?")).toBe(false);
    expect(isDishRecipeCatalogPrompt("Show recipe for dish #12")).toBe(false);
  });
});

describe("isDishRecipeCountsPrompt", () => {
  const countsPrompt =
    "give me count of number of recipes from every dish, just number of recipes in each dish and no other detail is required, dish name -> number of recipes";

  it("detects recipe count audits", () => {
    expect(isDishRecipeCountsPrompt(countsPrompt)).toBe(true);
    expect(isDishRecipePrompt(countsPrompt)).toBe(true);
    expect(isDishRecipeCatalogPrompt(countsPrompt)).toBe(true);
    expect(resolveDishRecipeCatalogOptionsFromPrompt(countsPrompt)).toEqual({
      countsOnly: true,
      onlyWithIngredients: false,
      limit: 2000,
    });
  });

  it("formats counts as Dish | Recipes markdown", () => {
    const answer = formatDishRecipeAsAnswer({
      found: true,
      mode: "catalog",
      catalogFocus: "counts",
      ingredients: [],
      ingredientCount: 0,
      totalRecipeCost: 0,
      dishCount: 2,
      dishes: [
        {
          dish: {id: "1", name: "Burger", categories: [], price: 1},
          ingredients: [],
          ingredientCount: 0,
          totalRecipeCost: 0,
        },
        {
          dish: {id: "2", name: "Pizza", categories: [], price: 1},
          ingredients: [],
          ingredientCount: 3,
          totalRecipeCost: 0,
        },
      ],
    });
    expect(answer).toContain("| Dish | Recipes |");
    expect(answer).toContain("| Burger | 0 |");
    expect(answer).toContain("| Pizza | 3 |");
  });
});

describe("missing / compare catalog options", () => {
  it("detects dishes with no ingredients", () => {
    expect(isDishRecipeMissingIngredientsPrompt("Show dishes with no ingredients")).toBe(true);
    expect(isDishRecipeMissingIngredientsPrompt(COMPARE_PROMPT)).toBe(true);
  });

  it("detects compare prompts", () => {
    expect(isDishRecipeComparePrompt(COMPARE_PROMPT)).toBe(true);
    expect(resolveDishRecipeCatalogOptionsFromPrompt(COMPARE_PROMPT)).toEqual({
      onlyWithIngredients: false,
      limit: 2000,
    });
    expect(resolveDishRecipeCatalogOptionsFromPrompt("dishes with no ingredients")).toEqual({
      onlyMissingIngredients: true,
      onlyWithIngredients: false,
      limit: 2000,
    });
  });

  it("detects omit modifier category", () => {
    const prompt =
      "show me dishes which have no ingredients and omit modifier category, show dish name, number, category in list";
    expect(wantsOmitModifierCategories(prompt)).toBe(true);
    expect(isDishRecipeMissingIngredientsPrompt(prompt)).toBe(true);
    expect(resolveDishRecipeCatalogOptionsFromPrompt(prompt)).toEqual({
      onlyMissingIngredients: true,
      onlyWithIngredients: false,
      omitModifierCategories: true,
      limit: 2000,
    });
    expect(isModifierCategoryName("Modifiers")).toBe(true);
    expect(isModifierCategoryName("Burgers")).toBe(false);
  });
});

describe("categoryNamesFromDish", () => {
  it("resolves bare category record ids via name map", async () => {
    const {categoryNamesFromDish} = await import("@/api/reports/sales/dish-recipe.ts");
    const nameById = new Map([
      ["category:abc", "Mains"],
      ["abc", "Mains"],
    ]);
    expect(
      categoryNamesFromDish(
        {categories: [{id: "category:abc"}]} as any,
        nameById,
      ),
    ).toEqual(["Mains"]);
    expect(
      categoryNamesFromDish(
        {categories: ["category:abc"]} as any,
        nameById,
      ),
    ).toEqual(["Mains"]);
    expect(
      categoryNamesFromDish(
        {categories: [{name: "Sides"}]} as any,
        nameById,
      ),
    ).toEqual(["Sides"]);
  });
});

describe("resolveDishRecipeQueryFromPrompt", () => {
  it("extracts dish number", () => {
    expect(resolveDishRecipeQueryFromPrompt("Show recipe for dish #12")).toEqual({
      dishNumber: "12",
    });
  });

  it("extracts dish name after of/for", () => {
    expect(resolveDishRecipeQueryFromPrompt("What ingredients are in dish Margherita Pizza?")).toEqual({
      dishName: "Margherita Pizza",
      search: "Margherita Pizza",
    });
  });

  it("returns empty filters for catalog prompts", () => {
    expect(resolveDishRecipeQueryFromPrompt("Show me dishes with their ingredients")).toEqual({});
    expect(resolveDishRecipeQueryFromPrompt(COMPARE_PROMPT)).toEqual({});
  });
});

describe("selectToolsForPrompt dish recipe", () => {
  it("includes get_dish_recipe first for ingredient prompts", () => {
    const prompt = "What ingredients are in dish Margherita Pizza?";
    const names = toolNames(prompt);
    expect(names).toContain("get_dish_recipe");
    expect(names[0]).toBe("get_dish_recipe");
    expect(selectToolsForPrompt(prompt, "table", [], true).domains).toEqual(
      expect.arrayContaining(["lookup", "sales"]),
    );
  });
});

describe("write tools vs dish recipe reads", () => {
  it("does not attach propose_create_dish_ingredients to read prompts", () => {
    const names = detectWriteToolsForPrompt(
      "What ingredients are in dish Margherita Pizza?",
      ["admin.dishes.create", "admin.dishes.update"],
      {domains: ["sales", "inventory"]},
    ).map(tool => tool.function.name);
    expect(names).not.toContain("propose_create_dish_ingredients");
  });
});
