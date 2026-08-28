import {Tables} from "@/api/db/tables.ts";
import type {
  ImportConfiguration,
  ImportDbLike,
  ImportField,
  ImportRecord,
  ResolvedReference,
} from "@/lib/data-import/types.ts";
import {toRecordId} from "@/lib/utils.ts";
import {
  assertCsvMatchValues,
  buildMatchConditions,
  findCsvImportMatches,
  writeCsvImportRow,
} from "@/utils/csv-import.ts";
import {fetchNextSequentialNumber} from "@/utils/recordNumbers.ts";

type TFunc = (key: string, options?: any) => string;

type CreateDishImportConfigOptions = {
  db: ImportDbLike;
  t: TFunc;
};

/**
 * Dish/menu-item import configuration for the generic DataImportModal.
 * Linked records (e.g. categories) are created via lookup.strategy + createDefaults
 * in the shared engine — not dish-specific create helpers.
 */
export function createDishImportConfig({
  db,
  t,
}: CreateDishImportConfigOptions): ImportConfiguration {
  let numberSeq: number | null = null;

  const ensureNumber = async (current: any): Promise<string> => {
    const existing = current === null || current === undefined ? "" : String(current).trim();
    if (existing) return existing;
    if (numberSeq === null) {
      numberSeq = await fetchNextSequentialNumber(db as any, Tables.dishes, "number");
    }
    const next = String(numberSeq);
    numberSeq += 1;
    return next;
  };

  const fields: ImportField[] = [
    {
      name: "name",
      label: t("admin:columns.name"),
      type: "string",
      required: true,
      aliases: ["Name", "Dish", "Item", "Product", "Menu Item"],
      description: "Product or dish name",
    },
    {
      name: "number",
      label: t("admin:columns.number"),
      type: "string",
      aliases: ["Number", "No", "Code", "SKU", "#"],
      description: "Internal item number; leave blank to auto-assign",
    },
    {
      name: "priority",
      label: t("admin:columns.priority"),
      type: "number",
      defaultValue: 0,
      aliases: ["Priority", "Sort", "Order"],
      description: "Display sort priority",
    },
    {
      name: "price",
      label: t("admin:columns.salePrice"),
      type: "number",
      required: true,
      aliases: ["Price", "Sale Price", "Sale", "Amount", "Cost to customer"],
      description: "Sale price as a number",
    },
    {
      name: "cost",
      label: t("admin:columns.costPrice"),
      type: "number",
      defaultValue: 0,
      aliases: ["Cost", "Cost Price", "COGS"],
      description: "Cost price; default 0 if missing",
    },
    {
      name: "categories",
      label: t("admin:columns.categories"),
      type: "reference[]",
      required: true,
      aliases: ["Category", "Categories", "Section", "Group"],
      description: "Menu category name(s)",
      lookup: {
        table: Tables.categories,
        searchFields: ["name"],
        strategy: "create",
        createDefaults: {
          priority: 0,
          show_in_menu: true,
        },
      },
    },
  ];

  return {
    id: "dishes",
    entityLabel: t("admin:buttons.dish", {defaultValue: "Dish"}),
    shape: "records",
    fields,
    matchFields: ["number"],
    defaultMode: "create",
    db,
    extractionInstructions: [
      "Extract all products / dishes / menu items from this menu document.",
      "Return one structured record per product.",
      "Map product names to `name`, prices to `price`, and section/category headings to `categories`.",
      "If a section header applies to multiple items below it, use that section as the category for those items.",
      "Do not invent missing prices or names. Use null when unknown.",
      "Ignore modifiers, extras, taxes, and allergen notes unless they are clearly priced as separate products.",
    ].join(" "),
    onImportRow: async (record: ImportRecord, ctx) => {
      const values = record.values;
      const name = String(values.name ?? "").trim();
      if (!name) {
        throw new Error(t("validation:required"));
      }

      const number = await ensureNumber(values.number);
      const priority = Number(values.priority ?? 0);
      const price = Number(values.price);
      const cost = Number(values.cost ?? 0);

      if (!Number.isFinite(price)) {
        throw new Error(t("validation:mustBeNumber"));
      }

      const categoryRefs = (values.categories as ResolvedReference[]) || [];
      if (categoryRefs.length === 0) {
        throw new Error(t("toast:admin.invalidCategories"));
      }

      const categoryIds = categoryRefs.map((ref) => {
        if (!ref.id) {
          throw new Error(
            t("common:dataImport.unresolvedCategory", {name: ref.label || ""})
          );
        }
        return toRecordId(ref.id);
      });

      const rowData: Record<string, string> = {
        name,
        number,
        priority: String(priority),
        price: String(price),
        cost: String(cost),
      };

      assertCsvMatchValues(rowData, ctx.matchFields, (field) =>
        t("common:csvImport.emptyMatchValue", {field})
      );

      const dishData: any = {
        name,
        number,
        priority: Number.isFinite(priority) ? priority : 0,
        price,
        cost: Number.isFinite(cost) ? cost : 0,
        categories: categoryIds,
      };

      const conditions = buildMatchConditions(rowData, ctx.matchFields, (field, value) => {
        if (field === "price") {
          return {column: "price", value: Number(value)};
        }
        if (field === "cost") {
          return {column: "cost", value: Number(value)};
        }
        if (field === "priority") {
          return {column: "priority", value: Number(value)};
        }
        if (field === "categories") {
          throw new Error(t("common:csvImport.unsupportedMatchField", {field}));
        }
        return {column: field, value};
      });

      const existing =
        ctx.mode === "create"
          ? []
          : await findCsvImportMatches(db, Tables.dishes, conditions);

      await writeCsvImportRow(db as any, {
        mode: ctx.mode,
        table: Tables.dishes,
        existing,
        payload: dishData,
        notFoundMessage: t("common:csvImport.recordNotFound"),
        multipleMatchesMessage: t("common:csvImport.multipleMatches"),
      });
    },
  };
}
