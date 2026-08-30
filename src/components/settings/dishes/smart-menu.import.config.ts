import {Tables} from "@/api/db/tables.ts";
import type {
  ImportBatchContext,
  ImportBatchResult,
  ImportConfiguration,
  ImportDbLike,
  ImportField,
  ImportRecord,
  ResolvedReference,
} from "@/lib/data-import/types.ts";
import {requireRefId, type TFunc} from "@/lib/data-import/helpers.ts";
import {resolveReferences} from "@/lib/data-import/resolve-refs.ts";
import {toRecordId} from "@/lib/utils.ts";
import {recordIdToString} from "@/api/reports/shared/records.ts";
import {fetchNextSequentialNumber} from "@/utils/recordNumbers.ts";
import {isSizeLikeModifierGroupName} from "@/components/settings/dishes/dish-modifiers.import.config.ts";

const SIZE_CODE_NAMES: Record<string, string> = {
  S: "Small",
  M: "Medium",
  L: "Large",
  F: "Family",
  P: "Party",
  XL: "Extra Large",
};

const SIZE_GROUP_CATALOG_LIMIT = 40;

export type SmartMenuRecordType =
  | "dish"
  | "size_option"
  | "addon_option"
  | "dish_link"
  | "nested_override";

function normKey(value: string): string {
  return String(value ?? "").trim().toLowerCase();
}

function expandSizeName(code?: string, name?: string): string {
  const fromName = String(name ?? "").trim();
  if (fromName) return fromName;
  const codeKey = String(code ?? "").trim().toUpperCase();
  if (codeKey && SIZE_CODE_NAMES[codeKey]) return SIZE_CODE_NAMES[codeKey];
  return codeKey || fromName;
}

function asArray(value: any): any[] {
  return Array.isArray(value) ? value : [];
}

function priceNumber(value: any): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = typeof value === "number" ? value : Number(String(value).replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(n) ? n : null;
}

function pricesNearlyEqual(a: number, b: number): boolean {
  return Math.abs(a - b) < 0.0001;
}

/** Stable fingerprint of a size price matrix for comparing groups. */
export function sizeMatrixFingerprint(sizes: Array<{code?: string; name?: string; price?: any}>): string {
  return asArray(sizes)
    .map((size) => {
      const code = String(size?.code ?? "").trim().toUpperCase();
      const name = expandSizeName(code, size?.name);
      const price = priceNumber(size?.price);
      if (!name || price === null) return null;
      return `${normKey(name)}=${price}`;
    })
    .filter(Boolean)
    .sort()
    .join("|");
}

/**
 * Ensure price_groups in one OCR payload that share a display name but have
 * different size prices get unique group_name values before expand.
 */
export function dedupePriceGroupNames(priceGroups: any[]): any[] {
  const claimed = new Map<string, string>(); // normKey(group_name) -> fingerprint
  const usedNames = new Set<string>();
  const out: any[] = [];

  for (const pg of priceGroups) {
    const copy = {...pg, sizes: asArray(pg?.sizes).map((s: any) => ({...s}))};
    let groupName = String(copy?.group_name ?? copy?.id ?? "Size").trim() || "Size";
    const fp = sizeMatrixFingerprint(copy.sizes);
    let key = normKey(groupName);
    const existingFp = claimed.get(key);

    if (existingFp && existingFp !== fp) {
      let n = 2;
      let candidate = `${groupName} (${n})`;
      while (usedNames.has(normKey(candidate)) || claimed.has(normKey(candidate))) {
        n += 1;
        candidate = `${groupName} (${n})`;
      }
      groupName = candidate;
      key = normKey(groupName);
    }

    copy.group_name = groupName;
    claimed.set(key, fp || existingFp || "");
    usedNames.add(key);
    out.push(copy);
  }

  return out;
}

/**
 * Expand OCR menu graph into ordered flat review rows.
 */
