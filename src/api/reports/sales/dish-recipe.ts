import {Tables} from "@/api/db/tables.ts";
import type {Dish} from "@/api/model/dish.ts";
import {unwrapQueryResult} from "@/api/reports/shared/query.ts";
import {recordIdToString, recordToString, toQueryRecordId} from "@/api/reports/shared/records.ts";
import type {DbClient} from "@/api/reports/shared/types.ts";
import {safeNumber} from "@/lib/utils.ts";

export interface GetDishRecipeOptions {
  dishId?: string;
  dishNumber?: string;
  dishName?: string;
  search?: string;
  /** Max dishes in catalog mode (no dish filter). Default 40, max 100. */
  limit?: number;
  /** When true (default in catalog mode), omit dishes with zero recipe lines. */
  onlyWithIngredients?: boolean;
  /** When true, return only dishes that have zero recipe lines. */
  onlyMissingIngredients?: boolean;
  /** Exclude dishes whose category name looks like a modifier category. */
  omitModifierCategories?: boolean;
  /** Catalog: dish name -> recipe line count only (includes dishes with 0). */
  countsOnly?: boolean;
}

export interface DishRecipeIngredient {
  ingredientId: string;
  ingredientName: string;
  ingredientCode?: string;
  unit?: string;
  quantity: number;
  cost: number;
  lineCost: number;
  isPriceLocked?: boolean;
}

export interface DishRecipeDishRow {
  dish: {
    id: string;
    name: string;
    number?: string;
    /** Category names for display (joined in prompts as `category`). */
    categories: string[];
    category?: string;
    price: number;
    cost?: number;
  };
  ingredients: DishRecipeIngredient[];
  ingredientCount: number;
  totalRecipeCost: number;
}

export interface DishRecipeResult {
  found: boolean;
  mode: "single" | "catalog";
  /** with = only recipes; missing = only empty; compare = both; counts = name→count. */
  catalogFocus?: "with" | "missing" | "compare" | "counts";
  dish?: DishRecipeDishRow["dish"];
  ingredients: DishRecipeIngredient[];
  ingredientCount: number;
  totalRecipeCost: number;
  /** Present in catalog mode (and single mode as a one-item array). */
  dishes: DishRecipeDishRow[];
  dishCount: number;
  /** Dishes that have recipe lines (compare / with). */
  withIngredientsCount?: number;
  /** Dishes with zero recipe lines (compare / missing). */
  missingIngredientsCount?: number;
  truncated?: boolean;
  matches?: Array<{id: string; name: string; number?: string}>;
  message?: string;
}

type RecipeRow = {
  quantity?: number;
  cost?: number;
  is_price_locked?: boolean;
  menu_item?: Dish | string;
  item?: {
    id?: unknown;
    name?: string;
    code?: string;
    uom?: string;
    unit?: string;
  };
};

const normalizeKey = (id: unknown): string => {
  const str = recordIdToString(id) || String(id ?? "");
  const colon = str.lastIndexOf(":");
  return colon >= 0 ? str.slice(colon + 1) : str;
};

const dishMatchesSearch = (dish: Dish, needle: string): boolean => {
  const name = String(dish.name ?? "").toLowerCase();
  const number = String(dish.number ?? "").toLowerCase();
  return name.includes(needle) || number === needle || number.includes(needle);
};

const mapIngredient = (row: RecipeRow): DishRecipeIngredient | null => {
  const item = row.item;
  if (!item) {
    return null;
  }
  const quantity = safeNumber(row.quantity);
  const cost = safeNumber(row.cost);
  return {
    ingredientId: recordToString(item.id) || normalizeKey(item.id),
    ingredientName: item.name || "Unknown",
    ingredientCode: item.code,
    unit: item.uom || item.unit,
    quantity,
    cost,
    lineCost: Math.round(quantity * cost * 100) / 100,
    isPriceLocked: row.is_price_locked,
  };
};

type CategoryNameById = Map<string, string>;

