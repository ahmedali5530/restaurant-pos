import {Tables} from "@/api/db/tables.ts";
import {recordIdToString} from "@/api/reports/shared/records.ts";
import {unwrapQueryResult} from "@/api/reports/shared/query.ts";
import type {DbClient} from "@/api/reports/shared/types.ts";
import {toRecordId} from "@/lib/utils.ts";

type NameOrIdOptions = {id?: string; name?: string; search?: string; limit?: number};
type DishOptions = NameOrIdOptions & {number?: string};
type CouponOptions = {id?: string; code?: string; search?: string; limit?: number};
type DishModifierOptions = {
  dish_id?: string;
  dish_name?: string;
  dish_number?: string;
  search?: string;
  limit?: number;
};
type PrintSettingsOptions = {key?: string};
type PrinterOptions = NameOrIdOptions;

const normalizeSearch = (search?: string) => search?.trim().toLowerCase() || "";
const matchesSearch = (haystack: string, search: string) =>
  !search || haystack.toLowerCase().includes(search);

const nameList = (rows: Array<{name?: string; number?: string} | string> | undefined): string[] =>
  (rows ?? []).map(row => {
    if (typeof row === "string") return row;
    return row.name ?? row.number ?? "";
  }).filter(Boolean);

const resolveNamesByIds = async (
  db: DbClient,
  table: string,
  ids: string[],
): Promise<Map<string, string>> => {
  const unique = Array.from(new Set(ids.map(id => recordIdToString(id)).filter(Boolean)));
  const map = new Map<string, string>();
  if (!unique.length) return map;
  const rows = unwrapQueryResult<{id: unknown; name?: string}>(
    await db.query(
      `SELECT id, name FROM ${table} WHERE id IN $ids`,
      {ids: unique.map(id => toRecordId(id))},
    ),
  );
  for (const row of rows) {
    const id = recordIdToString(row.id);
    map.set(id, row.name ?? id);
  }
  return map;
};

const mapIdsToNames = (ids: string[] | undefined, lookup: Map<string, string>): string[] =>
  (ids ?? []).map(id => lookup.get(recordIdToString(id)) ?? recordIdToString(id)).filter(Boolean);