export function expandSmartMenuGraph(parsed: any): Array<Record<string, any>> {
  const dishes = asArray(parsed?.dishes);
  const priceGroups = dedupePriceGroupNames(asArray(parsed?.price_groups));
  const addons = asArray(parsed?.addons);
  const links = asArray(parsed?.links);

  const priceGroupById = new Map<string, any>();
  for (const pg of priceGroups) {
    const id = String(pg?.id ?? pg?.group_name ?? "").trim();
    if (id) priceGroupById.set(normKey(id), pg);
    const name = String(pg?.group_name ?? "").trim();
    if (name) priceGroupById.set(normKey(name), pg);
  }

  const rows: Array<Record<string, any>> = [];

  for (const dish of dishes) {
    const name = String(dish?.name ?? "").trim();
    if (!name) continue;
    const priceGroupKey = String(dish?.price_group ?? "").trim();
    rows.push({
      record_type: "dish",
      name,
      number: dish?.number != null ? String(dish.number) : null,
      category: dish?.category ?? dish?.categories ?? null,
      group_name: null,
      modifier: null,
      price: 0,
      dish_name: name,
      price_group: priceGroupKey || null,
      parent_modifier: null,
      next_group: null,
      has_required_modifiers: true,
      required_modifiers: 1,
      should_auto_open: true,
    });
  }

  for (const pg of priceGroups) {
    const groupName = String(pg?.group_name ?? pg?.id ?? "Size").trim() || "Size";
    for (const size of asArray(pg?.sizes)) {
      const price = priceNumber(size?.price);
      if (price === null) continue;
      const code = String(size?.code ?? "").trim();
      const sizeName = expandSizeName(code, size?.name);
      if (!sizeName) continue;
      rows.push({
        record_type: "size_option",
        name: sizeName,
        number: null,
        category: null,
        group_name: groupName,
        modifier: sizeName,
        price,
        dish_name: null,
        price_group: String(pg?.id ?? groupName),
        parent_modifier: null,
        next_group: null,
        has_required_modifiers: null,
        required_modifiers: null,
        should_auto_open: null,
      });
    }
  }

  for (const addon of addons) {
    const groupName = String(addon?.group_name ?? addon?.modifier_name ?? "Extra Topping").trim();
    const modifierName = String(addon?.modifier_name ?? groupName).trim();
    if (!modifierName) continue;
    const pricesBySize =
      addon?.prices_by_size && typeof addon.prices_by_size === "object"
        ? addon.prices_by_size
        : {};
    const defaultPrice =
      priceNumber(addon?.price) ??
      priceNumber(Object.values(pricesBySize)[0]) ??
      0;

    rows.push({
      record_type: "addon_option",
      name: modifierName,
      number: null,
      category: null,
      group_name: groupName,
      modifier: modifierName,
      price: defaultPrice,
      dish_name: null,
      price_group: null,
      parent_modifier: null,
      next_group: null,
      has_required_modifiers: null,
      required_modifiers: null,
      should_auto_open: null,
    });

    for (const pg of priceGroups) {
      const parentGroupName = String(pg?.group_name ?? pg?.id ?? "Size").trim() || "Size";
      for (const size of asArray(pg?.sizes)) {
        const code = String(size?.code ?? "").trim().toUpperCase();
        const sizeName = expandSizeName(code, size?.name);
        if (!sizeName) continue;
        const overridePrice =
          priceNumber(pricesBySize[code]) ??
          priceNumber(pricesBySize[String(size?.code ?? "")]) ??
          priceNumber(pricesBySize[sizeName]) ??
          priceNumber(pricesBySize[normKey(sizeName)]);
        if (overridePrice === null) continue;
        rows.push({
          record_type: "nested_override",
          name: modifierName,
          number: null,
          category: null,
          group_name: parentGroupName,
          modifier: modifierName,
          price: overridePrice,
          dish_name: null,
          price_group: String(pg?.id ?? parentGroupName),
          parent_modifier: sizeName,
          next_group: groupName,
          has_required_modifiers: null,
          required_modifiers: null,
          should_auto_open: null,
        });
      }
    }
  }

  const explicitLinks = links.length
    ? links
    : dishes
        .filter((d: any) => d?.name && d?.price_group)
        .map((d: any) => ({dish: d.name, price_group: d.price_group}));

  for (const link of explicitLinks) {
    const dishName = String(link?.dish ?? link?.dish_name ?? "").trim();
    const pgKey = String(link?.price_group ?? link?.group ?? "").trim();
    if (!dishName || !pgKey) continue;
    const pg = priceGroupById.get(normKey(pgKey));
    const groupName = String(pg?.group_name ?? pgKey).trim();
    rows.push({
      record_type: "dish_link",
      name: dishName,
      number: null,
      category: null,
      group_name: groupName,
      modifier: null,
      price: null,
      dish_name: dishName,
      price_group: pgKey,
      parent_modifier: null,
      next_group: null,
      has_required_modifiers: true,
      required_modifiers: 1,
      should_auto_open: true,
    });
  }

  const order: Record<string, number> = {
    dish: 0,
    size_option: 1,
    addon_option: 2,
    dish_link: 3,
    nested_override: 4,
  };
  rows.sort(
    (a, b) => (order[String(a.record_type)] ?? 99) - (order[String(b.record_type)] ?? 99)
  );
  return rows;
}

async function findGroupByName(db: ImportDbLike, name: string): Promise<any | null> {
  const [rows] = await db.query(
    `SELECT id, name, priority, modifiers FROM ${Tables.modifier_groups}
     WHERE string::lowercase(name) = string::lowercase($name) AND deleted_at = none
     LIMIT 1
     FETCH modifiers, modifiers.modifier`,
    {name}
  );
  return rows?.[0] ?? null;
}

function modifierOptionName(modifierRow: any): string {
  const dish = modifierRow?.modifier;
  return String(dish?.name ?? "").trim();
}

type GroupBatchState = {
  id: string;
  name: string;
  /** option dish id -> modifier row id */
  modifierByDishId: Map<string, string>;
  /** normalized option name -> modifier row id */
  modifierByOptionName: Map<string, string>;
};