/** Resolve category display names from FETCHed objects and/or bare record ids. */
export const categoryNamesFromDish = (
  dish: Dish,
  nameById?: CategoryNameById,
): string[] => {
  const names: string[] = [];
  for (const cat of dish.categories ?? []) {
    if (typeof cat === "string") {
      const trimmed = cat.trim();
      if (!trimmed) {
        continue;
      }
      if (nameById && (trimmed.includes(":") || nameById.has(trimmed) || nameById.has(normalizeKey(trimmed)))) {
        const resolved = nameById.get(trimmed) || nameById.get(normalizeKey(trimmed));
        if (resolved) {
          names.push(resolved);
        }
        continue;
      }
      // Plain name string (already resolved).
      if (!trimmed.includes(":")) {
        names.push(trimmed);
      }
      continue;
    }
    if (cat && typeof cat === "object") {
      const obj = cat as {name?: string; id?: unknown};
      if (obj.name != null && String(obj.name).trim()) {
        names.push(String(obj.name).trim());
        continue;
      }
      const id = recordToString(obj.id ?? cat);
      if (id && nameById) {
        const resolved = nameById.get(id) || nameById.get(normalizeKey(id));
        if (resolved) {
          names.push(resolved);
        }
      }
    }
  }
  return names;
};

/** Category names like "Modifier" / "Modifiers" / "Dish modifiers". */
export const isModifierCategoryName = (name: string): boolean =>
  /\bmodifi/i.test(name.trim());

const dishBelongsToModifierCategory = (
  dish: Dish | DishRecipeDishRow["dish"],
  nameById?: CategoryNameById,
): boolean => {
  const names = Array.isArray(dish.categories) && typeof dish.categories[0] === "string"
    ? (dish.categories as string[])
    : categoryNamesFromDish(dish as Dish, nameById);
  return names.some(isModifierCategoryName);
};

const dishSummary = (
  dish: Dish,
  nameById?: CategoryNameById,
): DishRecipeDishRow["dish"] => {
  const categories = categoryNamesFromDish(dish, nameById);
  return {
    id: recordToString(dish.id),
    name: dish.name ?? "Unknown",
    number: dish.number,
    categories,
    category: categories.join(", ") || undefined,
    price: safeNumber(dish.price),
    cost: dish.cost != null ? safeNumber(dish.cost) : undefined,
  };
};

const buildDishRow = (
  dish: Dish,
  ingredients: DishRecipeIngredient[],
  nameById?: CategoryNameById,
): DishRecipeDishRow => {
  const totalRecipeCost = Math.round(
    ingredients.reduce((sum, row) => sum + row.lineCost, 0) * 100,
  ) / 100;
  return {
    dish: dishSummary(dish, nameById),
    ingredients,
    ingredientCount: ingredients.length,
    totalRecipeCost,
  };
};

const listRowForPrompt = (row: DishRecipeDishRow) => ({
  name: row.dish.name,
  number: row.dish.number ?? "",
  category: row.dish.category ?? row.dish.categories.join(", "),
});

const hasDishFilter = (options: GetDishRecipeOptions): boolean =>
  Boolean(
    options.dishId?.trim()
    || options.dishNumber?.trim()
    || options.dishName?.trim()
    || options.search?.trim(),
  );

const resolveDishCandidates = async (
  db: DbClient,
  options: GetDishRecipeOptions,
): Promise<Dish[]> => {
  const limit = Math.min(Math.max(options.limit ?? 20, 1), 50);

  if (options.dishId?.trim()) {
    const id = options.dishId.trim();
    try {
      const rows = unwrapQueryResult<Dish>(
        await db.query(
          `SELECT id, name, number, price, cost FROM ${Tables.dishes}
           WHERE id = $id AND deleted_at = NONE
           LIMIT 1`,
          {id: toQueryRecordId(id, Tables.dishes)},
        ),
      );
      if (rows.length) {
        return rows;
      }
    } catch {
      // fall through to search
    }
  }

  if (options.dishNumber?.trim()) {
    const number = options.dishNumber.trim();
    const rows = unwrapQueryResult<Dish>(
      await db.query(
        `SELECT id, name, number, price, cost FROM ${Tables.dishes}
         WHERE deleted_at = NONE AND number = $number
         ORDER BY name ASC
         LIMIT $limit`,
        {number, limit},
      ),
    );
    if (rows.length) {
      return rows;
    }
  }

  const search = (options.dishName || options.search || "").trim();
  if (!search) {
    return [];
  }

  const rows = unwrapQueryResult<Dish>(
    await db.query(
      `SELECT id, name, number, price, cost FROM ${Tables.dishes}
       WHERE deleted_at = NONE
       ORDER BY name ASC
       LIMIT 500`,
    ),
  );

  const needle = search.toLowerCase();
  const exact = rows.filter(dish =>
    String(dish.name ?? "").toLowerCase() === needle
    || String(dish.number ?? "").toLowerCase() === needle,
  );
  if (exact.length) {
    return exact.slice(0, limit);
  }

  return rows.filter(dish => dishMatchesSearch(dish, needle)).slice(0, limit);
};