export const getDishDetail = async (db: DbClient, options: DishOptions = {}) => {
  const id = String(options.id ?? "").trim();
  const number = String(options.number ?? "").trim();
  const name = String(options.name ?? "").trim();
  const search = normalizeSearch(options.search);
  const limit = Math.min(options.limit ?? 5, 20);

  let query = `
    SELECT id, name, number, priority, price, cost, categories, tax, workflow, stage_overrides
    FROM ${Tables.dishes}
    WHERE deleted_at = NONE
  `;
  const params: Record<string, unknown> = {};
  if (id) {
    query += ` AND id = $id`;
    params.id = toRecordId(id);
  } else if (number) {
    query += ` AND number = $number`;
    params.number = number;
  } else if (name) {
    query += ` AND string::lowercase(name) CONTAINS $name`;
    params.name = name.toLowerCase();
  } else if (search) {
    query += ` AND (string::lowercase(name) CONTAINS $search OR string::lowercase(string::concat('', number)) CONTAINS $search)`;
    params.search = search;
  }
  query += ` ORDER BY name ASC LIMIT ${limit} FETCH categories, tax, workflow`;

  const dishes = unwrapQueryResult<{
    id: unknown;
    name?: string;
    number?: string | number;
    priority?: number;
    price?: number;
    cost?: number;
    categories?: Array<{id?: unknown; name?: string}>;
    tax?: {id?: unknown; name?: string};
    workflow?: {id?: unknown; name?: string};
    stage_overrides?: Record<string, unknown>;
  }>(await db.query(query, params));

  const results = [];
  for (const dish of dishes) {
    const dishId = recordIdToString(dish.id);
    const edges = unwrapQueryResult<{
      id: unknown;
      out?: {id?: unknown; name?: string};
      has_required_modifiers?: boolean;
      required_modifiers?: number;
      should_auto_open?: boolean;
      should_auto_select?: boolean;
      priority?: number;
    }>(await db.query(
      `SELECT id, out, has_required_modifiers, required_modifiers, should_auto_open, should_auto_select, priority
       FROM ${Tables.dish_modifier_groups}
       WHERE in = $dish
       ORDER BY priority ASC
       FETCH out`,
      {dish: toRecordId(dishId)},
    ));

    let stageOverrides: Record<string, string> | null = null;
    if (dish.stage_overrides && dish.workflow?.id) {
      const stages = unwrapQueryResult<{
        id: unknown;
        name?: string;
        kitchen?: {id?: unknown; name?: string};
        kitchen_name?: string;
      }>(await db.query(
        `SELECT id, name, kitchen.name AS kitchen_name FROM ${Tables.workflow_stages}
         WHERE workflow = $wf ORDER BY sequence ASC FETCH kitchen`,
        {wf: dish.workflow.id},
      ));
      const overrideMap: Record<string, string> = {};
      for (const [stageId, kitchenId] of Object.entries(dish.stage_overrides)) {
        const stage = stages.find(s => recordIdToString(s.id) === recordIdToString(stageId));
        const kitchen = stages.find(s =>
          recordIdToString(s.kitchen?.id) === recordIdToString(kitchenId),
        );
        if (stage?.name) {
          overrideMap[stage.name] = kitchen?.kitchen_name ?? kitchen?.kitchen?.name
            ?? recordIdToString(kitchenId);
        }
      }
      if (Object.keys(overrideMap).length) stageOverrides = overrideMap;
    }

    results.push({
      id: dishId,
      name: dish.name ?? "",
      number: String(dish.number ?? ""),
      priority: dish.priority ?? 0,
      price: dish.price ?? 0,
      cost: dish.cost ?? null,
      categories: (dish.categories ?? []).map(c => ({
        id: recordIdToString(c.id),
        name: c.name ?? "",
      })),
      tax_name: dish.tax?.name ?? "",
      tax_id: dish.tax?.id ? recordIdToString(dish.tax.id) : "",
      workflow: dish.workflow?.name ?? "",
      workflow_id: dish.workflow?.id ? recordIdToString(dish.workflow.id) : "",
      stage_overrides: stageOverrides,
      modifier_groups: edges.map(edge => ({
        id: recordIdToString(edge.id),
        modifier_group_id: recordIdToString(edge.out?.id),
        modifier_group: edge.out?.name ?? "",
        priority: edge.priority ?? 0,
        has_required_modifiers: edge.has_required_modifiers ?? false,
        required_modifiers: edge.required_modifiers ?? 0,
        should_auto_open: edge.should_auto_open ?? false,
        should_auto_select: edge.should_auto_select ?? false,
      })),
    });
  }

  return results;
};

export const listDishModifiers = async (db: DbClient, options: DishModifierOptions = {}) => {
  const limit = Math.min(options.limit ?? 50, 200);
  const search = normalizeSearch(options.search);
  const dishId = String(options.dish_id ?? "").trim();
  const dishNumber = String(options.dish_number ?? "").trim();
  const dishName = String(options.dish_name ?? "").trim();

  let dishFilter = "";
  const params: Record<string, unknown> = {};
  if (dishId) {
    dishFilter = "AND in = $dish";
    params.dish = toRecordId(dishId);
  } else if (dishNumber) {
    dishFilter = "AND in.number = $dishNumber";
    params.dishNumber = dishNumber;
  } else if (dishName) {
    dishFilter = "AND string::lowercase(in.name) CONTAINS $dishName";
    params.dishName = dishName.toLowerCase();
  }

  const query = `
    SELECT id, in, out, has_required_modifiers, required_modifiers, should_auto_open, should_auto_select, priority
    FROM ${Tables.dish_modifier_groups}
    WHERE true ${dishFilter}
    ORDER BY priority ASC
    LIMIT ${limit}
    FETCH in, out
  `;
  const rows = unwrapQueryResult<{
    id: unknown;
    in?: {id?: unknown; name?: string; number?: string | number};
    out?: {id?: unknown; name?: string};
    has_required_modifiers?: boolean;
    required_modifiers?: number;
    should_auto_open?: boolean;
    should_auto_select?: boolean;
    priority?: number;
  }>(await db.query(query, params));

  return rows
    .map(row => ({
      id: recordIdToString(row.id),
      dish_id: recordIdToString(row.in?.id),
      dish_name: row.in?.name ?? "",
      dish_number: String(row.in?.number ?? ""),
      modifier_group_id: recordIdToString(row.out?.id),
      modifier_group: row.out?.name ?? "",
      priority: row.priority ?? 0,
      has_required_modifiers: row.has_required_modifiers ?? false,
      required_modifiers: row.required_modifiers ?? 0,
      should_auto_open: row.should_auto_open ?? false,
      should_auto_select: row.should_auto_select ?? false,
    }))
    .filter(row => {
      if (!search) return true;
      return (
        matchesSearch(row.dish_name, search)
        || matchesSearch(row.dish_number, search)
        || matchesSearch(row.modifier_group, search)
      );
    });
};