async function loadModifierOptionDishes(
  db: ImportDbLike
): Promise<Array<{id: string; name: string}>> {
  const [rows] = await db.query(
    `SELECT id, name FROM ${Tables.dishes}
     WHERE deleted_at = none
       AND id IN (SELECT VALUE modifier FROM ${Tables.modifiers} WHERE modifier != NONE)
     ORDER BY name ASC`
  );
  const seen = new Set<string>();
  const out: Array<{id: string; name: string}> = [];
  for (const row of rows ?? []) {
    const id = recordIdToString(row?.id) || String(row?.id ?? "");
    const name = String(row?.name ?? "").trim();
    if (!id || !name || seen.has(id)) continue;
    seen.add(id);
    out.push({id, name});
  }
  return out;
}

async function findModifierOptionDishByName(
  db: ImportDbLike,
  name: string
): Promise<string | null> {
  const key = normKey(name);
  if (!key) return null;
  const options = await loadModifierOptionDishes(db);
  const hits = options.filter((o) => normKey(o.name) === key);
  if (hits.length === 1) return hits[0].id;
  return null;
}

async function allocateUniqueDishNumber(
  db: ImportDbLike,
  ensureNumber: (current: any) => Promise<string>,
  preferred?: string | null
): Promise<string> {
  let number =
    preferred !== null && preferred !== undefined && String(preferred).trim()
      ? String(preferred).trim()
      : await ensureNumber(null);
  for (let attempt = 0; attempt < 500; attempt++) {
    const [rows] = await db.query(
      `SELECT id FROM ${Tables.dishes} WHERE number = $number AND deleted_at = none LIMIT 1`,
      {number}
    );
    if (!rows?.[0]?.id) return number;
    number = await ensureNumber(null);
  }
  throw new Error("Could not allocate a unique dish number");
}

async function appendModifierToGroup(
  db: ImportDbLike,
  groupId: string,
  modifierId: string
): Promise<void> {
  const groupRec = toRecordId(groupId);
  const modifierRec = toRecordId(modifierId);
  await db.query(`UPDATE $group SET modifiers += $modifier`, {
    group: groupRec,
    modifier: modifierRec,
  });
}

async function resolveSmartMenuReferences(
  config: ImportConfiguration,
  records: ImportRecord[],
  options?: {signal?: AbortSignal}
): Promise<void> {
  const db = config.db;
  if (!db) return;

  const modifierField = config.fields.find((f) => f.name === "modifier");
  const savedModifierLookup = modifierField?.lookup;
  if (modifierField) {
    delete (modifierField as {lookup?: ImportField["lookup"]}).lookup;
  }

  await resolveReferences(config, records, options);

  if (modifierField && savedModifierLookup) {
    modifierField.lookup = savedModifierLookup;
  }

  const modifierOptions = await loadModifierOptionDishes(db);
  const dropdownCandidates = modifierOptions.map((c) => ({
    label: c.name,
    value: c.id,
  }));

  for (const record of records) {
    const type = String(record.values.record_type ?? "").trim();
    if (type !== "size_option" && type !== "addon_option") continue;

    const ref = record.values.modifier as ResolvedReference | null;
    if (!ref?.label) {
      record.values.modifier = null;
      continue;
    }

    // User explicitly picked an existing dish in review.
    if (ref.id && ref.create !== true) continue;

    const label = ref.label.trim();
    const key = normKey(label);
    const hits = modifierOptions.filter((o) => normKey(o.name) === key);

    if (hits.length === 1) {
      record.values.modifier = {label: hits[0].name, id: hits[0].id, create: false};
      continue;
    }

    if (hits.length > 1) {
      record.values.modifier = {
        label,
        candidates: hits.map((h) => ({label: h.name, value: h.id})),
      };
      record.issues.push({
        field: "modifier",
        code: "ambiguous_reference",
        severity: "error",
        message: `Multiple modifier-option dishes match "${label}"`,
      });
      continue;
    }

    record.values.modifier = {
      label,
      create: true,
      candidates: dropdownCandidates,
    };
    record.issues.push({
      field: "modifier",
      code: "unresolved_reference",
      severity: "warning",
      message: `"${label}" will be created`,
    });
  }
}

function groupConflictsWithPrices(
  group: any,
  intended: Map<string, number>
): boolean {
  for (const item of asArray(group?.modifiers)) {
    const optionName = modifierOptionName(item);
    if (!optionName) continue;
    const intendedPrice = intended.get(normKey(optionName));
    if (intendedPrice === undefined) continue;
    const existingPrice = Number(item?.price);
    if (Number.isFinite(existingPrice) && !pricesNearlyEqual(existingPrice, intendedPrice)) {
      return true;
    }
  }
  return false;
}

async function allocateUniqueGroupName(db: ImportDbLike, base: string): Promise<string> {
  const trimmed = base.trim() || "Size";
  if (!(await findGroupByName(db, trimmed))) return trimmed;
  let n = 2;
  while (n < 1000) {
    const candidate = `${trimmed} (${n})`;
    if (!(await findGroupByName(db, candidate))) return candidate;
    n += 1;
  }
  return `${trimmed} (${Date.now()})`;
}

/**
 * Remap Size group_name on review rows so we never overwrite an existing
 * group's size prices with a different matrix. Mutates records in place.
 */