const loadIngredients = async (
  db: DbClient,
  dishId: string,
): Promise<DishRecipeIngredient[]> => {
  const recipes = unwrapQueryResult<RecipeRow>(
    await db.query(
      `SELECT * FROM ${Tables.dishes_recipes}
       WHERE menu_item = $dishId
       ORDER BY item.name ASC
       FETCH item`,
      {dishId: toQueryRecordId(dishId, Tables.dishes)},
    ),
  );

  return recipes
    .map(mapIngredient)
    .filter((row): row is DishRecipeIngredient => Boolean(row));
};

const compactDishRow = (row: DishRecipeDishRow) => ({
  ...listRowForPrompt(row),
  ingredientCount: row.ingredientCount,
  ingredients: row.ingredients.map(ing => ({
    name: ing.ingredientName,
    quantity: ing.quantity,
    unit: ing.unit,
    cost: ing.cost,
  })),
});

const CATALOG_LIMIT_DEFAULT_WITH = 100;
const CATALOG_LIMIT_DEFAULT_MISSING = 2000;
const CATALOG_LIMIT_MAX = 2000;
const DISH_SCAN_LIMIT = 2000;

const loadCategoryNameById = async (db: DbClient): Promise<CategoryNameById> => {
  const rows = unwrapQueryResult<{id?: unknown; name?: string}>(
    await db.query(
      `SELECT id, name FROM ${Tables.categories}
       WHERE deleted_at = NONE`,
    ),
  );
  const map: CategoryNameById = new Map();
  for (const row of rows) {
    const id = recordToString(row.id);
    const name = String(row.name ?? "").trim();
    if (!id || !name) {
      continue;
    }
    map.set(id, name);
    map.set(normalizeKey(id), name);
  }
  return map;
};

const loadActiveDishesWithCategories = async (db: DbClient): Promise<Dish[]> =>
  unwrapQueryResult<Dish>(
    await db.query(
      // Include `categories` in SELECT so FETCH can hydrate links (Surreal often
      // leaves bare record ids when the field is omitted from the projection).
      `SELECT id, name, number, price, cost, categories FROM ${Tables.dishes}
       WHERE deleted_at = NONE
       ORDER BY name ASC
       LIMIT ${DISH_SCAN_LIMIT}
       FETCH categories`,
    ),
  );

/**
 * Catalog: dishes with their recipe lines (for "show dishes with ingredients").
 * One query for recipes; groups by dish. Caps dish count.
 */
