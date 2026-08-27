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

/**
 * Expand OCR menu graph into ordered flat review rows.
 */
export function expandSmartMenuGraph(parsed: any): Array<Record<string, any>> {
  const dishes = asArray(parsed?.dishes);
  const priceGroups = asArray(parsed?.price_groups);
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

function modifierForDish(group: any, dishId: string): any | undefined {
  const target = recordIdToString(dishId) || dishId;
  return (group?.modifiers ?? []).find((item: any) => {
    const nested = item?.modifier;
    const nestedId = nested?.id ?? nested;
    return (recordIdToString(nestedId) || String(nestedId ?? "")) === target;
  });
}

function modifierIds(group: any): any[] {
  return (group?.modifiers ?? []).map((item: any) => toRecordId(item.id ?? item));
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
      "When multiple item blocks share different size price tables, create one price_groups entry per matrix with a clear group_name (e.g. Size – Classic, Size – Crust, Size – Special).",
      "Expand size letters when naming: S=Small, M=Medium, L=Large, F=Family, P=Party.",
      "List only sizes that appear for that block; do not invent missing sizes or prices.",
      "Put sell prices on sizes, not on the pizza dish (dishes are linked to a size group).",
      "Global extras like EXTRA TOPPING go in addons with prices_by_size keyed by size code.",
      "Ignore photos and decorative text.",
      "If links are omitted, dishes.price_group is used to attach each dish to its size group.",
    ].join(" "),
    onExpandExtracted: expandSmartMenuGraph,
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
  const dishIdByName = new Map<string, string>();
  const groupIdByName = new Map<string, string>();
  /** groupName -> sizeName -> modifier record id */
  const sizeModifierByGroup = new Map<string, Map<string, string>>();
  /** addon groupName -> nested modifier id (the Extra Topping option) */
  const addonModifierByGroup = new Map<string, string>();

  const fail = (index: number, message: string) => {
    result.failed.push({index, message});
  };

  // Prefill dish map from DB for link resolution
  const dishNames = records
    .map((r) => String(r.values.dish_name ?? r.values.name ?? "").trim())
    .filter(Boolean);
  for (const name of [...new Set(dishNames)]) {
    const [rows] = await db.query(
      `SELECT id, name FROM ${Tables.dishes}
       WHERE string::lowercase(name) = string::lowercase($name) AND deleted_at = none LIMIT 1`,
      {name}
    );
    if (rows?.[0]?.id) {
      dishIdByName.set(normKey(name), String(rows[0].id));
    }
  }

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
          groupIdByName,
          sizeModifierByGroup,
          addonModifierByGroup,
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
          groupIdByName,
          sizeModifierByGroup,
          addonModifierByGroup,
        });
        result.imported += 1;
        continue;
      }
      if (type === "dish_link") {
        await importDishLinkRow({db, t, v, dishIdByName, groupIdByName});
        result.imported += 1;
        continue;
      }
      if (type === "nested_override") {
        await importNestedOverrideRow({
          db,
          t,
          v,
          groupIdByName,
          sizeModifierByGroup,
          addonModifierByGroup,
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

  const existingId = dishIdByName.get(normKey(name));
  if (existingId) return;

  const number = await ensureNumber(v.number);
  const categoryRef = v.category as ResolvedReference | null;
  const categories: any[] = [];
  if (categoryRef?.label) {
    categories.push(requireRefId(categoryRef, t("toast:admin.invalidCategories")));
  }

  const [byNumber] = await db.query(
    `SELECT id FROM ${Tables.dishes} WHERE number = $number AND deleted_at = none LIMIT 1`,
    {number}
  );
  if (byNumber?.[0]?.id) {
    dishIdByName.set(normKey(name), String(byNumber[0].id));
    return;
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
  dishIdByName.set(normKey(name), String(row.id));
}

async function importGroupOptionRow({
  db,
  t,
  v,
  kind,
  groupIdByName,
  sizeModifierByGroup,
  addonModifierByGroup,
}: {
  db: ImportDbLike;
  t: TFunc;
  v: Record<string, any>;
  kind: "size" | "addon";
  groupIdByName: Map<string, string>;
  sizeModifierByGroup: Map<string, Map<string, string>>;
  addonModifierByGroup: Map<string, string>;
}) {
  const groupName = String(v.group_name ?? "").trim();
  if (!groupName) throw new Error(t("validation:required"));
  const price = Number(v.price);
  if (!Number.isFinite(price)) throw new Error(t("validation:mustBeNumber"));

  const modifierRef = v.modifier as ResolvedReference | null;
  const dishId = String(requireRefId(modifierRef, t("toast:admin.invalidDishNameOrNumber")));
  const optionName = String(modifierRef?.label ?? v.name ?? "").trim();

  let group = await findGroupByName(db, groupName);
  let groupId = group ? String(group.id) : groupIdByName.get(normKey(groupName));

  if (groupId && !group) {
    group = await findGroupByName(db, groupName);
  }

  const existingModifier = group ? modifierForDish(group, dishId) : undefined;
  let modifierId: string;

  if (existingModifier?.id) {
    await db.merge?.(existingModifier.id, {
      modifier: toRecordId(dishId),
      price,
    });
    modifierId = String(existingModifier.id);
  } else {
    const createdModifier = await db.create?.(Tables.modifiers, {
      modifier: toRecordId(dishId),
      price,
      allowed_next_groups: [],
      next_group_overrides: [],
    });
    const modifierRow = Array.isArray(createdModifier) ? createdModifier[0] : createdModifier;
    if (!modifierRow?.id) throw new Error(t("common:csvImport.recordNotFound"));
    modifierId = String(modifierRow.id);

    if (group) {
      await db.merge?.(group.id, {
        name: groupName,
        modifiers: [...modifierIds(group), toRecordId(modifierRow.id)],
      });
      groupId = String(group.id);
    } else {
      const createdGroup = await db.create?.(Tables.modifier_groups, {
        name: groupName,
        priority: kind === "size" ? 0 : 1,
        modifiers: [toRecordId(modifierRow.id)],
      });
      const groupRow = Array.isArray(createdGroup) ? createdGroup[0] : createdGroup;
      if (!groupRow?.id) throw new Error(t("common:csvImport.recordNotFound"));
      groupId = String(groupRow.id);
    }
  }

  if (!groupId) throw new Error(t("toast:admin.invalidModifierGroup"));
  groupIdByName.set(normKey(groupName), groupId);

  if (kind === "size" && optionName) {
    if (!sizeModifierByGroup.has(normKey(groupName))) {
      sizeModifierByGroup.set(normKey(groupName), new Map());
    }
    sizeModifierByGroup.get(normKey(groupName))!.set(normKey(optionName), modifierId);
  }
  if (kind === "addon") {
    addonModifierByGroup.set(normKey(groupName), modifierId);
  }
}

async function importDishLinkRow({
  db,
  t,
  v,
  dishIdByName,
  groupIdByName,
}: {
  db: ImportDbLike;
  t: TFunc;
  v: Record<string, any>;
  dishIdByName: Map<string, string>;
  groupIdByName: Map<string, string>;
}) {
  const dishName = String(v.dish_name ?? v.name ?? "").trim();
  const groupName = String(v.group_name ?? "").trim();
  if (!dishName || !groupName) throw new Error(t("validation:required"));

  let dishId = dishIdByName.get(normKey(dishName));
  if (!dishId) {
    const [rows] = await db.query(
      `SELECT id FROM ${Tables.dishes}
       WHERE string::lowercase(name) = string::lowercase($name) AND deleted_at = none LIMIT 1`,
      {name: dishName}
    );
    if (!rows?.[0]?.id) throw new Error(t("toast:admin.invalidDishNameOrNumber"));
    dishId = String(rows[0].id);
    dishIdByName.set(normKey(dishName), dishId);
  }

  let groupId = groupIdByName.get(normKey(groupName));
  if (!groupId) {
    const group = await findGroupByName(db, groupName);
    if (!group?.id) throw new Error(t("toast:admin.invalidModifierGroup"));
    groupId = String(group.id);
    groupIdByName.set(normKey(groupName), groupId);
  }

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
  groupIdByName,
  sizeModifierByGroup,
  addonModifierByGroup,
}: {
  db: ImportDbLike;
  t: TFunc;
  v: Record<string, any>;
  groupIdByName: Map<string, string>;
  sizeModifierByGroup: Map<string, Map<string, string>>;
  addonModifierByGroup: Map<string, string>;
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

  let nextGroupId = groupIdByName.get(normKey(nextGroupName));
  if (!nextGroupId) {
    const g = await findGroupByName(db, nextGroupName);
    if (!g?.id) throw new Error(t("toast:admin.invalidModifierGroup"));
    nextGroupId = String(g.id);
    groupIdByName.set(normKey(nextGroupName), nextGroupId);
  }

  let nestedModifierId = addonModifierByGroup.get(normKey(nextGroupName));
  if (!nestedModifierId) {
    const g = await findGroupByName(db, nextGroupName);
    const match = (g?.modifiers ?? []).find((m: any) => {
      const dish = m?.modifier;
      const dishName = dish?.name ?? "";
      return normKey(dishName) === normKey(nestedName);
    });
    if (!match?.id) throw new Error(t("toast:admin.invalidDishNameOrNumber"));
    nestedModifierId = String(match.id);
    addonModifierByGroup.set(normKey(nextGroupName), nestedModifierId);
  }

  let parentModifierId = sizeModifierByGroup
    .get(normKey(parentGroupName))
    ?.get(normKey(parentModifierName));

  if (!parentModifierId) {
    const g = await findGroupByName(db, parentGroupName);
    const match = (g?.modifiers ?? []).find((m: any) => {
      const dish = m?.modifier;
      const dishName = dish?.name ?? "";
      return normKey(dishName) === normKey(parentModifierName);
    });
    if (!match?.id) throw new Error(t("toast:admin.invalidDishNameOrNumber"));
    parentModifierId = String(match.id);
    if (!sizeModifierByGroup.has(normKey(parentGroupName))) {
      sizeModifierByGroup.set(normKey(parentGroupName), new Map());
    }
    sizeModifierByGroup
      .get(normKey(parentGroupName))!
      .set(normKey(parentModifierName), parentModifierId);
  }

  const [parentRows] = await db.query(
    `SELECT id, allowed_next_groups, next_group_overrides FROM ${Tables.modifiers} WHERE id = $id LIMIT 1`,
    {id: toRecordId(parentModifierId)}
  );
  const parent = parentRows?.[0];
  if (!parent?.id) throw new Error(t("common:csvImport.recordNotFound"));

  const nextGroupRec = toRecordId(nextGroupId);
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
    (o) => normKey(o.group_id) === normKey(nextKey) || o.group_id === nextGroupId
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
