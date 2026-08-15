import {Tables} from "@/api/db/tables.ts";
import type {
  ImportConfiguration,
  ImportDbLike,
  ImportField,
  ImportRecord,
} from "@/lib/data-import/types.ts";
import {parseImportBool, type TFunc} from "@/lib/data-import/helpers.ts";
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
      label: `${t("admin:buttons.dish")} ${t("admin:columns.number")}`,
      type: "string",
      required: true,
      aliases: ["Dish number", "Dish #", "Menu item number"],
    },
    {
      name: "ingredient",
      label: t("admin:columns.ingredient"),
      type: "string",
      required: true,
      aliases: ["Ingredient", "Item", "Code", "SKU"],
      description: "Inventory item code or name",
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

  return {
    id: "dish_ingredients",
    entityLabel: t("admin:buttons.importIngredients", {defaultValue: "Dish ingredient"}),
    shape: "records",
    fields,
    defaultMode: "create",
    db,
    extractionInstructions:
      "Extract dish recipe ingredient rows with dish number, ingredient (code or name), quantity, optional cost, and price-lock flag.",
    onImportRow: async (record: ImportRecord) => {
      const v = record.values;
      const dishNumber = String(v.dish_number ?? "").trim();
      const ingredientKey = String(v.ingredient ?? "").trim();
      if (!dishNumber) throw new Error(t("toast:admin.invalidDishNumber"));
      if (!ingredientKey) throw new Error(t("toast:admin.invalidIngredient"));

      const [dishes] = await db.query(
        `SELECT id, items FROM ${Tables.dishes} WHERE number = $number AND deleted_at = none`,
        {number: dishNumber}
      );
      if (!dishes?.length) throw new Error(t("toast:admin.invalidDishNumber"));
      const dish = dishes[0];
      const dishId = toRecordId(dish.id);

      const [byCode] = await db.query(
        `SELECT id, name, code, price, item_types, item_type FROM ${Tables.inventory_items} WHERE code = $key`,
        {key: ingredientKey}
      );
      let inventoryItem = byCode?.[0];
      if (!inventoryItem) {
        const [byName] = await db.query(
          `SELECT id, name, code, price, item_types, item_type FROM ${Tables.inventory_items} WHERE name = $key`,
          {key: ingredientKey}
        );
        inventoryItem = byName?.[0];
      }
      if (!inventoryItem) throw new Error(t("toast:admin.invalidIngredient"));
      if (!canUseInDishRecipe(inventoryItem)) {
        throw new Error(t("toast:admin.invalidIngredientType"));
      }

      const itemId = toRecordId(inventoryItem.id);
      const [existing] = await db.query(
        `SELECT count() AS count FROM ${Tables.dishes_recipes} WHERE menu_item = $dish AND item = $item GROUP ALL`,
        {dish: dishId, item: itemId}
      );
      if ((existing?.[0]?.count ?? 0) > 0) {
        throw new Error(t("toast:admin.duplicateDishIngredient"));
      }

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

      if (!db.create) throw new Error("Database create is unavailable");
      const [recipeRecord] = await db.create(Tables.dishes_recipes, {
        menu_item: dishId,
        item: new StringRecordId(itemId.toString()),
        quantity,
        cost: costValue,
        is_price_locked: parseImportBool(v.is_price_locked),
      });

      const existingItems = Array.isArray(dish.items) ? dish.items : [];
      if (!db.merge) throw new Error("Database merge is unavailable");
      await db.merge(dishId, {
        items: [...existingItems.map((id: any) => toRecordId(id)), toRecordId(recipeRecord.id)],
      });
    },
  };
}
