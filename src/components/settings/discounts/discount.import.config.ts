import {Tables} from "@/api/db/tables.ts";
import type {
  ImportConfiguration,
  ImportDbLike,
  ImportField,
  ImportRecord,
} from "@/lib/data-import/types.ts";
import {type TFunc} from "@/lib/data-import/helpers.ts";
import {
  assertCsvMatchValues,
  buildMatchConditions,
  findCsvImportMatches,
  writeCsvImportRow,
} from "@/utils/csv-import.ts";
import {sanitizeTargetsForSave, validateTargetsForScope} from "@/lib/discount-engine/target-ids.ts";
import {
  parseDiscountCategory,
  parseImportBool,
  parseOptionalNumber,
  parseSchedules,
  parseStackingMode,
  parseTaxTreatment,
  resolveBxgyConditions,
  resolveDiscountTargets,
} from "@/components/settings/discounts/discount-import-helpers.ts";

export function createDiscountImportConfig({
  db,
  t,
}: {
  db: ImportDbLike;
  t: TFunc;
}): ImportConfiguration {
  const fields: ImportField[] = [
    {name: "name", label: t("admin:columns.name"), type: "string", required: true, aliases: ["Name", "Discount"]},
    {name: "type", label: t("admin:columns.type"), type: "string", required: true, aliases: ["Type", "Value type"]},
    {name: "min_rate", label: t("admin:columns.minRate"), type: "number", required: true, aliases: ["Min rate", "Value", "Rate"]},
    {name: "max_rate", label: t("admin:columns.maxRate"), type: "number", required: true, aliases: ["Max rate"]},
    {name: "priority", label: t("admin:columns.priority"), type: "number", defaultValue: 0, aliases: ["Priority"]},
    {name: "scope", label: t("discountEngine.scopes.cart", {defaultValue: "Scope"}), type: "string", defaultValue: "cart"},
    {name: "application_mode", label: t("discountEngine.applicationModes.manual", {defaultValue: "Application mode"}), type: "string", defaultValue: "manual"},
    {name: "category", label: t("discountEngine.categories.manual", {defaultValue: "Category"}), type: "string", defaultValue: "manual"},
    {name: "is_active", label: t("admin:columns.active", {defaultValue: "Active"}), type: "boolean", defaultValue: true},
    {name: "max_cap", label: t("discountEngine.fields.maxCap", {defaultValue: "Max cap"}), type: "number", optional: true},
    {name: "min_order_amount", label: t("discountEngine.fields.minOrderAmount", {defaultValue: "Min order amount"}), type: "number", optional: true},
    {name: "stacking_mode", label: t("discountEngine.fields.stackingMode", {defaultValue: "Stacking mode"}), type: "string", optional: true},
    {name: "tax_treatment", label: t("discountEngine.fields.taxTreatment", {defaultValue: "Tax treatment"}), type: "string", optional: true},
    {name: "stackable", label: t("discountEngine.fields.stackable", {defaultValue: "Stackable"}), type: "boolean", defaultValue: true},
    {name: "exclusive", label: t("discountEngine.fields.exclusive", {defaultValue: "Exclusive"}), type: "boolean", defaultValue: false},
    {name: "requires_reason", label: t("discountEngine.fields.requiresReason", {defaultValue: "Requires reason"}), type: "boolean", defaultValue: false},
    {name: "requires_approval", label: t("discountEngine.fields.requiresApproval", {defaultValue: "Requires approval"}), type: "boolean", defaultValue: false},
    {name: "category_names", label: t("admin:columns.categories"), type: "string[]", optional: true},
    {name: "item_names", label: t("admin:tabs.dishes", {defaultValue: "Dishes"}), type: "string[]", optional: true},
    {name: "floor_names", label: t("admin:columns.floor"), type: "string[]", optional: true},
    {name: "customer_tags", label: t("discountEngine.fields.customerTags", {defaultValue: "Customer tags"}), type: "string[]", optional: true},
    {name: "payment_type_names", label: t("admin:columns.paymentTypes"), type: "string[]", optional: true},
    {name: "buy_quantity", label: t("discountEngine.fields.buyQuantity", {defaultValue: "Buy quantity"}), type: "number", optional: true},
    {name: "get_quantity", label: t("discountEngine.fields.getQuantity", {defaultValue: "Get quantity"}), type: "number", optional: true},
    {name: "buy_category_names", label: t("discountEngine.fields.buyCategories", {defaultValue: "Buy categories"}), type: "string[]", optional: true},
    {name: "buy_item_names", label: t("discountEngine.fields.buyItems", {defaultValue: "Buy items"}), type: "string[]", optional: true},
    {name: "get_category_names", label: t("discountEngine.fields.getCategories", {defaultValue: "Get categories"}), type: "string[]", optional: true},
    {name: "get_item_names", label: t("discountEngine.fields.getItems", {defaultValue: "Get items"}), type: "string[]", optional: true},
    {name: "get_value_type", label: t("discountEngine.fields.getValueType", {defaultValue: "Get value type"}), type: "string", optional: true},
    {name: "get_value", label: t("discountEngine.fields.getValue", {defaultValue: "Get value"}), type: "number", optional: true},
    {name: "schedules", label: t("discountEngine.fields.schedules", {defaultValue: "Schedules"}), type: "string", optional: true},
  ];

  const parseDiscountType = (raw: unknown): "Percent" | "Fixed" => {
    const value = String(raw ?? "").trim().toLowerCase();
    if (value === "percent" || value === "%") return "Percent";
    if (value === "fixed" || value === "fixed_amount" || value === "amount") return "Fixed";
    throw new Error(`Invalid discount type: ${raw}`);
  };

  return {
    id: "discounts",
    entityLabel: t("admin:buttons.discount", {defaultValue: "Discount"}),
    shape: "records",
    fields,
    matchFields: ["name"],
    defaultMode: "create",
    db,
    extractionInstructions:
      "Extract discount rules including category (buy_x_get_y for BXGY), targets by category/item/floor names, schedules JSON, and stacking/tax fields. Resolve names via list_* tools first.",
    onImportRow: async (record: ImportRecord, ctx) => {
      const values = record.values;
      const name = String(values.name ?? "").trim();
      if (!name) throw new Error(t("validation:required"));

      const type = parseDiscountType(values.type);
      const minRate = Number(values.min_rate);
      const maxRate = Number(values.max_rate);
      if (!Number.isFinite(minRate) || !Number.isFinite(maxRate)) {
        throw new Error(t("validation:mustBeNumber"));
      }

      const scope = String(values.scope ?? "cart").trim() || "cart";
      const category = parseDiscountCategory(values.category);
      const targets = sanitizeTargetsForSave(await resolveDiscountTargets(db, values));
      const bxgyConditions = await resolveBxgyConditions(db, {...values, category});
      const bxgyHasTargets = category === "buy_x_get_y" && Boolean(
        bxgyConditions?.buy_targets?.category_ids?.length
        || bxgyConditions?.buy_targets?.item_ids?.length
        || bxgyConditions?.get_targets?.category_ids?.length
        || bxgyConditions?.get_targets?.item_ids?.length,
      );
      if (!bxgyHasTargets && !validateTargetsForScope(scope, targets ?? {})) {
        throw new Error(t("discountEngine.validation.targetRequired"));
      }

      const minOrderAmount = parseOptionalNumber(values.min_order_amount);
      const maxCap = parseOptionalNumber(values.max_cap);

      const payload: Record<string, unknown> = {
        name,
        type,
        value_type: type === "Percent" ? "percent" : "fixed_amount",
        value: minRate,
        min_rate: minRate,
        max_rate: maxRate,
        min_value: minRate,
        max_value: maxRate,
        priority: Number(values.priority ?? 0) || 0,
        scope,
        application_mode: String(values.application_mode ?? "manual").trim() || "manual",
        category,
        is_active: parseImportBool(values.is_active, true),
        stackable: parseImportBool(values.stackable, true),
        exclusive: parseImportBool(values.exclusive, false),
        requires_reason: parseImportBool(values.requires_reason, false),
        requires_approval: parseImportBool(values.requires_approval, false),
        stacking_mode: parseStackingMode(values.stacking_mode),
        tax_treatment: parseTaxTreatment(values.tax_treatment),
        min_order_amount: minOrderAmount,
        targets,
        schedules: parseSchedules(values.schedules),
        conditions: bxgyConditions,
      };

      // max_cap is `none | float` in schema — omit when unset instead of sending null.
      if (maxCap !== null) {
        payload.max_cap = maxCap;
      }

      const rowData: Record<string, string> = {name};
      assertCsvMatchValues(rowData, ctx.matchFields, (field) =>
        t("common:csvImport.emptyMatchValue", {field}),
      );

      const conditions = buildMatchConditions(rowData, ctx.matchFields, (field, value) => {
        if (field === "priority" || field === "min_rate" || field === "max_rate") {
          return {column: field, value: Number(value)};
        }
        return {column: field, value};
      });

      const existing =
        ctx.mode === "create" ? [] : await findCsvImportMatches(db, Tables.discounts, conditions);

      await writeCsvImportRow(db as any, {
        mode: ctx.mode,
        table: Tables.discounts,
        existing,
        payload,
        notFoundMessage: t("common:csvImport.recordNotFound"),
        multipleMatchesMessage: t("common:csvImport.multipleMatches"),
      });
    },
  };
}