export const getTableDetail = async (db: DbClient, options: NameOrIdOptions & {number?: string} = {}) => {
  const id = String(options.id ?? "").trim();
  const number = String(options.number ?? "").trim();
  const name = String(options.name ?? "").trim();
  const search = normalizeSearch(options.search);
  const limit = Math.min(options.limit ?? 5, 20);

  let query = `
    SELECT id, name, number, ask_for_covers, background, color, priority, floor, categories, order_types, payment_types
    FROM ${Tables.tables}
    WHERE deleted_at = NONE
  `;
  const params: Record<string, unknown> = {};
  if (id) {
    query += ` AND id = $id`;
    params.id = toRecordId(id);
  } else if (number) {
    query += ` AND number = $number`;
    params.number = number;
  } else if (name) {
    query += ` AND (string::lowercase(name) CONTAINS $name OR string::lowercase(string::concat('', number)) CONTAINS $name)`;
    params.name = name.toLowerCase();
  } else if (search) {
    query += ` AND (string::lowercase(name) CONTAINS $search OR string::lowercase(string::concat('', number)) CONTAINS $search)`;
    params.search = search;
  }
  query += ` ORDER BY number ASC LIMIT ${limit} FETCH floor, categories, order_types, payment_types`;

  const rows = unwrapQueryResult<{
    id: unknown;
    name?: string;
    number?: string | number;
    ask_for_covers?: boolean;
    background?: string;
    color?: string;
    priority?: number;
    floor?: {id?: unknown; name?: string};
    categories?: Array<{name?: string}>;
    order_types?: Array<{name?: string}>;
    payment_types?: Array<{name?: string}>;
  }>(await db.query(query, params));

  return rows.map(row => ({
    id: recordIdToString(row.id),
    name: row.name ?? "",
    number: String(row.number ?? ""),
    ask_for_covers: row.ask_for_covers ?? false,
    background: row.background ?? "",
    color: row.color ?? "",
    priority: row.priority ?? 0,
    floor_id: row.floor?.id ? recordIdToString(row.floor.id) : "",
    floor_name: row.floor?.name ?? "",
    categories: nameList(row.categories),
    order_types: nameList(row.order_types),
    payment_types: nameList(row.payment_types),
  }));
};

