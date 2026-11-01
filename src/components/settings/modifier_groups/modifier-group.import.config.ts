import {Tables} from "@/api/db/tables.ts";
import type {
  ImportConfiguration,
  ImportDbLike,
  ImportField,
  ImportRecord,
  ImportRowContext,
  ResolvedReference,
} from "@/lib/data-import/types.ts";
import {requireRefId, type TFunc} from "@/lib/data-import/helpers.ts";
import {optionalIdField} from "@/lib/data-import/match-by-id.ts";
import {toRecordId} from "@/lib/utils.ts";
import {recordIdToString} from "@/api/reports/shared/records.ts";
import {assertCsvMatchValues} from "@/utils/csv-import.ts";
import {fetchNextSequentialNumber} from "@/utils/recordNumbers.ts";

async function findGroupsByName(db: ImportDbLike, name: string): Promise<any[]> {
  const [rows] = await db.query(
    `SELECT id, name, priority, modifiers FROM ${Tables.modifier_groups}
     WHERE string::lowercase(name) = string::lowercase($name) AND deleted_at = none
     FETCH modifiers, modifiers.modifier`,
    {name}
  );
  return rows ?? [];
}

async function findGroupById(db: ImportDbLike, id: string): Promise<any | null> {
  const [rows] = await db.query(
    `SELECT id, name, priority, modifiers FROM ${Tables.modifier_groups}
     WHERE id = $id AND deleted_at = none
     LIMIT 1
     FETCH modifiers, modifiers.modifier`,
    {id: toRecordId(id)},
  );
  return rows?.[0] ?? null;
}

function modifierForDish(group: any, dishId: string): any | undefined {
  const target = recordIdToString(dishId) || dishId;
  return (group.modifiers ?? []).find((item: any) => {
    const nested = item?.modifier;
    const nestedId = nested?.id ?? nested;
    return (recordIdToString(nestedId) || String(nestedId ?? "")) === target;
  });
}

