import {Tables} from "@/api/db/tables.ts";
import type {
  ImportConfiguration,
  ImportDbLike,
  ImportField,
  ImportRecord,
  ResolvedReference,
} from "@/lib/data-import/types.ts";
import {parseImportBool, requireRefId, type TFunc} from "@/lib/data-import/helpers.ts";
import {toRecordId} from "@/lib/utils.ts";

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
    },
    {
      name: "has_required_modifiers",
      label: t("admin:columns.hasRequiredModifiers"),
      type: "boolean",
      defaultValue: false,
    },
    {
      name: "required_modifiers",
      label: t("admin:forms.requiredModifiers"),
      type: "number",
      defaultValue: 0,
    },
    {
      name: "should_auto_open",
      label: t("admin:columns.shouldAutoOpen"),
      type: "boolean",
      defaultValue: false,
    },
    {
      name: "should_auto_select",
      label: t("admin:columns.shouldAutoSelect"),
      type: "boolean",
      defaultValue: false,
    },
  ];

  return {
    id: "dish_modifier_groups",
    entityLabel: t("admin:buttons.importModifierGroups", {defaultValue: "Dish modifier group"}),
    shape: "records",
    fields,
    defaultMode: "create",
    db,
    extractionInstructions:
      "Extract dish-to-modifier-group links with dish number, modifier group name, priority, and auto-open/select flags.",
    onImportRow: async (record: ImportRecord) => {
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

      const [existing] = await db.query(
        `SELECT count() AS count FROM ${Tables.dish_modifier_groups} WHERE in = $dish AND out = $group GROUP ALL`,
        {dish: dishId, group: groupId}
      );
      if ((existing?.[0]?.count ?? 0) > 0) {
        throw new Error(t("toast:admin.duplicateDishModifierGroup"));
      }

      const priority = Number(v.priority);
      if (!Number.isFinite(priority)) {
        throw new Error(t("toast:admin.invalidPriority"));
      }

      const hasRequiredModifiers = parseImportBool(v.has_required_modifiers);
      const requiredModifiers = Number(v.required_modifiers ?? 0);
      if (!Number.isFinite(requiredModifiers) || requiredModifiers < 0) {
        throw new Error(t("toast:admin.invalidRequiredModifiers"));
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
          has_required_modifiers: hasRequiredModifiers,
          should_auto_open: parseImportBool(v.should_auto_open),
          required_modifiers: requiredModifiers,
          should_auto_select: parseImportBool(v.should_auto_select),
          priority,
        }
      );
    },
  };
}
