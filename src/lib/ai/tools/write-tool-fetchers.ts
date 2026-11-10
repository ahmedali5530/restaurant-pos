import {Tables} from "@/api/db/tables.ts";
import type {ImportDbLike} from "@/lib/data-import/types.ts";
import {getReorderLevelForStore} from "@/utils/inventory.ts";
import {toRecordId} from "@/lib/utils.ts";

export async function fetchExistingKitchenRaw(
  db: ImportDbLike,
  patch: Record<string, unknown>,
): Promise<Record<string, unknown> | null> {
  const id = String(patch.id ?? "").trim();
  const name = String(patch.name ?? "").trim();
  if (!id && !name) return null;

  let rows: any[];
  if (id) {
    const [found] = await db.query(
      `SELECT id, name, priority, items, printers FROM ${Tables.kitchens}
       WHERE id = $id AND deleted_at = none LIMIT 1
       FETCH items, printers`,
      {id: toRecordId(id)},
    );
    rows = found ?? [];
  } else {
    const [found] = await db.query(
      `SELECT id, name, priority, items, printers FROM ${Tables.kitchens}
       WHERE string::lowercase(name) = string::lowercase($name) AND deleted_at = none
       FETCH items, printers`,
      {name},
    );
    rows = found ?? [];
  }
  const row = rows[0];
  if (!row) return null;

  const items = (row.items ?? []).map((item: any) => {
    const dishName = String(item?.name ?? "").trim();
    const dishNumber = String(item?.number ?? "").trim();
    return dishNumber || dishName;
  }).filter(Boolean);

  const printers = (row.printers ?? []).map((p: any) => String(p?.name ?? "").trim()).filter(Boolean);

  return {
    id: String(row.id),
    name: row.name,
    priority: row.priority,
    items,
    printers,
  };
}

/**
 * Resolve an existing dish for update merges.
 * Prefer `id` (unique). Fall back to `number`, disambiguated by `name` when
 * numbers are duplicated. Returns null when not found or still ambiguous.
 */
export async function fetchExistingDishRaw(
  db: ImportDbLike,
  patchOrNumber: Record<string, unknown> | string,
): Promise<Record<string, unknown> | null> {
  const patch =
    typeof patchOrNumber === "string"
      ? {number: patchOrNumber}
      : patchOrNumber ?? {};
  const id = String(patch.id ?? "").trim();
  const number = String(patch.number ?? "").trim();
  const name = String(patch.name ?? "").trim();

  let rows: any[] = [];
  if (id) {
    const [found] = await db.query(
      `SELECT * FROM ${Tables.dishes} WHERE id = $id AND deleted_at = none LIMIT 1 FETCH categories, tax, workflow`,
      {id: toRecordId(id)},
    );
    rows = found ?? [];
  } else if (number) {
    const [found] = await db.query(
      `SELECT * FROM ${Tables.dishes} WHERE number = $number AND deleted_at = none FETCH categories, tax, workflow`,
      {number},
    );
    rows = found ?? [];
    if (rows.length > 1 && name) {
      rows = rows.filter(
        (d) => String(d?.name ?? "").trim().toLowerCase() === name.toLowerCase(),
      );
    }
    if (rows.length > 1) {
      return null;
    }
  } else if (name) {
    const [found] = await db.query(
      `SELECT * FROM ${Tables.dishes}
       WHERE string::lowercase(name) = string::lowercase($name) AND deleted_at = none
       FETCH categories, tax, workflow`,
      {name},
    );
    rows = found ?? [];
    if (rows.length > 1) {
      return null;
    }
  } else {
    return null;
  }

  const dish = rows[0];
  if (!dish) return null;

  const categories = Array.isArray(dish.categories)
    ? dish.categories
        .filter((c: any) => c && c.id)
        .map((c: any) => ({label: String(c.name ?? ""), id: String(c.id)}))
    : [];
  const tax = dish.tax && dish.tax.id
    ? {label: String(dish.tax.name ?? ""), id: String(dish.tax.id)}
    : undefined;

  const workflowName = dish.workflow?.name ? String(dish.workflow.name) : undefined;
  let stageOverridesJson: string | undefined;
  if (dish.stage_overrides && dish.workflow?.id) {
    const [stages] = await db.query(
      `SELECT id, name, kitchen.name AS kitchen_name FROM ${Tables.workflow_stages}
       WHERE workflow = $wf ORDER BY sequence ASC FETCH kitchen`,
      {wf: dish.workflow.id},
    );
    const overrideMap: Record<string, string> = {};
    for (const [stageId, kitchenId] of Object.entries(dish.stage_overrides as Record<string, unknown>)) {
      const stage = (stages ?? []).find((s: any) => String(s.id) === String(stageId));
      const kitchen = (stages ?? []).find((s: any) =>
        String(s.kitchen?.id ?? s.kitchen) === String(kitchenId),
      );
      if (stage?.name && kitchen?.kitchen_name) {
        overrideMap[stage.name] = kitchen.kitchen_name;
      }
    }
    if (Object.keys(overrideMap).length > 0) {
      stageOverridesJson = JSON.stringify(overrideMap);
    }
  }

  return {
    id: String(dish.id),
    name: dish.name,
    number: dish.number,
    priority: dish.priority,
    price: dish.price,
    cost: dish.cost,
    categories,
    tax,
    workflow: workflowName,
    stage_overrides: stageOverridesJson,
  };
}

