import {Tables} from "@/api/db/tables.ts";
import type {ImportConfiguration, ImportDbLike, ImportField, ImportRecord} from "@/lib/data-import/types.ts";
import {parseImportBool, type TFunc} from "@/lib/data-import/helpers.ts";
import {assertCsvMatchValues, buildMatchConditions, findCsvImportMatches, writeCsvImportRow} from "@/utils/csv-import.ts";
import {toRecordId} from "@/lib/utils.ts";
import {recordToString} from "@/api/reports/shared/records.ts";

const unwrapRows = <T>(result: unknown): T[] => {
  if (Array.isArray(result) && Array.isArray(result[0])) return result[0] as T[];
  return [];
};

async function resolveRefByName(db: ImportDbLike, table: string, name: string): Promise<unknown> {
  const rows = unwrapRows<{id: unknown}>(
    await db.query(
      `SELECT id FROM ${table} WHERE deleted_at = NONE AND string::lowercase(name) = string::lowercase($name) LIMIT 1`,
      {name},
    ),
  );
  return rows[0]?.id ?? null;
}

export function createCouponImportConfig({db, t}: {db: ImportDbLike; t: TFunc}): ImportConfiguration {
  const fields: ImportField[] = [
    {name: "code", label: t("admin:columns.code"), type: "string", required: true},
    {name: "description", label: t("admin:columns.description"), type: "string", optional: true},
    {name: "coupon_type", label: t("admin:columns.couponType"), type: "string", required: true},
    {name: "discount_type", label: t("admin:columns.discountType"), type: "string", required: true},
    {name: "discount_value", label: t("admin:columns.discountValue"), type: "number", required: true},
    {name: "min_order_amount", label: t("admin:columns.minOrderAmount"), type: "number", optional: true},
    {name: "max_discount_amount", label: t("admin:columns.maxDiscountAmount"), type: "number", optional: true},
    {name: "usage_limit", label: t("admin:columns.usageLimit"), type: "number", optional: true},
    {name: "usage_limit_per_user", label: t("admin:columns.usageLimitPerUser"), type: "number", optional: true},
    {name: "priority", label: t("admin:columns.priority"), type: "number", defaultValue: 0},
    {name: "valid_days", label: t("admin:columns.validDays"), type: "string[]", optional: true},
    {name: "stackable", label: t("admin:columns.stackable"), type: "boolean", defaultValue: false},
    {name: "first_order_only", label: t("admin:columns.firstOrderOnly"), type: "boolean", defaultValue: false},
    {name: "is_active", label: t("admin:columns.active"), type: "boolean", defaultValue: true},
    {name: "start_time", label: t("admin:columns.startTime"), type: "string", optional: true},
    {name: "end_time", label: t("admin:columns.endTime"), type: "string", optional: true},
    {name: "category_names", label: t("admin:columns.categories"), type: "string[]", optional: true},
    {name: "item_names", label: t("admin:tabs.dishes"), type: "string[]", optional: true},
  ];

  return {
    id: "coupons",
    entityLabel: t("admin:buttons.coupon", {defaultValue: "Coupon"}),
    shape: "records",
    fields,
    matchFields: ["code"],
    defaultMode: "create",
    db,
    extractionInstructions: "Extract coupon codes with discount type/value, limits, valid days, and optional category/item targets by name.",
    onImportRow: async (record: ImportRecord, ctx) => {
      const values = record.values;
      const code = String(values.code ?? "").trim();
      if (!code) throw new Error(t("validation:required"));

      const categoryNames = Array.isArray(values.category_names)
        ? values.category_names.map(v => String(v).trim()).filter(Boolean)
        : [];
      const itemNames = Array.isArray(values.item_names)
        ? values.item_names.map(v => String(v).trim()).filter(Boolean)
        : [];
      const categoryIds: unknown[] = [];
      for (const name of categoryNames) {
        const id = await resolveRefByName(db, Tables.categories, name);
        if (!id) throw new Error(`Category not found: ${name}`);
        categoryIds.push(toRecordId(id));
      }
      const itemIds: unknown[] = [];
      for (const name of itemNames) {
        const rows = unwrapRows<{id: unknown}>(
          await db.query(
            `SELECT id FROM ${Tables.dishes} WHERE deleted_at = NONE AND (string::lowercase(name) = string::lowercase($name) OR number = $name) LIMIT 1`,
            {name},
          ),
        );
        if (!rows[0]?.id) throw new Error(`Dish not found: ${name}`);
        itemIds.push(toRecordId(rows[0].id));
      }

      const payload: Record<string, unknown> = {
        code,
        description: String(values.description ?? "").trim() || null,
        coupon_type: String(values.coupon_type ?? "").trim(),
        discount_type: String(values.discount_type ?? "").trim(),
        discount_value: Number(values.discount_value),
        min_order_amount: values.min_order_amount === undefined ? null : Number(values.min_order_amount),
        max_discount_amount: values.max_discount_amount === undefined ? null : Number(values.max_discount_amount),
        usage_limit: values.usage_limit === undefined ? null : Number(values.usage_limit),
        usage_limit_per_user: values.usage_limit_per_user === undefined ? null : Number(values.usage_limit_per_user),
        priority: Number(values.priority ?? 0) || 0,
        valid_days: Array.isArray(values.valid_days) ? values.valid_days : [],
        stackable: parseImportBool(values.stackable, false),
        first_order_only: parseImportBool(values.first_order_only, false),
        is_active: parseImportBool(values.is_active, true),
        start_time: values.start_time || null,
        end_time: values.end_time || null,
        categories: categoryIds,
        items: itemIds,
      };

      const rowData = {code};
      assertCsvMatchValues(rowData, ctx.matchFields, field => t("common:csvImport.emptyMatchValue", {field}));
      const conditions = buildMatchConditions(rowData, ctx.matchFields, (_field, value) => ({column: "code", value}));
      const existing = ctx.mode === "create" ? [] : await findCsvImportMatches(db, Tables.coupons, conditions);
      await writeCsvImportRow(db as any, {
        mode: ctx.mode,
        table: Tables.coupons,
        existing,
        payload: ctx.mode === "create" ? {...payload, used_count: 0} : payload,
        notFoundMessage: t("common:csvImport.recordNotFound"),
        multipleMatchesMessage: t("common:csvImport.multipleMatches"),
      });
    },
  };
}