export async function remapSizeGroupsForPriceSafety(
  db: ImportDbLike,
  records: ImportRecord[]
): Promise<Map<string, string>> {
  /** original group_name (norm) -> resolved unique group_name */
  const resolvedByOriginal = new Map<string, string>();

  type Bucket = {
    originalName: string;
    intended: Map<string, number>;
    hintDish: string;
  };
  const buckets = new Map<string, Bucket>();

  for (const record of records) {
    const type = String(record.values.record_type ?? "").trim();
    if (type !== "size_option") continue;
    const originalName = String(record.values.group_name ?? "").trim();
    if (!originalName) continue;
    const sizeName = String(
      record.values.modifier?.label ?? record.values.name ?? ""
    ).trim();
    const price = Number(record.values.price);
    if (!sizeName || !Number.isFinite(price)) continue;

    const key = normKey(originalName);
    if (!buckets.has(key)) {
      buckets.set(key, {originalName, intended: new Map(), hintDish: ""});
    }
    const bucket = buckets.get(key)!;
    bucket.intended.set(normKey(sizeName), price);
  }

  // Prefer a dish name from the same price_group as a fork suffix hint
  for (const record of records) {
    const type = String(record.values.record_type ?? "").trim();
    if (type !== "dish_link" && type !== "dish") continue;
    const groupName = String(record.values.group_name ?? "").trim();
    const dishName = String(record.values.dish_name ?? record.values.name ?? "").trim();
    if (!groupName || !dishName) continue;
    const bucket = buckets.get(normKey(groupName));
    if (bucket && !bucket.hintDish) bucket.hintDish = dishName;
  }

  for (const [key, bucket] of buckets) {
    const existing = await findGroupByName(db, bucket.originalName);
    if (!existing) {
      resolvedByOriginal.set(key, bucket.originalName);
      continue;
    }
    if (!groupConflictsWithPrices(existing, bucket.intended)) {
      resolvedByOriginal.set(key, String(existing.name ?? bucket.originalName));
      continue;
    }
    const base = bucket.hintDish
      ? `${bucket.originalName} – ${bucket.hintDish}`
      : bucket.originalName;
    const unique = await allocateUniqueGroupName(db, base);
    resolvedByOriginal.set(key, unique);
  }

  for (const record of records) {
    const type = String(record.values.record_type ?? "").trim();
    if (type !== "size_option" && type !== "dish_link" && type !== "nested_override") {
      continue;
    }
    const originalName = String(record.values.group_name ?? "").trim();
    if (!originalName) continue;
    const resolved = resolvedByOriginal.get(normKey(originalName));
    if (resolved && resolved !== originalName) {
      record.values.group_name = resolved;
    }
  }

  return resolvedByOriginal;
}

async function loadSizeGroupCatalog(db: ImportDbLike): Promise<string[]> {
  const [rows] = await db.query(
    `SELECT name, modifiers FROM ${Tables.modifier_groups}
     WHERE deleted_at = none
     FETCH modifiers, modifiers.modifier`
  );
  const lines: string[] = [];
  for (const group of rows ?? []) {
    const name = String(group?.name ?? "").trim();
    if (!name || !isSizeLikeModifierGroupName(name)) continue;
    const parts = asArray(group?.modifiers)
      .map((m: any) => {
        const option = modifierOptionName(m);
        const price = Number(m?.price);
        if (!option || !Number.isFinite(price)) return null;
        return `${option}=${price}`;
      })
      .filter(Boolean);
    if (parts.length === 0) {
      lines.push(name);
    } else {
      lines.push(`${name} [${parts.join(", ")}]`);
    }
    if (lines.length >= SIZE_GROUP_CATALOG_LIMIT) break;
  }
  return lines;
}