/**
 * Resolve an existing table for update merges.
 * Prefer `id` (unique). Fall back to `number`; return null when ambiguous.
 */
export async function fetchExistingTableRaw(
  db: ImportDbLike,
  patchOrNumber: Record<string, unknown> | string,
): Promise<Record<string, unknown> | null> {
  const patch =
    typeof patchOrNumber === "string"
      ? {number: patchOrNumber}
      : patchOrNumber ?? {};
  const id = String(patch.id ?? "").trim();
  const number = String(patch.number ?? "").trim();

  let rows: any[] = [];
  if (id) {
    const [found] = await db.query(
      `SELECT * FROM ${Tables.tables} WHERE id = $id AND deleted_at = none LIMIT 1 FETCH floor, categories, order_types, payment_types`,
      {id: toRecordId(id)},
    );
    rows = found ?? [];
  } else if (number) {
    const [found] = await db.query(
      `SELECT * FROM ${Tables.tables} WHERE number = $number AND deleted_at = none FETCH floor, categories, order_types, payment_types`,
      {number},
    );
    rows = found ?? [];
    if (rows.length > 1) return null;
  } else {
    return null;
  }

  const row = rows[0];
  if (!row) return null;

  return {
    id: String(row.id ?? ""),
    name: row.name,
    number: row.number,
    ask_for_covers: row.ask_for_covers,
    background: row.background,
    color: row.color,
    priority: row.priority,
    floor: row.floor?.name ?? "",
    categories: (row.categories ?? []).map((c: any) => String(c.name ?? "")),
    order_types: (row.order_types ?? []).map((o: any) => String(o.name ?? "")),
    payment_types: (row.payment_types ?? []).map((p: any) => String(p.name ?? "")),
  };
}

