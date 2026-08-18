import {Tables} from "@/api/db/tables.ts";
import type {
  ImportConfiguration,
  ImportDbLike,
  ImportField,
  ImportRecord,
  ImportRowContext,
} from "@/lib/data-import/types.ts";
import {
  parseImportBool,
  resolveDishByNumberOrName,
  resolveInventoryItem,
  type TFunc,
} from "@/lib/data-import/helpers.ts";
import {
  assertCsvMatchValues,
  buildMatchConditions,
  findCsvImportMatches,
} from "@/utils/csv-import.ts";
import {toRecordId} from "@/lib/utils.ts";
import {canUseInDishRecipe} from "@/utils/inventoryItemTypes.ts";
import {StringRecordId} from "surrealdb";

export function createDishIngredientsImportConfig({
  db,
  t,
}: {
  db: ImportDbLike;
  t: TFunc;
}): ImportConfiguration {
  const fields: ImportField[] = [
    {
      name: "dish_number",
      label: t("admin:columns.dishNameOrNumber"),
      type: "string",
      required: true,
      aliases: ["Dish number", "Dish name", "Dish #", "Dish", "Menu item", "Menu item number"],
    },
    {
      name: "ingredient",
      label: t("admin:columns.ingredientNameOrNumber"),
      type: "string",
      required: true,
      aliases: ["Ingredient", "Ingredient name", "Name", "Number", "Item", "Code", "SKU"],
      description: t("admin:columns.ingredientNameOrNumber"),
    },
    {
      name: "quantity",
      label: t("admin:forms.quantity"),
      type: "number",
      required: true,
      aliases: ["Quantity", "Qty"],
    },
    {
      name: "cost",
      label: t("admin:columns.costPrice"),
      type: "number",
      optional: true,
      aliases: ["Cost", "Cost price"],
    },
    {
      name: "is_price_locked",
      label: t("admin:columns.isPriceLocked"),
      type: "boolean",
      defaultValue: false,
      aliases: ["Price locked", "Is price locked"],
    },
  ];

  const notFoundMessage = t("common:csvImport.recordNotFound");
  const multipleMatchesMessage = t("common:csvImport.multipleMatches");

  return {
    id: "dish_ingredients",
    entityLabel: t("admin:buttons.importIngredients", {defaultValue: "Dish ingredient"}),
    shape: "records",
    fields,
    matchFields: ["dish_number", "ingredient"],
    defaultMode: "create",
    db,
    extractionInstructions:
      "Extract dish recipe ingredient rows with dish (name or number), ingredient (name or code/number), quantity, optional cost, and price-lock flag.",
    onImportRow: async (record: ImportRecord, ctx: ImportRowContext) => {
      const v = record.values;
      const dishKey = String(v.dish_number ?? "").trim();
      const ingredientKey = String(v.ingredient ?? "").trim();
      if (!dishKey) throw new Error(t("toast:admin.invalidDishNameOrNumber"));
      if (!ingredientKey) throw new Error(t("toast:admin.invalidIngredient"));

      const dishResult = await resolveDishByNumberOrName(db, dishKey);
      if (dishResult.status === "ambiguous") {
        throw new Error(t("toast:admin.ambiguousDishName"));
      }
      if (dishResult.status !== "found") {
        throw new Error(t("toast:admin.invalidDishNameOrNumber"));
      }
      const dish = dishResult.dish;
      const dishId = toRecordId(dish.id);

      const inventoryItem = await resolveInventoryItem(db, ingredientKey);
      if (!inventoryItem) throw new Error(t("toast:admin.invalidIngredient"));
      if (!canUseInDishRecipe(inventoryItem)) {
        throw new Error(t("toast:admin.invalidIngredientType"));
      }

      const itemId = toRecordId(inventoryItem.id);

      const quantity = Number(v.quantity);
      if (!Number.isFinite(quantity) || quantity <= 0) {
        throw new Error(t("toast:admin.invalidQuantity"));
      }

      const costRaw = v.cost;
      const costValue =
        costRaw === null || costRaw === undefined || String(costRaw).trim() === ""
          ? Number(inventoryItem.price ?? 0)
          : Number(costRaw);
      if (!Number.isFinite(costValue) || costValue < 0) {
        throw new Error(t("toast:admin.invalidCost"));
      }

      const recipePayload = {
        menu_item: dishId,
        item: new StringRecordId(itemId.toString()),
        quantity,
        cost: costValue,
        is_price_locked: parseImportBool(v.is_price_locked),
      };

      const [existingRecipeRows] = await db.query(
        `SELECT id FROM ${Tables.dishes_recipes} WHERE menu_item = $dish AND item = $item LIMIT 2`,
        {dish: dishId, item: itemId}
      );
      const existingRecipes = existingRecipeRows ?? [];

      if (ctx.mode === "create") {
        if (existingRecipes.length > 0) {
          throw new Error(t("toast:admin.duplicateDishIngredient"));
        }
        if (!db.create) throw new Error("Database create is unavailable");
        const [recipeRecord] = await db.create(Tables.dishes_recipes, recipePayload);
        const existingItems = Array.isArray(dish.items) ? dish.items : [];
        if (!db.merge) throw new Error("Database merge is unavailable");
        await db.merge(dishId, {
          items: [...existingItems.map((id: any) => toRecordId(id)), toRecordId(recipeRecord.id)],
        });
        return;
      }

      const rowData: Record<string, string> = {
        dish_number: dishKey,
        ingredient: ingredientKey,
      };
      assertCsvMatchValues(rowData, ctx.matchFields, (field) =>
        t("common:csvImport.emptyMatchValue", {field})
      );

      const conditions = buildMatchConditions(rowData, ctx.matchFields, (field, _value) => {
        if (field === "dish_number") {
          return {column: "menu_item", value: dishId};
        }
        if (field === "ingredient") {
          return {column: "item", value: itemId};
        }
        throw new Error(t("common:csvImport.unsupportedMatchField", {field}));
      });

      const matched = await findCsvImportMatches(db, Tables.dishes_recipes, conditions, {
        softDelete: false,
      });

      if (matched.length > 1) {
        throw new Error(multipleMatchesMessage);
      }

      if (matched.length === 1) {
        if (!db.merge) throw new Error("Database merge is unavailable");
        await db.merge(matched[0].id, {
          quantity,
          cost: costValue,
          is_price_locked: parseImportBool(v.is_price_locked),
        });
        return;
      }

      if (ctx.mode === "update") {
        throw new Error(notFoundMessage);
      }

      if (!db.create) throw new Error("Database create is unavailable");
      const [recipeRecord] = await db.create(Tables.dishes_recipes, recipePayload);
      const existingItems = Array.isArray(dish.items) ? dish.items : [];
      if (!db.merge) throw new Error("Database merge is unavailable");
      await db.merge(dishId, {
        items: [...existingItems.map((id: any) => toRecordId(id)), toRecordId(recipeRecord.id)],
      });
    },
  };
}