export const getDiscountDetail = async (db: DbClient, options: NameOrIdOptions = {}) => {
  const id = String(options.id ?? "").trim();
  const name = String(options.name ?? "").trim();
  const search = normalizeSearch(options.search ?? name);
  const limit = Math.min(options.limit ?? 5, 20);

  let query = `SELECT * FROM ${Tables.discounts} WHERE deleted_at = NONE`;
  const params: Record<string, unknown> = {};
  if (id) {
    query += ` AND id = $id`;
    params.id = toRecordId(id);
  } else if (search) {
    query += ` AND string::lowercase(name) CONTAINS $search`;
    params.search = search;
  }
  query += ` ORDER BY priority ASC, name ASC LIMIT ${limit}`;

  const rows = unwrapQueryResult<any>(await db.query(query, params));
  const results = [];

  for (const row of rows) {
    const targets = row.targets ?? {};
    const categoryIds = (targets.category_ids ?? []).map(recordIdToString);
    const itemIds = (targets.item_ids ?? []).map(recordIdToString);
    const floorIds = (targets.floor_ids ?? row.applicable_floors ?? []).map(recordIdToString);
    const paymentTypeIds = (targets.payment_type_ids ?? []).map(recordIdToString);
    const bxgy = row.conditions ?? null;
    const buyItemIds = (bxgy?.buy_targets?.item_ids ?? []).map(recordIdToString);
    const buyCategoryIds = (bxgy?.buy_targets?.category_ids ?? []).map(recordIdToString);
    const getItemIds = (bxgy?.get_targets?.item_ids ?? []).map(recordIdToString);
    const getCategoryIds = (bxgy?.get_targets?.category_ids ?? []).map(recordIdToString);

    const [categories, items, floors, paymentTypes] = await Promise.all([
      resolveNamesByIds(db, Tables.categories, [...categoryIds, ...buyCategoryIds, ...getCategoryIds]),
      resolveNamesByIds(db, Tables.dishes, [...itemIds, ...buyItemIds, ...getItemIds]),
      resolveNamesByIds(db, Tables.floors, floorIds),
      resolveNamesByIds(db, Tables.payment_types, paymentTypeIds),
    ]);

    results.push({
      id: recordIdToString(row.id),
      name: row.name ?? "",
      type: row.type ?? row.value_type ?? "",
      category: row.category ?? "",
      scope: row.scope ?? "",
      application_mode: row.application_mode ?? "",
      is_active: row.is_active ?? true,
      priority: row.priority ?? 0,
      min_rate: row.min_rate ?? row.min_value ?? null,
      max_rate: row.max_rate ?? row.max_value ?? null,
      max_cap: row.max_cap ?? null,
      min_order_amount: row.min_order_amount ?? null,
      stacking_mode: row.stacking_mode ?? "",
      tax_treatment: row.tax_treatment ?? "",
      stackable: row.stackable ?? true,
      exclusive: row.exclusive ?? false,
      requires_reason: row.requires_reason ?? false,
      requires_approval: row.requires_approval ?? false,
      category_names: mapIdsToNames(categoryIds, categories),
      item_names: mapIdsToNames(itemIds, items),
      floor_names: mapIdsToNames(floorIds, floors),
      payment_type_names: mapIdsToNames(paymentTypeIds, paymentTypes),
      customer_tags: targets.customer_tags ?? [],
      buy_quantity: bxgy?.buy_quantity ?? null,
      get_quantity: bxgy?.get_quantity ?? null,
      buy_category_names: mapIdsToNames(buyCategoryIds, categories),
      buy_item_names: mapIdsToNames(buyItemIds, items),
      get_category_names: mapIdsToNames(getCategoryIds, categories),
      get_item_names: mapIdsToNames(getItemIds, items),
      get_value_type: bxgy?.get_value_type ?? null,
      get_value: bxgy?.get_value ?? null,
      schedules: row.schedules ?? [],
    });
  }

  return results;
};

export const getCouponDetail = async (db: DbClient, options: CouponOptions = {}) => {
  const id = String(options.id ?? "").trim();
  const code = String(options.code ?? "").trim();
  const search = normalizeSearch(options.search ?? code);
  const limit = Math.min(options.limit ?? 5, 20);

  let query = `SELECT * FROM ${Tables.coupons} WHERE deleted_at = NONE`;
  const params: Record<string, unknown> = {};
  if (id) {
    query += ` AND id = $id`;
    params.id = toRecordId(id);
  } else if (search) {
    query += ` AND (string::lowercase(code) CONTAINS $search OR string::lowercase(description) CONTAINS $search)`;
    params.search = search;
  }
  query += ` ORDER BY priority ASC, code ASC LIMIT ${limit} FETCH categories, items`;

  const rows = unwrapQueryResult<any>(await db.query(query, params));
  return rows.map((row: any) => ({
    id: recordIdToString(row.id),
    code: row.code ?? "",
    description: row.description ?? "",
    coupon_type: row.coupon_type ?? "",
    discount_type: row.discount_type ?? "",
    discount_value: row.discount_value ?? null,
    min_order_amount: row.min_order_amount ?? null,
    max_discount_amount: row.max_discount_amount ?? null,
    usage_limit: row.usage_limit ?? null,
    usage_limit_per_user: row.usage_limit_per_user ?? null,
    priority: row.priority ?? 0,
    valid_days: row.valid_days ?? [],
    start_time: row.start_time ?? null,
    end_time: row.end_time ?? null,
    stackable: row.stackable ?? false,
    first_order_only: row.first_order_only ?? false,
    is_active: row.is_active ?? true,
    category_names: nameList(row.categories),
    item_names: nameList(row.items),
  }));
};