export async function fetchExistingDishModifierRaw(
  db: ImportDbLike,
  patch: Record<string, unknown>,
): Promise<Record<string, unknown> | null> {
  const edgeId = String(patch.id ?? "").trim();
  const dishIdRaw = String(patch.dish_id ?? "").trim();
  const dishNumber = String(patch.dish_number ?? "").trim();
  const groupIdRaw = String(patch.modifier_group_id ?? "").trim();
  const groupLabel = String(patch.modifier_group ?? "").trim();

  if (edgeId) {
    const [edges] = await db.query(
      `SELECT id, in, out, has_required_modifiers, should_auto_open, required_modifiers, should_auto_select, priority
       FROM ${Tables.dish_modifier_groups} WHERE id = $id LIMIT 1
       FETCH in, out`,
      {id: toRecordId(edgeId)},
    );
    const edge = edges?.[0];
    if (!edge) return null;
    return {
      id: String(edge.id ?? ""),
      dish_id: String(edge.in?.id ?? edge.in ?? ""),
      dish_number: String(edge.in?.number ?? dishNumber),
      modifier_group_id: String(edge.out?.id ?? edge.out ?? ""),
      modifier_group: String(edge.out?.name ?? groupLabel),
      priority: edge.priority,
      has_required_modifiers: edge.has_required_modifiers,
      required_modifiers: edge.required_modifiers,
      should_auto_open: edge.should_auto_open,
      should_auto_select: edge.should_auto_select,
    };
  }

  let dish: any = null;
  if (dishIdRaw) {
    const [dishes] = await db.query(
      `SELECT id, number FROM ${Tables.dishes} WHERE id = $id AND deleted_at = none LIMIT 1`,
      {id: toRecordId(dishIdRaw)},
    );
    dish = dishes?.[0] ?? null;
  } else if (dishNumber) {
    const [dishes] = await db.query(
      `SELECT id, number FROM ${Tables.dishes} WHERE number = $number AND deleted_at = none LIMIT 2`,
      {number: dishNumber},
    );
    if ((dishes ?? []).length > 1) return null;
    dish = dishes?.[0] ?? null;
  }
  if (!dish) return null;

  let group: any = null;
  if (groupIdRaw) {
    const [groups] = await db.query(
      `SELECT id, name FROM ${Tables.modifier_groups} WHERE id = $id LIMIT 1`,
      {id: toRecordId(groupIdRaw)},
    );
    group = groups?.[0] ?? null;
  } else if (groupLabel) {
    const [groups] = await db.query(
      `SELECT id, name FROM ${Tables.modifier_groups} WHERE string::lowercase(name) = string::lowercase($name) LIMIT 1`,
      {name: groupLabel},
    );
    group = groups?.[0] ?? null;
  }
  if (!group) return null;

  const [edges] = await db.query(
    `SELECT id, has_required_modifiers, should_auto_open, required_modifiers, should_auto_select, priority
     FROM ${Tables.dish_modifier_groups} WHERE in = $dish AND out = $group LIMIT 1`,
    {dish: dish.id, group: group.id},
  );
  const edge = edges?.[0];
  if (!edge) return null;

  return {
    id: String(edge.id ?? ""),
    dish_id: String(dish.id ?? ""),
    dish_number: String(dish.number ?? dishNumber),
    modifier_group_id: String(group.id ?? ""),
    modifier_group: group.name,
    priority: edge.priority,
    has_required_modifiers: edge.has_required_modifiers,
    required_modifiers: edge.required_modifiers,
    should_auto_open: edge.should_auto_open,
    should_auto_select: edge.should_auto_select,
  };
}