export const listDishRecipes = async (
  db: DbClient,
  options: {
    limit?: number;
    onlyWithIngredients?: boolean;
    onlyMissingIngredients?: boolean;
    omitModifierCategories?: boolean;
    countsOnly?: boolean;
  } = {},
): Promise<DishRecipeResult> => {
  const countsOnly = options.countsOnly === true;
  const onlyMissingIngredients = options.onlyMissingIngredients === true;
  const includeMissing = countsOnly
    || onlyMissingIngredients
    || options.onlyWithIngredients === false;
  const omitModifierCategories = options.omitModifierCategories === true;
  const catalogFocus: "with" | "missing" | "compare" | "counts" = countsOnly
    ? "counts"
    : onlyMissingIngredients
      ? "missing"
      : includeMissing
        ? "compare"
        : "with";
  const defaultLimit = catalogFocus === "with"
    ? CATALOG_LIMIT_DEFAULT_WITH
    : CATALOG_LIMIT_DEFAULT_MISSING;
  const limit = Math.min(Math.max(options.limit ?? defaultLimit, 1), CATALOG_LIMIT_MAX);

  const [recipes, allDishes, categoryNameById] = await Promise.all([
    unwrapQueryResult<RecipeRow>(
      await db.query(
        countsOnly
          // Counts must include broken recipe rows (missing/unfetched item).
          ? `SELECT menu_item FROM ${Tables.dishes_recipes} FETCH menu_item`
          : `SELECT * FROM ${Tables.dishes_recipes}
             FETCH menu_item, item`,
      ),
    ),
    loadActiveDishesWithCategories(db),
    loadCategoryNameById(db),
  ]);

  const dishById = new Map<string, Dish>();
  for (const dish of allDishes) {
    const id = recordToString(dish.id);
    if (id) {
      dishById.set(id, dish);
    }
  }

  const resolveRecipeDish = (menuItem: RecipeRow["menu_item"]): {dishId: string; dish: Dish} | null => {
    if (!menuItem) {
      return null;
    }
    if (typeof menuItem === "object") {
      if (menuItem.deleted_at) {
        return null;
      }
      const dishId = recordToString(menuItem.id);
      if (!dishId) {
        return null;
      }
      return {dishId, dish: dishById.get(dishId) ?? menuItem};
    }
    const dishId = recordToString(menuItem);
    if (!dishId) {
      return null;
    }
    const dish = dishById.get(dishId);
    return dish ? {dishId, dish} : null;
  };

  const byDish = new Map<string, {dish: Dish; ingredients: DishRecipeIngredient[]; rawCount: number}>();

  for (const row of recipes) {
    const resolved = resolveRecipeDish(row.menu_item);
    if (!resolved) {
      continue;
    }
    const {dishId, dish} = resolved;
    let entry = byDish.get(dishId);
    if (!entry) {
      entry = {dish, ingredients: [], rawCount: 0};
      byDish.set(dishId, entry);
    }
    entry.rawCount += 1;
    if (!countsOnly) {
      const ingredient = mapIngredient(row);
      if (ingredient) {
        entry.ingredients.push(ingredient);
      }
    }
  }

  const applyModifierFilter = <T extends DishRecipeDishRow>(rows: T[]): T[] =>
    omitModifierCategories
      ? rows.filter(row => !dishBelongsToModifierCategory(row.dish, categoryNameById))
      : rows;

  if (catalogFocus === "counts") {
    const countRows = applyModifierFilter(
      allDishes.map(dish => {
        const id = recordToString(dish.id);
        const rawCount = byDish.get(id)?.rawCount ?? 0;
        const row = buildDishRow(dish, [], categoryNameById);
        return {...row, ingredientCount: rawCount};
      }).sort((a, b) => {
        if (a.ingredientCount !== b.ingredientCount) {
          return a.ingredientCount - b.ingredientCount;
        }
        return a.dish.name.localeCompare(b.dish.name);
      }),
    );
    const truncated = countRows.length > limit;
    const dishes = countRows.slice(0, limit);
    const withCount = dishes.filter(row => row.ingredientCount > 0).length;
    const missingCount = dishes.filter(row => row.ingredientCount === 0).length;
    return {
      found: dishes.length > 0,
      mode: "catalog",
      catalogFocus: "counts",
      ingredients: [],
      ingredientCount: 0,
      totalRecipeCost: 0,
      dishes,
      dishCount: dishes.length,
      withIngredientsCount: withCount,
      missingIngredientsCount: missingCount,
      truncated,
      message: truncated
        ? `Showing first ${limit} of ${countRows.length} dishes (recipe line counts).`
        : `Recipe line counts for ${dishes.length} dishes (${missingCount} with zero).`,
    };
  }

  const withRows = applyModifierFilter(
    Array.from(byDish.values())
      .map(({dish, ingredients}) => {
        ingredients.sort((a, b) => a.ingredientName.localeCompare(b.ingredientName));
        return buildDishRow(dish, ingredients, categoryNameById);
      })
      .filter(row => row.ingredientCount > 0)
      .sort((a, b) => a.dish.name.localeCompare(b.dish.name)),
  );

  let missingRows: DishRecipeDishRow[] = [];
  if (includeMissing) {
    // "Has recipe" = at least one mapped ingredient (orphan recipe rows don't count).
    const withMappedIds = new Set(
      Array.from(byDish.entries())
        .filter(([, entry]) => entry.ingredients.length > 0)
        .map(([id]) => id),
    );
    missingRows = applyModifierFilter(
      allDishes
        .filter(dish => !withMappedIds.has(recordToString(dish.id)))
        .map(dish => buildDishRow(dish, [], categoryNameById))
        .sort((a, b) => a.dish.name.localeCompare(b.dish.name)),
    );
  }

  if (catalogFocus === "missing") {
    const truncated = missingRows.length > limit;
    const dishes = missingRows.slice(0, limit);
    return {
      found: dishes.length > 0,
      mode: "catalog",
      catalogFocus,
      ingredients: [],
      ingredientCount: 0,
      totalRecipeCost: 0,
      dishes,
      dishCount: dishes.length,
      withIngredientsCount: withRows.length,
      missingIngredientsCount: missingRows.length,
      truncated,
      message: dishes.length
        ? truncated
          ? `Showing first ${limit} of ${missingRows.length} dishes with no recipe ingredients.`
          : `Found ${dishes.length} dishes with no recipe ingredients.`
        : "Every active dish already has recipe ingredients.",
    };
  }

  if (catalogFocus === "compare") {
    const withSlice = withRows.slice(0, limit);
    const missingSlice = missingRows.slice(0, limit);
    const dishes = [...withSlice, ...missingSlice];
    const truncated = withRows.length > limit || missingRows.length > limit;
    return {
      found: dishes.length > 0,
      mode: "catalog",
      catalogFocus,
      ingredients: [],
      ingredientCount: 0,
      totalRecipeCost: 0,
      dishes,
      dishCount: dishes.length,
      withIngredientsCount: withRows.length,
      missingIngredientsCount: missingRows.length,
      truncated,
      message: truncated
        ? `Compare view capped at ${limit} dishes per group `
          + `(${withRows.length} with ingredients, ${missingRows.length} missing).`
        : undefined,
    };
  }

  const truncated = withRows.length > limit;
  const dishes = withRows.slice(0, limit);

  return {
    found: dishes.length > 0,
    mode: "catalog",
    catalogFocus,
    ingredients: [],
    ingredientCount: 0,
    totalRecipeCost: 0,
    dishes,
    dishCount: dishes.length,
    withIngredientsCount: withRows.length,
    missingIngredientsCount: 0,
    truncated,
    message: dishes.length
      ? truncated
        ? `Showing first ${limit} dishes that have recipe ingredients.`
        : undefined
      : "No dishes with recipe ingredients found.",
  };
};

