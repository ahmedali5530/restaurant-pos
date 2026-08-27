import {Tables} from "@/api/db/tables.ts";
import type {
  ImportConfiguration,
  ImportDbLike,
  ImportField,
  ImportRecord,
  ImportRowContext,
  ResolvedReference,
} from "@/lib/data-import/types.ts";
import {parseImportBool, requireRefId, type TFunc} from "@/lib/data-import/helpers.ts";
import {toRecordId} from "@/lib/utils.ts";

/** Detect Size / crust choice groups that should require exactly one selection. */
export function isSizeLikeModifierGroupName(name: string): boolean {
  const n = String(name ?? "").trim().toLowerCase();
  if (!n) return false;
  if (/\bsize\b/.test(n)) return true;
  if (/\b(crust|portion|variant)\b/.test(n)) return true;
  return false;
}

function groupLabelFromRow(row: Record<string, any>): string {
  const raw = row.modifier_group;
  if (raw && typeof raw === "object" && "label" in raw) {
    return String((raw as ResolvedReference).label ?? "");
  }
  return String(raw ?? "");
}

export function createDishModifiersImportConfig({
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
      name: "modifier_group",
      label: t("admin:columns.modifierGroups"),
      type: "reference",
      required: true,
      aliases: ["Modifier group", "Group"],
      lookup: {
        table: Tables.modifier_groups,
        searchFields: ["name"],
        strategy: "case_insensitive",
      },
    },
    {
      name: "priority",
      label: t("admin:columns.priority"),
      type: "number",
      required: true,
      aliases: ["Priority", "Sort"],
      defaultValue: 0,
    },
    {
      name: "has_required_modifiers",
      label: t("admin:columns.hasRequiredModifiers"),
      type: "boolean",
      defaultValue: false,
      transform: (value, row) => {
        if (isSizeLikeModifierGroupName(groupLabelFromRow(row))) return true;
        if (value === true || value === false) return value;
        return false;
      },
    },
    {
      name: "required_modifiers",
      label: t("admin:forms.requiredModifiers"),
      type: "number",
      defaultValue: 0,
      transform: (value, row) => {
        if (isSizeLikeModifierGroupName(groupLabelFromRow(row))) {
          const n = Number(value);
          return Number.isFinite(n) && n > 0 ? n : 1;
        }
        return Number(value ?? 0) || 0;
      },
    },
    {
      name: "should_auto_open",
      label: t("admin:columns.shouldAutoOpen"),
      type: "boolean",
      defaultValue: false,
      transform: (value, row) => {
        if (isSizeLikeModifierGroupName(groupLabelFromRow(row))) return true;
        if (value === true || value === false) return value;
        return false;
      },
    },
    {
      name: "should_auto_select",
      label: t("admin:columns.shouldAutoSelect"),
      type: "boolean",
      defaultValue: false,
    },
  ];

  const notFoundMessage = t("common:csvImport.recordNotFound");
  const multipleMatchesMessage = t("common:csvImport.multipleMatches");

  return {
    id: "dish_modifier_groups",
    entityLabel: t("admin:buttons.importModifierGroups", {defaultValue: "Dish modifier group"}),
    shape: "records",
    fields,
    matchFields: ["dish_number", "modifier_group"],
    defaultMode: "create",
    db,
    extractionInstructions: [
      "Extract dish-to-modifier-group links with dish number, modifier group name, priority, and auto-open/select flags.",
      "When attaching a Size (or Size – …) group, set has_required_modifiers=true, required_modifiers=1, and should_auto_open=true.",
      "Optional add-on groups (Extra Topping, Extra Cheese) usually have has_required_modifiers=false and should_auto_open=false unless the menu clearly requires them.",
      "Prefer existing modifier group names from the document (e.g. Size – Classic, Extra Topping).",
    ].join(" "),
    onImportRow: async (record: ImportRecord, ctx: ImportRowContext) => {
      const v = record.values;
      const dishNumber = String(v.dish_number ?? "").trim();
      if (!dishNumber) throw new Error(t("toast:admin.invalidDishNumber"));

      const [dishes] = await db.query(
        `SELECT id FROM ${Tables.dishes} WHERE number = $number AND deleted_at = none`,
        {number: dishNumber}
      );
      if (!dishes?.length) throw new Error(t("toast:admin.invalidDishNumber"));
      const dishId = toRecordId(dishes[0].id);

      const groupId = requireRefId(
        v.modifier_group as ResolvedReference,
        t("toast:admin.invalidModifierGroup")
      );

      const priority = Number(v.priority);
      if (!Number.isFinite(priority)) {
        throw new Error(t("toast:admin.invalidPriority"));
      }

      const hasRequiredModifiers = parseImportBool(v.has_required_modifiers);
      const requiredModifiers = Number(v.required_modifiers ?? 0);
      if (!Number.isFinite(requiredModifiers) || requiredModifiers < 0) {
        throw new Error(t("toast:admin.invalidRequiredModifiers"));
      }

      const edgePayload = {
        has_required_modifiers: hasRequiredModifiers,
        should_auto_open: parseImportBool(v.should_auto_open),
        required_modifiers: requiredModifiers,
        should_auto_select: parseImportBool(v.should_auto_select),
        priority,
      };

      const [existingEdgeRows] = await db.query(
        `SELECT id FROM ${Tables.dish_modifier_groups} WHERE in = $dish AND out = $group LIMIT 2`,
        {dish: dishId, group: groupId}
      );
      const existingEdges = existingEdgeRows ?? [];

      if (ctx.mode === "create") {
        if (existingEdges.length > 0) {
          throw new Error(t("toast:admin.duplicateDishModifierGroup"));
        }
        await db.query(
          `RELATE $dish->${Tables.dish_modifier_groups}->$group
           SET has_required_modifiers = $has_required_modifiers,
               should_auto_open = $should_auto_open,
               required_modifiers = $required_modifiers,
               should_auto_select = $should_auto_select,
               priority = $priority`,
          {
            dish: dishId,
            group: groupId,
            ...edgePayload,
          }
        );
        return;
      }

      if (existingEdges.length > 1) {
        throw new Error(multipleMatchesMessage);
      }

      if (existingEdges.length === 1) {
        await db.query(
          `UPDATE ${existingEdges[0].id} MERGE $payload`,
          {payload: edgePayload}
        );
        return;
      }

      if (ctx.mode === "update") {
        throw new Error(notFoundMessage);
      }

      await db.query(
        `RELATE $dish->${Tables.dish_modifier_groups}->$group
         SET has_required_modifiers = $has_required_modifiers,
             should_auto_open = $should_auto_open,
             required_modifiers = $required_modifiers,
             should_auto_select = $should_auto_select,
             priority = $priority`,
        {
          dish: dishId,
          group: groupId,
          ...edgePayload,
        }
      );
    },
  };
}
