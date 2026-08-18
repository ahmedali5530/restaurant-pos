import {Tables} from "@/api/db/tables.ts";
import type {
  ImportConfiguration,
  ImportDbLike,
  ImportField,
  ImportRecord,
  ImportRowContext,
} from "@/lib/data-import/types.ts";
import {resolveDishByNumberOrName, type TFunc} from "@/lib/data-import/helpers.ts";
import {toRecordId} from "@/lib/utils.ts";
import {recordIdToString} from "@/api/reports/shared/records.ts";
import {assertCsvMatchValues} from "@/utils/csv-import.ts";

async function findGroupsByName(db: ImportDbLike, name: string): Promise<any[]> {
  const [rows] = await db.query(
    `SELECT id, name, priority, modifiers FROM ${Tables.modifier_groups}
     WHERE string::lowercase(name) = string::lowercase($name) AND deleted_at = none
     FETCH modifiers, modifiers.modifier`,
    {name}
  );
  return rows ?? [];
}

function modifierForDish(group: any, dishId: string): any | undefined {
  const target = recordIdToString(dishId) || dishId;
  return (group.modifiers ?? []).find((item: any) => {
    const nested = item?.modifier;
    const nestedId = nested?.id ?? nested;
    return (recordIdToString(nestedId) || String(nestedId ?? "")) === target;
  });
}

function modifierIds(group: any): any[] {
  return (group.modifiers ?? []).map((item: any) => toRecordId(item.id ?? item));
}

export function createModifierGroupImportConfig({
  db,
  t,
}: {
  db: ImportDbLike;
  t: TFunc;
}): ImportConfiguration {
  const fields: ImportField[] = [
    {
      name: "group",
      label: t("admin:columns.modifierGroups"),
      type: "string",
      required: true,
      aliases: ["Group", "Modifier group", "Name"],
    },
    {
      name: "priority",
      label: t("admin:columns.priority"),
      type: "number",
      defaultValue: 0,
      aliases: ["Priority", "Sort"],
    },
    {
      name: "modifier",
      label: t("admin:columns.dishNameOrNumber"),
      type: "string",
      required: true,
      aliases: ["Modifier", "Dish", "Dish name", "Dish number"],
    },
    {
      name: "price",
      label: t("admin:columns.salePrice"),
      type: "number",
      required: true,
      aliases: ["Price"],
    },
  ];

  return {
    id: "modifier_groups",
    entityLabel: t("admin:buttons.modifierGroup", {defaultValue: "Modifier group"}),
    shape: "records",
    fields,
    matchFields: ["group", "modifier"],
    defaultMode: "create",
    db,
    extractionInstructions:
      "Extract modifier group lines with group name, optional display order (priority), dish name or number used as the modifier, and price. Nested next-group overrides are not imported. Dishes must already exist.",
    onImportRow: async (record: ImportRecord, ctx: ImportRowContext) => {
      const values = record.values;
      const groupName = String(values.group ?? "").trim();
      const modifierKey = String(values.modifier ?? "").trim();
      if (!groupName || !modifierKey) throw new Error(t("validation:required"));

      const price = Number(values.price);
      if (!Number.isFinite(price)) throw new Error(t("validation:mustBeNumber"));

      const priority = Number(values.priority ?? 0) || 0;

      const dishResult = await resolveDishByNumberOrName(db, modifierKey);
      if (dishResult.status === "ambiguous") {
        throw new Error(t("toast:admin.ambiguousDishName"));
      }
      if (dishResult.status !== "found") {
        throw new Error(t("toast:admin.invalidDishNameOrNumber"));
      }
      const dishId = String(dishResult.dish.id);

      const rowData: Record<string, string> = {group: groupName, modifier: modifierKey};
      assertCsvMatchValues(rowData, ctx.matchFields, (field) =>
        t("common:csvImport.emptyMatchValue", {field})
      );

      const groups = await findGroupsByName(db, groupName);
      if (groups.length > 1) {
        throw new Error(t("common:csvImport.multipleMatches"));
      }

      let group = groups[0];
      const existingModifier = group ? modifierForDish(group, dishId) : undefined;

      if (ctx.mode === "update") {
        if (!group || !existingModifier) {
          throw new Error(t("common:csvImport.recordNotFound"));
        }
        await db.merge?.(existingModifier.id, {
          modifier: toRecordId(dishId),
          price,
        });
        await db.merge?.(group.id, {name: groupName, priority});
        return;
      }

      if (ctx.mode === "create" && existingModifier) {
        throw new Error(t("common:csvImport.multipleMatches", {defaultValue: "This modifier is already in the group"}));
      }

      if (existingModifier) {
        await db.merge?.(existingModifier.id, {
          modifier: toRecordId(dishId),
          price,
        });
        await db.merge?.(group.id, {name: groupName, priority});
        return;
      }

      const createdModifier = await db.create?.(Tables.modifiers, {
        modifier: toRecordId(dishId),
        price,
        allowed_next_groups: [],
        next_group_overrides: [],
      });
      const modifierRow = Array.isArray(createdModifier) ? createdModifier[0] : createdModifier;
      if (!modifierRow?.id) throw new Error(t("common:csvImport.recordNotFound"));

      if (group) {
        await db.merge?.(group.id, {
          name: groupName,
          priority,
          modifiers: [...modifierIds(group), modifierRow.id],
        });
        return;
      }

      await db.create?.(Tables.modifier_groups, {
        name: groupName,
        priority,
        modifiers: [modifierRow.id],
      });
    },
  };
}