export function createModifierGroupImportConfig({
  db,
  t,
}: {
  db: ImportDbLike;
  t: TFunc;
}): ImportConfiguration {
  let numberSeq: number | null = null;

  const fields: ImportField[] = [
    optionalIdField(t),
    {
      name: "modifier_group_id",
      label: t("admin:columns.id", {defaultValue: "Modifier group ID"}),
      type: "string",
      optional: true,
      aliases: ["Group ID", "Modifier group ID"],
      description: "Existing modifier group record id. Prefer when group names collide.",
    },
    {
      name: "group",
      label: t("admin:columns.modifierGroups"),
      type: "string",
      required: true,
      aliases: ["Group", "Modifier group", "Name"],
      description:
        "Suggested modifier group name (e.g. Size, Size – Classic, Extra Topping)",
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
      type: "reference",
      required: true,
      aliases: ["Modifier", "Dish", "Dish name", "Dish number", "Size", "Option"],
      description:
        "Dish used as the modifier option (e.g. Small, Medium, Extra Topping). Pick an existing dish or create a new one.",
      lookup: {
        table: Tables.dishes,
        searchFields: ["name"],
        strategy: "create",
        createDefaults: {
          price: 0,
          cost: 0,
          priority: 0,
          categories: [],
        },
      },
    },
    {
      name: "price",
      label: t("admin:columns.salePrice"),
      type: "number",
      required: true,
      aliases: ["Price"],
      description: "Price for this modifier option within the group",
    },
  ];

  return {
    id: "modifier_groups",
    entityLabel: t("admin:buttons.modifierGroup", {defaultValue: "modifier group"}),
    shape: "records",
    fields,
    matchFields: ["group", "modifier"],
    defaultMode: "create",
    db,
    extractionInstructions: [
      "Extract modifier group lines from this menu document.",
      "Return one record per selectable option (size, topping, addon, crust choice, etc.).",
      "Suggest clear `group` names: use \"Size\" or \"Size – <tier name>\" when a block of items shares size price columns (S/M/L/F/P or Small/Medium/Large).",
      "When several item blocks share different size price tables, use distinct group names per price matrix (e.g. Size – Classic, Size – Crust).",
      "For global extras such as Extra Topping / Extra Cheese, use that phrase as the group name.",
      "Map each size letter or size word to `modifier` as a full dish name (expand S→Small, M→Medium, L→Large, F→Family, P→Party when those conventions apply).",
      "Put the listed option price in `price` as a plain number. Omit sizes that are not listed for that block; do not invent prices.",
      "Ignore photos, decorative text, and allergen notes.",
      "Nested next-group overrides are not imported in this flat import.",
    ].join(" "),
    onCreateMissingReference: async (field, label, createDb) => {
      if (field.name !== "modifier") {
        throw new Error(`Unsupported create for field "${field.name}"`);
      }
      if (numberSeq === null) {
        numberSeq = await fetchNextSequentialNumber(createDb as any, Tables.dishes, "number");
      }
      const number = String(numberSeq);
      numberSeq += 1;
      const created = await createDb.create?.(Tables.dishes, {
        name: label,
        number,
        price: 0,
        cost: 0,
        priority: 0,
        categories: [],
      });
      const row = Array.isArray(created) ? created[0] : created;
      if (!row?.id) {
        throw new Error(t("common:csvImport.recordNotFound"));
      }
      return {id: String(row.id), label};
    },
    onImportRow: async (record: ImportRecord, ctx: ImportRowContext) => {
      const values = record.values;
      const optionIdRaw = String(values.id ?? "").trim();
      const groupIdRaw = String(values.modifier_group_id ?? values.group_id ?? "").trim();
      const groupName = String(values.group ?? "").trim();
      if (!groupName && !groupIdRaw && !optionIdRaw) throw new Error(t("validation:required"));

      const price = Number(values.price);
      if (!Number.isFinite(price)) throw new Error(t("validation:mustBeNumber"));

      const priority = Number(values.priority ?? 0) || 0;

      const modifierRef = values.modifier as ResolvedReference | null;
      const dishId = String(
        requireRefId(modifierRef, t("toast:admin.invalidDishNameOrNumber"))
      );
      const modifierKey = String(modifierRef?.label ?? "").trim() || dishId;

      const rowData: Record<string, string> = {group: groupName || groupIdRaw, modifier: modifierKey};
      if (!optionIdRaw && !groupIdRaw) {
        assertCsvMatchValues(rowData, ctx.matchFields, (field) =>
          t("common:csvImport.emptyMatchValue", {field})
        );
      }

      if (ctx.mode === "update" && optionIdRaw) {
        const [opts] = await db.query(
          `SELECT id FROM ${Tables.modifiers} WHERE id = $id LIMIT 1`,
          {id: toRecordId(optionIdRaw)},
        );
        const option = opts?.[0];
        if (!option) throw new Error(t("common:csvImport.recordNotFound"));
        await db.merge?.(option.id, {
          modifier: toRecordId(dishId),
          price,
        });
        let groupTarget: any = groupIdRaw ? toRecordId(groupIdRaw) : null;
        if (!groupTarget) {
          const [parentGroups] = await db.query(
            `SELECT id FROM ${Tables.modifier_groups}
             WHERE $option IN modifiers AND deleted_at = none LIMIT 1`,
            {option: toRecordId(optionIdRaw)},
          );
          if (parentGroups?.[0]?.id) groupTarget = toRecordId(parentGroups[0].id);
        }
        if (groupTarget) {
          await db.merge?.(groupTarget, {
            ...(groupName ? {name: groupName} : {}),
            priority,
          });
        }
        return;
      }

      let group: any = null;
      if (groupIdRaw) {
        group = await findGroupById(db, groupIdRaw);
        if (!group) throw new Error(t("common:csvImport.recordNotFound"));
      } else {
        const groups = await findGroupsByName(db, groupName);
        if (groups.length > 1) {
          throw new Error(t("common:csvImport.multipleMatches"));
        }
        group = groups[0];
      }
      const existingModifier = group ? modifierForDish(group, dishId) : undefined;

      if (ctx.mode === "update") {
        if (!group || !existingModifier) {
          throw new Error(t("common:csvImport.recordNotFound"));
        }
        await db.merge?.(existingModifier.id, {
          modifier: toRecordId(dishId),
          price,
        });
        await db.merge?.(group.id, {name: groupName || group.name, priority});
        return;
      }

      if (ctx.mode === "create" && existingModifier) {
        throw new Error(
          t("common:csvImport.multipleMatches", {
            defaultValue: "This modifier is already in the group",
          })
        );
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
        const modifierId = recordIdToString(modifierRow.id) || String(modifierRow.id);
        await db.query(`UPDATE $group SET modifiers += $modifier`, {
          group: toRecordId(group.id),
          modifier: toRecordId(modifierId),
        });
        await db.merge?.(group.id, {name: groupName, priority});
        return;
      }

      await db.create?.(Tables.modifier_groups, {
        name: groupName,
        priority,
        modifiers: [toRecordId(modifierRow.id)],
      });
    },
  };
}