export function createSmartMenuImportConfig({
  db,
  t,
}: {
  db: ImportDbLike;
  t: TFunc;
}): ImportConfiguration {
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
      name: "record_type",
      label: t("admin:columns.recordType", {defaultValue: "Row type"}),
      type: "string",
      required: true,
      description: "dish | size_option | addon_option | dish_link | nested_override",
      allowedValues: [
        "dish",
        "size_option",
        "addon_option",
        "dish_link",
        "nested_override",
      ],
    },
    {
      name: "name",
      label: t("admin:columns.name"),
      type: "string",
      description: "Dish / option display name",
    },
    {
      name: "number",
      label: t("admin:columns.number"),
      type: "string",
      description: "Dish number (auto if blank)",
    },
    {
      name: "category",
      label: t("admin:columns.categories"),
      type: "reference",
      optional: true,
      description: "Menu category for dish rows",
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
    {
      name: "group_name",
      label: t("admin:columns.modifierGroups"),
      type: "string",
      description: "Suggested modifier group name",
    },
    {
      name: "modifier",
      label: t("admin:columns.dishNameOrNumber"),
      type: "reference",
      optional: true,
      description: "Size or addon dish — pick existing or create",
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
      description: "Option price or nested override price",
    },
    {
      name: "dish_name",
      label: t("admin:columns.dishName", {defaultValue: "Dish"}),
      type: "string",
      description: "Parent menu item for links",
    },
    {
      name: "parent_modifier",
      label: t("admin:columns.parentModifier", {defaultValue: "Parent size"}),
      type: "string",
      description: "Size option that unlocks the nested group",
    },
    {
      name: "next_group",
      label: t("admin:columns.nextGroup", {defaultValue: "Next group"}),
      type: "string",
      description: "Nested modifier group name (e.g. Extra Topping)",
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
  ];

  return {
    id: "smart_menu",
    entityLabel: t("admin:buttons.smartImportMenuStructure", {
      defaultValue: "menu structure",
    }),
    shape: "records",
    extractionResponseMode: "graph",
    fields,
    matchFields: ["record_type", "name", "group_name"],
    defaultMode: "create",
    db,
    extractionInstructions: [
      "Extract a pizza/fast-food style menu as this JSON object:",
      '{"dishes":[{"name":"string","number":null,"category":"string|null","price_group":"id of matching price_groups entry"}],',
      '"price_groups":[{"id":"classic","group_name":"Size – Classic","sizes":[{"code":"S","name":"Small","price":699}]}],',
      '"addons":[{"group_name":"Extra Topping","modifier_name":"Extra Topping","prices_by_size":{"S":160,"M":260}}],',
      '"links":[{"dish":"Chicken Tikka","price_group":"classic"}]}',
      "Each distinct size price table MUST get a unique group_name (never reuse plain \"Size\" when multiple matrices exist).",
      "Prefer descriptive names from section/context (e.g. Size – Classic, Size – Crust, Size – Special).",
      "Do NOT model different dish size prices as nested Size groups. Size groups are always top-level and attached to dishes via links.",
      "Nesting is ONLY for addons like Extra Topping under each Size option (allowed next groups / size-based topping prices).",
      "If Known Size groups are listed and this document's prices differ from a listed group, invent a NEW group_name — do not reuse that name.",
      "Expand size letters when naming: S=Small, M=Medium, L=Large, F=Family, P=Party.",
      "List only sizes that appear for that block; do not invent missing sizes or prices.",
      "Put sell prices on sizes, not on the pizza dish (dishes are linked to a size group).",
      "Global extras like EXTRA TOPPING go in addons with prices_by_size keyed by size code.",
      "Ignore photos and decorative text.",
      "If links are omitted, dishes.price_group is used to attach each dish to its size group.",
    ].join(" "),
    enrichExtractionContext: async (database) => {
      const lines = await loadSizeGroupCatalog(database);
      if (lines.length === 0) return "";
      return [
        "Known Size groups already in the system (name [option=price, ...]):",
        lines.join("\n"),
        "If this document uses different size prices than a known group, invent a new unique group_name. Do not reuse a known name when prices differ.",
      ].join("\n");
    },
    onExpandExtracted: expandSmartMenuGraph,
    onResolveReferences: resolveSmartMenuReferences,
    onCreateMissingReference: async (field, label, createDb) => {
      if (field.name === "category") {
        const created = await createDb.create?.(Tables.categories, {
          name: label,
          priority: 0,
          show_in_menu: true,
        });
        const row = Array.isArray(created) ? created[0] : created;
        if (!row?.id) throw new Error(t("common:csvImport.recordNotFound"));
        return {id: String(row.id), label};
      }
      if (field.name === "modifier") {
        const number = await ensureNumber(null);
        const created = await createDb.create?.(Tables.dishes, {
          name: label,
          number,
          price: 0,
          cost: 0,
          priority: 0,
          categories: [],
        });
        const row = Array.isArray(created) ? created[0] : created;
        if (!row?.id) throw new Error(t("common:csvImport.recordNotFound"));
        return {id: String(row.id), label};
      }
      throw new Error(`Unsupported create for field "${field.name}"`);
    },
    onImportRow: async () => {
      // Batch handler performs persistence.
    },
    onImportBatch: async (records, ctx) =>
      importSmartMenuBatch({db, t, records, ctx, ensureNumber}),
  };
}