/** Compact payload for LLM prompts (catalog JSON with ids is too large / easy to ignore). */
export const formatDishRecipeForPrompt = (result: DishRecipeResult): string => {
  if (result.mode !== "catalog") {
    return JSON.stringify(result);
  }
  if (!result.dishes.length) {
    return JSON.stringify({
      found: false,
      mode: "catalog",
      catalogFocus: result.catalogFocus,
      dishCount: 0,
      withIngredientsCount: result.withIngredientsCount ?? 0,
      missingIngredientsCount: result.missingIngredientsCount ?? 0,
      message: result.message ?? "No dishes found.",
    });
  }

  if (result.catalogFocus === "compare") {
    const withIngredients = result.dishes
      .filter(row => row.ingredientCount > 0)
      .map(compactDishRow);
    const missingIngredients = result.dishes
      .filter(row => row.ingredientCount === 0)
      .map(listRowForPrompt);
    return JSON.stringify({
      found: true,
      mode: "catalog",
      catalogFocus: "compare",
      withIngredientsCount: result.withIngredientsCount,
      missingIngredientsCount: result.missingIngredientsCount,
      truncated: result.truncated || undefined,
      message: result.message,
      columns: ["name", "number", "category"],
      withIngredients,
      missingIngredients,
    });
  }

  if (result.catalogFocus === "missing") {
    return JSON.stringify({
      found: true,
      mode: "catalog",
      catalogFocus: "missing",
      dishCount: result.dishCount,
      missingIngredientsCount: result.missingIngredientsCount,
      truncated: result.truncated || undefined,
      message: result.message,
      columns: ["name", "number", "category"],
      missingIngredients: result.dishes.map(listRowForPrompt),
    });
  }

  if (result.catalogFocus === "counts") {
    return JSON.stringify({
      found: true,
      mode: "catalog",
      catalogFocus: "counts",
      dishCount: result.dishCount,
      withIngredientsCount: result.withIngredientsCount,
      missingIngredientsCount: result.missingIngredientsCount,
      truncated: result.truncated || undefined,
      message: result.message,
      columns: ["dish", "recipes"],
      dishes: result.dishes.map(row => ({
        dish: row.dish.name,
        recipes: row.ingredientCount,
      })),
    });
  }

  return JSON.stringify({
    found: true,
    mode: "catalog",
    catalogFocus: result.catalogFocus ?? "with",
    dishCount: result.dishCount,
    truncated: result.truncated || undefined,
    message: result.message,
    dishes: result.dishes.map(compactDishRow),
  });
};