export async function fetchExistingDishIngredientRaw(
  db: ImportDbLike,
  patch: Record<string, unknown>,
): Promise<Record<string, unknown> | null> {
  const recipeId = String(patch.id ?? "").trim();
  const dishIdRaw = String(patch.dish_id ?? "").trim();
  const dishNumber = String(patch.dish_number ?? "").trim();
  const itemIdRaw = String(patch.item_id ?? "").trim();
  const ingredientKey = String(
    typeof patch.ingredient === "object" && patch.ingredient && "label" in (patch.ingredient as object)
      ? (patch.ingredient as {label?: string}).label
      : patch.ingredient ?? "",
  ).trim();

  if (recipeId) {
    const [recipes] = await db.query(
      `SELECT id, menu_item, item, quantity, cost, is_price_locked, entered_uom
       FROM ${Tables.dishes_recipes} WHERE id = $id LIMIT 1
       FETCH menu_item, item`,
      {id: toRecordId(recipeId)},
    );
    const recipe = recipes?.[0];
    if (!recipe) return null;
    const item = recipe.item;
    return {
      id: String(recipe.id ?? ""),
      dish_id: String(recipe.menu_item?.id ?? recipe.menu_item ?? ""),
      dish_number: String(recipe.menu_item?.number ?? dishNumber),
      item_id: String(item?.id ?? item ?? ""),
      ingredient: item?.name ?? item?.code ?? ingredientKey,
      uom: recipe.entered_uom ?? item?.uom,
      quantity: recipe.quantity,
      cost: recipe.cost,
      is_price_locked: recipe.is_price_locked,
    };
  }

  let dish: any = null;
  if (dishIdRaw) {
    const [dishes] = await db.query(
      `SELECT id, number FROM ${Tables.dishes} WHERE id = $id AND deleted_at = none LIMIT 1`,
      {id: toRecordId(dishIdRaw)},
    );
    dish = dishes?.[0] ?? null;
  } else if (dishNumber) {
    const [dishes] = await db.query(
      `SELECT id, number FROM ${Tables.dishes} WHERE number = $number AND deleted_at = none LIMIT 2`,
      {number: dishNumber},
    );
    if ((dishes ?? []).length > 1) return null;
    dish = dishes?.[0] ?? null;
  }
  if (!dish) return null;

  let item: any = null;
  if (itemIdRaw) {
    const [items] = await db.query(
      `SELECT id, name, code, uom, price FROM ${Tables.inventory_items} WHERE id = $id LIMIT 1`,
      {id: toRecordId(itemIdRaw)},
    );
    item = items?.[0] ?? null;
  } else if (ingredientKey) {
    const [items] = await db.query(
      `SELECT id, name, code, uom, price FROM ${Tables.inventory_items}
       WHERE deleted_at = none AND (
         string::lowercase(name) = string::lowercase($key)
         OR string::lowercase(code) = string::lowercase($key)
       )
       LIMIT 1`,
      {key: ingredientKey},
    );
    item = items?.[0] ?? null;
  }
  if (!item) return null;

  const [recipes] = await db.query(
    `SELECT id, quantity, cost, is_price_locked, entered_uom FROM ${Tables.dishes_recipes}
     WHERE menu_item = $dish AND item = $item LIMIT 1`,
    {dish: dish.id, item: item.id},
  );
  const recipe = recipes?.[0];
  if (!recipe) return null;

  return {
    id: String(recipe.id ?? ""),
    dish_id: String(dish.id ?? ""),
    dish_number: String(dish.number ?? dishNumber),
    item_id: String(item.id ?? ""),
    ingredient: item.name ?? item.code,
    uom: recipe.entered_uom ?? item.uom,
    quantity: recipe.quantity,
    cost: recipe.cost,
    is_price_locked: recipe.is_price_locked,
  };
}

export async function fetchExistingModifierGroupOptionRaw(
  db: ImportDbLike,
  patch: Record<string, unknown>,
): Promise<Record<string, unknown> | null> {
  const optionId = String(patch.id ?? "").trim();
  const groupIdRaw = String(patch.modifier_group_id ?? patch.group_id ?? "").trim();
  const groupName = String(patch.group ?? "").trim();
  const modifierLabel = String(patch.modifier ?? "").trim();

  if (optionId) {
    const [opts] = await db.query(
      `SELECT id, price, modifier FROM ${Tables.modifiers} WHERE id = $id LIMIT 1 FETCH modifier`,
      {id: toRecordId(optionId)},
    );
    const option = opts?.[0];
    if (!option) return null;
    const [parentGroups] = await db.query(
      `SELECT id, name, priority FROM ${Tables.modifier_groups}
       WHERE $option IN modifiers AND deleted_at = none LIMIT 1`,
      {option: toRecordId(optionId)},
    );
    const group = parentGroups?.[0];
    return {
      id: String(option.id ?? ""),
      modifier_group_id: String(group?.id ?? ""),
      group: group?.name ?? groupName,
      modifier: option.modifier?.name ?? modifierLabel,
      price: option.price,
      priority: group?.priority,
    };
  }

  if ((!groupName && !groupIdRaw) || !modifierLabel) return null;

  let group: any = null;
  if (groupIdRaw) {
    const [groups] = await db.query(
      `SELECT id, name, priority, modifiers FROM ${Tables.modifier_groups}
       WHERE id = $id AND deleted_at = none
       LIMIT 1
       FETCH modifiers, modifiers.modifier`,
      {id: toRecordId(groupIdRaw)},
    );
    group = groups?.[0] ?? null;
  } else {
    const [groups] = await db.query(
      `SELECT id, name, priority, modifiers FROM ${Tables.modifier_groups}
       WHERE string::lowercase(name) = string::lowercase($name) AND deleted_at = none
       FETCH modifiers, modifiers.modifier`,
      {name: groupName},
    );
    group = groups?.[0] ?? null;
  }
  if (!group) return null;

  const key = modifierLabel.toLowerCase();
  const option = (group.modifiers ?? []).find((item: any) => {
    const dish = item?.modifier;
    const name = String(dish?.name ?? "").toLowerCase();
    const number = String(dish?.number ?? "").toLowerCase();
    return name === key || number === key || name.includes(key) || key.includes(name);
  });
  if (!option) return null;

  return {
    id: String(option.id ?? ""),
    modifier_group_id: String(group.id ?? ""),
    group: group.name,
    modifier: option.modifier?.name ?? modifierLabel,
    price: option.price,
    priority: group.priority,
  };
}