async function importSmartMenuBatch({
  db,
  t,
  records,
  ctx,
  ensureNumber,
}: {
  db: ImportDbLike;
  t: TFunc;
  records: ImportRecord[];
  ctx: ImportBatchContext;
  ensureNumber: (current: any) => Promise<string>;
}): Promise<ImportBatchResult> {
  const result: ImportBatchResult = {imported: 0, failed: []};
  /** Batch-created parent pizzas only — never prefilled from catalog by name. */
  const dishIdByName = new Map<string, string>();
  /** Batch-created option dishes (Small, Extra Topping, …). */
  const optionDishIdByName = new Map<string, string>();
  const groupStateByName = new Map<string, GroupBatchState>();

  const fail = (index: number, message: string) => {
    result.failed.push({index, message});
  };

  await remapSizeGroupsForPriceSafety(db, records);

  for (let i = 0; i < records.length; i++) {
    throwIfAbortedSafe(ctx.signal);
    ctx.onProgress?.(i + 1, records.length);
    const record = records[i];
    const v = record.values;
    const type = String(v.record_type ?? "").trim() as SmartMenuRecordType;
    const index = i;

    try {
      if (type === "dish") {
        await importDishRow({db, t, v, ensureNumber, dishIdByName});
        result.imported += 1;
        continue;
      }
      if (type === "size_option") {
        await importGroupOptionRow({
          db,
          t,
          v,
          kind: "size",
          ensureNumber,
          optionDishIdByName,
          groupStateByName,
        });
        result.imported += 1;
        continue;
      }
      if (type === "addon_option") {
        await importGroupOptionRow({
          db,
          t,
          v,
          kind: "addon",
          ensureNumber,
          optionDishIdByName,
          groupStateByName,
        });
        result.imported += 1;
        continue;
      }
      if (type === "dish_link") {
        await importDishLinkRow({db, t, v, dishIdByName, groupStateByName});
        result.imported += 1;
        continue;
      }
      if (type === "nested_override") {
        await importNestedOverrideRow({
          db,
          t,
          v,
          groupStateByName,
        });
        result.imported += 1;
        continue;
      }
      fail(index, t("common:dataImport.unknownRecordType", {type}));
    } catch (err: any) {
      fail(index, err?.message || String(err) || "Import failed");
    }
  }

  return result;
}

function throwIfAbortedSafe(signal?: AbortSignal) {
  if (signal?.aborted) {
    throw new Error("Import aborted");
  }
}

async function importDishRow({
  db,
  t,
  v,
  ensureNumber,
  dishIdByName,
}: {
  db: ImportDbLike;
  t: TFunc;
  v: Record<string, any>;
  ensureNumber: (current: any) => Promise<string>;
  dishIdByName: Map<string, string>;
}) {
  const name = String(v.name ?? v.dish_name ?? "").trim();
  if (!name) throw new Error(t("validation:required"));

  const batchId = dishIdByName.get(normKey(name));
  if (batchId) return;

  const number = await allocateUniqueDishNumber(db, ensureNumber, v.number);
  const categoryRef = v.category as ResolvedReference | null;
  const categories: any[] = [];
  if (categoryRef?.label) {
    categories.push(requireRefId(categoryRef, t("toast:admin.invalidCategories")));
  }

  const created = await db.create?.(Tables.dishes, {
    name,
    number,
    price: 0,
    cost: 0,
    priority: 0,
    categories,
  });
  const row = Array.isArray(created) ? created[0] : created;
  if (!row?.id) throw new Error(t("common:csvImport.recordNotFound"));
  dishIdByName.set(normKey(name), recordIdToString(row.id) || String(row.id));
}

async function ensureOptionDishId({
  db,
  t,
  ensureNumber,
  modifierRef,
  optionDishIdByName,
}: {
  db: ImportDbLike;
  t: TFunc;
  ensureNumber: (current: any) => Promise<string>;
  modifierRef: ResolvedReference | null;
  optionDishIdByName: Map<string, string>;
}): Promise<{dishId: string; optionName: string}> {
  const optionName = String(modifierRef?.label ?? "").trim();
  if (!optionName) throw new Error(t("toast:admin.invalidDishNameOrNumber"));

  if (modifierRef?.id && modifierRef.create !== true) {
    return {dishId: recordIdToString(modifierRef.id) || String(modifierRef.id), optionName};
  }

  const batchId = optionDishIdByName.get(normKey(optionName));
  if (batchId) return {dishId: batchId, optionName};

  const sharedId = await findModifierOptionDishByName(db, optionName);
  if (sharedId) {
    optionDishIdByName.set(normKey(optionName), sharedId);
    return {dishId: sharedId, optionName};
  }

  const number = await allocateUniqueDishNumber(db, ensureNumber, null);
  const created = await db.create?.(Tables.dishes, {
    name: optionName,
    number,
    price: 0,
    cost: 0,
    priority: 0,
    categories: [],
  });
  const row = Array.isArray(created) ? created[0] : created;
  if (!row?.id) throw new Error(t("common:csvImport.recordNotFound"));
  const dishId = recordIdToString(row.id) || String(row.id);
  optionDishIdByName.set(normKey(optionName), dishId);
  return {dishId, optionName};
}

async function ensureGroupState({
  db,
  groupName,
  kind,
  groupStateByName,
}: {
  db: ImportDbLike;
  groupName: string;
  kind: "size" | "addon";
  groupStateByName: Map<string, GroupBatchState>;
}): Promise<GroupBatchState> {
  const key = normKey(groupName);
  const existing = groupStateByName.get(key);
  if (existing) return existing;

  const group = await findGroupByName(db, groupName);
  if (group?.id) {
    const state: GroupBatchState = {
      id: recordIdToString(group.id) || String(group.id),
      name: String(group.name ?? groupName),
      modifierByDishId: new Map(),
      modifierByOptionName: new Map(),
    };
    for (const item of asArray(group.modifiers)) {
      const modifierId = recordIdToString(item?.id) || String(item?.id ?? "");
      const dish = item?.modifier;
      const dishId = recordIdToString(dish?.id ?? dish) || String(dish?.id ?? dish ?? "");
      const optionName = modifierOptionName(item);
      if (modifierId) {
        if (dishId) state.modifierByDishId.set(dishId, modifierId);
        if (optionName) state.modifierByOptionName.set(normKey(optionName), modifierId);
      }
    }
    groupStateByName.set(key, state);
    return state;
  }

  const createdGroup = await db.create?.(Tables.modifier_groups, {
    name: groupName,
    priority: kind === "size" ? 0 : 1,
    modifiers: [],
  });
  const groupRow = Array.isArray(createdGroup) ? createdGroup[0] : createdGroup;
  if (!groupRow?.id) throw new Error("Could not create modifier group");
  const state: GroupBatchState = {
    id: recordIdToString(groupRow.id) || String(groupRow.id),
    name: groupName,
    modifierByDishId: new Map(),
    modifierByOptionName: new Map(),
  };
  groupStateByName.set(key, state);
  return state;
}