export const getExtraDetail = async (db: DbClient, options: NameOrIdOptions = {}) => {
  const id = String(options.id ?? "").trim();
  const name = String(options.name ?? "").trim();
  const search = normalizeSearch(options.search ?? name);
  const limit = Math.min(options.limit ?? 5, 20);

  let query = `
    SELECT id, name, value, apply_to_all, delivery, priority, tables, payment_types, order_types
    FROM ${Tables.extras}
    WHERE deleted_at = NONE
  `;
  const params: Record<string, unknown> = {};
  if (id) {
    query += ` AND id = $id`;
    params.id = toRecordId(id);
  } else if (search) {
    query += ` AND string::lowercase(name) CONTAINS $search`;
    params.search = search;
  }
  query += ` ORDER BY priority ASC, name ASC LIMIT ${limit} FETCH tables, payment_types, order_types`;

  const rows = unwrapQueryResult<{
    id: unknown;
    name?: string;
    value?: number;
    apply_to_all?: boolean;
    delivery?: boolean;
    priority?: number;
    tables?: Array<{id?: unknown; name?: string; number?: string | number}>;
    payment_types?: Array<{id?: unknown; name?: string}>;
    order_types?: Array<{id?: unknown; name?: string}>;
  }>(await db.query(query, params));

  return rows.map(row => ({
    id: recordIdToString(row.id),
    name: row.name ?? "",
    value: row.value ?? 0,
    apply_to_all: row.apply_to_all ?? false,
    delivery: row.delivery ?? false,
    priority: row.priority ?? 0,
    tables: (row.tables ?? []).map(t => ({
      id: recordIdToString(t.id),
      name: t.name ?? "",
      number: String(t.number ?? ""),
    })),
    payment_types: (row.payment_types ?? []).map(p => ({
      id: recordIdToString(p.id),
      name: p.name ?? "",
    })),
    order_types: (row.order_types ?? []).map(o => ({
      id: recordIdToString(o.id),
      name: o.name ?? "",
    })),
  }));
};

export const getRoleDetail = async (db: DbClient, options: NameOrIdOptions = {}) => {
  const id = String(options.id ?? "").trim();
  const name = String(options.name ?? "").trim();
  const search = normalizeSearch(options.search ?? name);
  const limit = Math.min(options.limit ?? 5, 20);

  let query = `SELECT id, name, roles FROM ${Tables.user_roles} WHERE deleted_at = NONE`;
  const params: Record<string, unknown> = {};
  if (id) {
    query += ` AND id = $id`;
    params.id = toRecordId(id);
  } else if (search) {
    query += ` AND string::lowercase(name) CONTAINS $search`;
    params.search = search;
  }
  query += ` ORDER BY name ASC LIMIT ${limit}`;

  const rows = unwrapQueryResult<{id: unknown; name?: string; roles?: string[]}>(
    await db.query(query, params),
  );
  return rows.map(row => ({
    id: recordIdToString(row.id),
    name: row.name ?? "",
    modules: Array.isArray(row.roles) ? row.roles.map(String) : [],
    module_count: Array.isArray(row.roles) ? row.roles.length : 0,
  }));
};