/**
 * Resolve an existing inventory item for update merges.
 * Prefer `id` (unique) so `code` can change in the same patch.
 */
export async function fetchExistingInventoryItemRaw(
  db: ImportDbLike,
  patchOrCode: Record<string, unknown> | string,
): Promise<Record<string, unknown> | null> {
  const patch =
    typeof patchOrCode === "string"
      ? {code: patchOrCode}
      : patchOrCode ?? {};
  const id = String(patch.id ?? "").trim();
  const code = String(patch.code ?? "").trim();

  let item: any = null;
  if (id) {
    const [rows] = await db.query(
      `SELECT * FROM ${Tables.inventory_items} WHERE id = $id AND deleted_at = none LIMIT 1 FETCH category, suppliers, locations, stores`,
      {id: toRecordId(id)},
    );
    item = rows?.[0] ?? null;
  } else if (code) {
    const [rows] = await db.query(
      `SELECT * FROM ${Tables.inventory_items} WHERE code = $code AND deleted_at = none LIMIT 1 FETCH category, suppliers, locations, stores`,
      {code},
    );
    item = rows?.[0] ?? null;
  }
  if (!item) return null;

  const locs = item.locations ?? item.stores ?? [];
  const reorderLevels = locs
    .map((loc: any) => {
      const level = getReorderLevelForStore(item, loc.id);
      return level > 0 ? `${loc.name}:${level}` : null;
    })
    .filter(Boolean)
    .join(",");

  return {
    id: String(item.id ?? ""),
    name: item.name ?? "",
    code: item.code ?? "",
    category: item.category?.name ?? "",
    uom: item.uom ?? "",
    base_quantity: item.base_quantity,
    price: item.price,
    average_price: item.average_price,
    locations: locs.map((l: any) => String(l.name ?? "")),
    suppliers: (item.suppliers ?? []).map((s: any) => String(s.name ?? "")),
    item_types: (item.item_types ?? []).join(", "),
    reorder_levels: reorderLevels,
  };
}

export async function fetchExistingScheduledShiftRaw(
  db: ImportDbLike,
  patch: Record<string, unknown>,
): Promise<Record<string, unknown> | null> {
  const employeeKey = String(patch.employee ?? "").trim();
  const startAt = String(patch.start_at ?? "").trim();
  if (!employeeKey || !startAt) return null;

  const [byNumber] = await db.query(
    `SELECT id, employee_number, first_name, last_name FROM ${Tables.employees}
     WHERE employee_number = $key LIMIT 1`,
    {key: employeeKey},
  );
  let employee = byNumber?.[0];
  if (!employee) {
    const [byName] = await db.query(
      `SELECT id, employee_number, first_name, last_name FROM ${Tables.employees}
       WHERE string::lowercase(string::concat(first_name, ' ', last_name ?? '')) = string::lowercase($key)
       OR string::lowercase(first_name) = string::lowercase($key)
       LIMIT 1`,
      {key: employeeKey},
    );
    employee = byName?.[0];
  }
  if (!employee) return null;

  const [shifts] = await db.query(
    `SELECT * FROM ${Tables.scheduled_shifts}
     WHERE employee = $employee AND start_at = $startAt AND deleted_at = none
     LIMIT 1 FETCH schedule, shift_template, department, position`,
    {employee: employee.id, startAt},
  );
  const shift = shifts?.[0];
  if (!shift) return null;

  return {
    employee: employee.employee_number ?? `${employee.first_name} ${employee.last_name ?? ""}`.trim(),
    schedule: shift.schedule?.name ?? "",
    start_at: shift.start_at,
    end_at: shift.end_at,
    shift_template: shift.shift_template?.name ?? "",
    department: shift.department?.name ?? "",
    position: shift.position?.name ?? "",
    notes: shift.notes ?? "",
  };
}