async function forkGroupState({
  db,
  baseName,
  groupStateByName,
  kind,
}: {
  db: ImportDbLike;
  baseName: string;
  groupStateByName: Map<string, GroupBatchState>;
  kind: "size" | "addon";
}): Promise<GroupBatchState> {
  const uniqueName = await allocateUniqueGroupName(db, baseName);
  return ensureGroupState({db, groupName: uniqueName, kind, groupStateByName});
}

async function importGroupOptionRow({
  db,
  t,
  v,
  kind,
  ensureNumber,
  optionDishIdByName,
  groupStateByName,
}: {
  db: ImportDbLike;
  t: TFunc;
  v: Record<string, any>;
  kind: "size" | "addon";
  ensureNumber: (current: any) => Promise<string>;
  optionDishIdByName: Map<string, string>;
  groupStateByName: Map<string, GroupBatchState>;
}) {
  let groupName = String(v.group_name ?? "").trim();
  if (!groupName) throw new Error(t("validation:required"));
  const price = Number(v.price);
  if (!Number.isFinite(price)) throw new Error(t("validation:mustBeNumber"));

  const modifierRef = v.modifier as ResolvedReference | null;
  const {dishId, optionName} = await ensureOptionDishId({
    db,
    t,
    ensureNumber,
    modifierRef,
    optionDishIdByName,
  });
  const dishKey = recordIdToString(dishId) || dishId;

  let state = await ensureGroupState({db, groupName, kind, groupStateByName});

  const existingModifierId =
    state.modifierByDishId.get(dishKey) ??
    state.modifierByOptionName.get(normKey(optionName));

  if (existingModifierId) {
    const [rows] = await db.query(
      `SELECT id, price FROM ${Tables.modifiers} WHERE id = $id LIMIT 1`,
      {id: toRecordId(existingModifierId)}
    );
    const existingPrice = Number(rows?.[0]?.price);
    if (Number.isFinite(existingPrice) && !pricesNearlyEqual(existingPrice, price)) {
      state = await forkGroupState({db, baseName: groupName, groupStateByName, kind});
      groupName = state.name;
      v.group_name = groupName;
    } else {
      if (!Number.isFinite(existingPrice)) {
        await db.merge?.(existingModifierId, {
          modifier: toRecordId(dishId),
          price,
        });
      }
      state.modifierByDishId.set(dishKey, existingModifierId);
      state.modifierByOptionName.set(normKey(optionName), existingModifierId);
      return;
    }
  }

  const createdModifier = await db.create?.(Tables.modifiers, {
    modifier: toRecordId(dishId),
    price,
    allowed_next_groups: [],
    next_group_overrides: [],
  });
  const modifierRow = Array.isArray(createdModifier) ? createdModifier[0] : createdModifier;
  if (!modifierRow?.id) throw new Error(t("common:csvImport.recordNotFound"));
  const modifierId = recordIdToString(modifierRow.id) || String(modifierRow.id);

  await appendModifierToGroup(db, state.id, modifierId);
  state.modifierByDishId.set(dishKey, modifierId);
  state.modifierByOptionName.set(normKey(optionName), modifierId);
}