export const getPrinterDetail = async (db: DbClient, options: PrinterOptions = {}) => {
  const id = String(options.id ?? "").trim();
  const name = String(options.name ?? "").trim();
  const search = normalizeSearch(options.search ?? name);
  const limit = Math.min(options.limit ?? 5, 20);

  let query = `
    SELECT id, name, type, priority, ip_address, port, vid, pid, path, print_mode, paper_width_mm, command_set
    FROM ${Tables.printers}
    WHERE deleted_at = NONE
  `;
  const params: Record<string, unknown> = {};
  if (id) {
    query += ` AND id = $id`;
    params.id = toRecordId(id);
  } else if (search) {
    query += ` AND string::lowercase(name) CONTAINS $search`;
    params.search = search;
  }
  query += ` ORDER BY priority ASC, name ASC LIMIT ${limit}`;

  const rows = unwrapQueryResult<{
    id: unknown;
    name?: string;
    type?: string;
    priority?: number;
    ip_address?: string;
    port?: number;
    vid?: string;
    pid?: string;
    path?: string;
    print_mode?: string;
    paper_width_mm?: number;
    command_set?: string;
  }>(await db.query(query, params));

  return rows.map(row => ({
    id: recordIdToString(row.id),
    name: row.name ?? "",
    type: row.type ?? "",
    priority: row.priority ?? 0,
    ip_address: row.ip_address ?? "",
    port: row.port ?? null,
    vid: row.vid ?? "",
    pid: row.pid ?? "",
    path: row.path ?? "",
    print_mode: row.print_mode ?? "",
    paper_width_mm: row.paper_width_mm ?? null,
    command_set: row.command_set ?? "",
  }));
};

const PRINT_SETTING_KEYS = [
  "Temp Print",
  "Final Print",
  "Kitchen Print",
  "Summary Print",
  "Delivery Print",
  "Refund Print",
];

export const getPrintSettings = async (db: DbClient, options: PrintSettingsOptions = {}) => {
  const key = String(options.key ?? "").trim();
  const query = key
    ? `SELECT id, key, values FROM ${Tables.settings} WHERE key = $key AND is_global = true LIMIT 1`
    : `SELECT id, key, values FROM ${Tables.settings}
       WHERE is_global = true AND key IN $keys
       ORDER BY key ASC`;
  const rows = unwrapQueryResult<{id: unknown; key?: string; values?: Record<string, unknown>}>(
    await db.query(query, key ? {key} : {keys: PRINT_SETTING_KEYS}),
  );

  return rows.map(row => {
    const values = row.values ?? {};
    const {
      logo: _logo,
      header_image: _header,
      footer_image: _footer,
      ...safeValues
    } = values as Record<string, unknown>;
    return {
      id: recordIdToString(row.id),
      key: row.key ?? "",
      ...safeValues,
    };
  });
};

export const getTipDistribution = async (db: DbClient) => {
  const rows = unwrapQueryResult<{values?: {roles?: Array<{role_id?: unknown; weight?: number}>; users?: Array<{user_id?: unknown; weight?: number}>}}>(
    await db.query(
      `SELECT values FROM ${Tables.settings} WHERE key = $key AND is_global = true LIMIT 1`,
      {key: "tip_distribution"},
    ),
  );
  const values = rows[0]?.values ?? {};
  const roleIds = (values.roles ?? []).map(r => recordIdToString(r.role_id));
  const userIds = (values.users ?? []).map(u => recordIdToString(u.user_id));
  const [roles, users] = await Promise.all([
    resolveNamesByIds(db, Tables.user_roles, roleIds),
    resolveNamesByIds(db, Tables.users, userIds),
  ]);

  // Prefer login for users when available
  const userLoginMap = new Map<string, string>();
  if (userIds.length) {
    const userRows = unwrapQueryResult<{id: unknown; login?: string; first_name?: string; last_name?: string}>(
      await db.query(
        `SELECT id, login, first_name, last_name FROM ${Tables.users} WHERE id IN $ids`,
        {ids: userIds.map(id => toRecordId(id))},
      ),
    );
    for (const u of userRows) {
      const id = recordIdToString(u.id);
      const name = `${u.first_name ?? ""} ${u.last_name ?? ""}`.trim();
      userLoginMap.set(id, u.login || name || id);
    }
  }

  return {
    roles: (values.roles ?? []).map(row => ({
      role_id: recordIdToString(row.role_id),
      role_name: roles.get(recordIdToString(row.role_id)) ?? recordIdToString(row.role_id),
      weight: Number(row.weight ?? 0),
    })),
    users: (values.users ?? []).map(row => ({
      user_id: recordIdToString(row.user_id),
      user_login: userLoginMap.get(recordIdToString(row.user_id))
        ?? users.get(recordIdToString(row.user_id))
        ?? recordIdToString(row.user_id),
      weight: Number(row.weight ?? 0),
    })),
  };
};