/**
 * Deterministic markdown answer (no LLM). Used for counts-only and as a blank-answer fallback.
 */
export const formatDishRecipeAsAnswer = (result: DishRecipeResult): string => {
  if (result.mode === "catalog" && result.catalogFocus === "counts") {
    if (!result.dishes.length) {
      return result.message || "No dishes found.";
    }
    const lines = [
      "| Dish | Recipes |",
      "| --- | ---: |",
      ...result.dishes.map(row => `| ${row.dish.name.replace(/\|/g, "/")} | ${row.ingredientCount} |`),
    ];
    if (result.message) {
      lines.push("", result.message);
    }
    if (result.truncated) {
      lines.push("", "_List truncated._");
    }
    return lines.join("\n");
  }

  if (result.mode === "catalog" && result.catalogFocus === "missing") {
    if (!result.dishes.length) {
      return result.message || "No dishes with missing recipes.";
    }
    const lines = [
      "| Name | Number | Category |",
      "| --- | --- | --- |",
      ...result.dishes.map(row => {
        const name = row.dish.name.replace(/\|/g, "/");
        const number = String(row.dish.number ?? "").replace(/\|/g, "/");
        const category = String(row.dish.category ?? row.dish.categories.join(", ")).replace(/\|/g, "/");
        return `| ${name} | ${number} | ${category} |`;
      }),
    ];
    if (result.message) {
      lines.push("", result.message);
    }
    return lines.join("\n");
  }

  // Generic fallback: compact JSON is better than a blank chat bubble.
  return formatDishRecipeForPrompt(result);
};

/**
 * Read-only dish recipe (ingredients) for AI / reports.
 * - With dish filter: one dish's recipe.
 * - Without filter: catalog of dishes with their ingredients.
 */
export const getDishRecipe = async (
  db: DbClient,
  options: GetDishRecipeOptions = {},
): Promise<DishRecipeResult> => {
  if (!hasDishFilter(options)) {
    return listDishRecipes(db, {
      limit: options.limit,
      onlyWithIngredients: options.onlyWithIngredients,
      onlyMissingIngredients: options.onlyMissingIngredients,
      omitModifierCategories: options.omitModifierCategories,
      countsOnly: options.countsOnly,
    });
  }

  const candidates = await resolveDishCandidates(db, options);

  if (!candidates.length) {
    return {
      found: false,
      mode: "single",
      ingredients: [],
      ingredientCount: 0,
      totalRecipeCost: 0,
      dishes: [],
      dishCount: 0,
      message: "No matching dish found. Pass dishName, dishNumber, or dishId — or omit them to list all dishes with recipes.",
    };
  }

  if (candidates.length > 1) {
    return {
      found: false,
      mode: "single",
      ingredients: [],
      ingredientCount: 0,
      totalRecipeCost: 0,
      dishes: [],
      dishCount: 0,
      matches: candidates.map(dish => ({
        id: recordToString(dish.id),
        name: dish.name ?? "Unknown",
        number: dish.number,
      })),
      message: "Multiple dishes matched. Call again with a more specific dishName, dishNumber, or dishId.",
    };
  }

  const dish = candidates[0];
  const dishId = recordToString(dish.id);
  const ingredients = await loadIngredients(db, dishId);
  const row = buildDishRow(dish, ingredients);

  return {
    found: true,
    mode: "single",
    dish: row.dish,
    ingredients: row.ingredients,
    ingredientCount: row.ingredientCount,
    totalRecipeCost: row.totalRecipeCost,
    dishes: [row],
    dishCount: 1,
    message: ingredients.length
      ? undefined
      : "Dish found but has no recipe ingredients configured.",
  };
};