async function importDishLinkRow({
  db,
  t,
  v,
  dishIdByName,
  groupStateByName,
}: {
  db: ImportDbLike;
  t: TFunc;
  v: Record<string, any>;
  dishIdByName: Map<string, string>;
  groupStateByName: Map<string, GroupBatchState>;
}) {
  const dishName = String(v.dish_name ?? v.name ?? "").trim();
  const groupName = String(v.group_name ?? "").trim();
  if (!dishName || !groupName) throw new Error(t("validation:required"));

  const dishId = dishIdByName.get(normKey(dishName));
  if (!dishId) {
    throw new Error(t("toast:admin.invalidDishNameOrNumber"));
  }

  let groupState = groupStateByName.get(normKey(groupName));
  if (!groupState) {
    const group = await findGroupByName(db, groupName);
    if (!group?.id) throw new Error(t("toast:admin.invalidModifierGroup"));
    groupState = await ensureGroupState({
      db,
      groupName: String(group.name ?? groupName),
      kind: "size",
      groupStateByName,
    });
  }
  const groupId = groupState.id;

  const hasRequired =
    v.has_required_modifiers === true ||
    v.has_required_modifiers === false
      ? Boolean(v.has_required_modifiers)
      : isSizeLikeModifierGroupName(groupName);
  const requiredModifiers =
    Number(v.required_modifiers) > 0
      ? Number(v.required_modifiers)
      : hasRequired
        ? 1
        : 0;
  const shouldAutoOpen =
    v.should_auto_open === true || v.should_auto_open === false
      ? Boolean(v.should_auto_open)
      : hasRequired;

  const dishRec = toRecordId(dishId);
  const groupRec = toRecordId(groupId);

  const [existing] = await db.query(
    `SELECT id FROM ${Tables.dish_modifier_groups} WHERE in = $dish AND out = $group LIMIT 1`,
    {dish: dishRec, group: groupRec}
  );

  const payload = {
    has_required_modifiers: hasRequired,
    required_modifiers: requiredModifiers,
    should_auto_open: shouldAutoOpen,
    should_auto_select: false,
    priority: 0,
  };

  if (existing?.[0]?.id) {
    await db.query(`UPDATE $id MERGE $payload`, {id: existing[0].id, payload});
    return;
  }

  await db.query(
    `RELATE $dish->${Tables.dish_modifier_groups}->$group
     SET has_required_modifiers = $has_required_modifiers,
         should_auto_open = $should_auto_open,
         required_modifiers = $required_modifiers,
         should_auto_select = $should_auto_select,
         priority = $priority`,
    {dish: dishRec, group: groupRec, ...payload}
  );
}

async function importNestedOverrideRow({
  db,
  t,
  v,
  groupStateByName,
}: {
  db: ImportDbLike;
  t: TFunc;
  v: Record<string, any>;
  groupStateByName: Map<string, GroupBatchState>;
}) {
  const parentGroupName = String(v.group_name ?? "").trim();
  const parentModifierName = String(v.parent_modifier ?? "").trim();
  const nextGroupName = String(v.next_group ?? "").trim();
  const nestedName = String(v.modifier?.label ?? v.name ?? "").trim();
  const price = Number(v.price);
  if (!parentGroupName || !parentModifierName || !nextGroupName || !nestedName) {
    throw new Error(t("validation:required"));
  }
  if (!Number.isFinite(price)) throw new Error(t("validation:mustBeNumber"));

  const parentState = groupStateByName.get(normKey(parentGroupName));
  if (!parentState) {
    throw new Error(t("toast:admin.invalidModifierGroup"));
  }

  let nextState = groupStateByName.get(normKey(nextGroupName));
  if (!nextState) {
    nextState = await ensureGroupState({
      db,
      groupName: nextGroupName,
      kind: "addon",
      groupStateByName,
    });
  }

  const parentModifierId =
    parentState.modifierByOptionName.get(normKey(parentModifierName));
  if (!parentModifierId) {
    throw new Error(t("toast:admin.invalidDishNameOrNumber"));
  }

  const nestedModifierId =
    nextState.modifierByOptionName.get(normKey(nestedName));
  if (!nestedModifierId) {
    throw new Error(t("toast:admin.invalidDishNameOrNumber"));
  }

  const [parentRows] = await db.query(
    `SELECT id, allowed_next_groups, next_group_overrides FROM ${Tables.modifiers} WHERE id = $id LIMIT 1`,
    {id: toRecordId(parentModifierId)}
  );
  const parent = parentRows?.[0];
  if (!parent?.id) throw new Error(t("common:csvImport.recordNotFound"));

  const nextGroupRec = toRecordId(nextState.id);
  const allowed = asArray(parent.allowed_next_groups).map((g: any) => toRecordId(g?.id ?? g));
  const allowedKeys = new Set(allowed.map((id: any) => recordIdToString(id) || String(id)));
  const nextKey = recordIdToString(nextGroupRec) || String(nextGroupRec);
  if (!allowedKeys.has(nextKey)) {
    allowed.push(nextGroupRec);
  }

  const overrides = asArray(parent.next_group_overrides).map((o: any) => ({
    group_id: String(o.group_id ?? ""),
    items: asArray(o.items).map((item: any) => ({
      nested_modifier_id: String(item.nested_modifier_id ?? ""),
      price: Number(item.price),
      hidden: item.hidden,
    })),
  }));

  let groupOverride = overrides.find(
    (o) => normKey(o.group_id) === normKey(nextKey) || o.group_id === nextState!.id
  );
  if (!groupOverride) {
    groupOverride = {group_id: nextKey, items: []};
    overrides.push(groupOverride);
  }

  const nestedKey = recordIdToString(toRecordId(nestedModifierId)) || nestedModifierId;
  const existingItem = groupOverride.items.find(
    (item) => normKey(item.nested_modifier_id) === normKey(nestedKey)
  );
  if (existingItem) {
    existingItem.price = price;
  } else {
    groupOverride.items.push({
      nested_modifier_id: nestedKey,
      price,
      hidden: false,
    });
  }

  await db.merge?.(parent.id, {
    allowed_next_groups: allowed,
    next_group_overrides: overrides,
  });
}
