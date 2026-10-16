'use strict';

/**
 * Menu catalog for QR self-ordering, resolved the same way the POS menu
 * screen does (`src/lib/menu.resolver.ts` + `src/infrastructure/pos-store/catalog.ts`):
 * active menus (inside their time window) override price / tax mode / taxes,
 * modifier prices may be overridden per menu, and dishes route to kitchens via
 * their workflow stages or, without a workflow, via `kitchen.items`.
 */

const { rows } = require('../sync-store');

const CACHE_MS = 30_000;
let cache = null;

const idOf = (value) => {
  if (value == null) return '';
  if (typeof value === 'object' && value.id != null && !(value.tb || value.table)) return idOf(value.id);
  return String(value);
};

const alive = (row) => row && !row.deleted_at;

const byPriorityName = (a, b) => {
  const pa = Number(a?.priority ?? 0);
  const pb = Number(b?.priority ?? 0);
  if (pa !== pb) return pa - pb;
  return String(a?.name ?? '').localeCompare(String(b?.name ?? ''));
};

function minutesInZone(value, timezone) {
  if (!value) return undefined;
  const date = new Date(value instanceof Date ? value : String(value));
  if (Number.isNaN(date.getTime())) return undefined;
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? 0);
  const minute = Number(parts.find((p) => p.type === 'minute')?.value ?? 0);
  return hour * 60 + minute;
}

/** `isMenuActiveNow` from the POS menu resolver. */
function isMenuActiveNow(menu, timezone, now = new Date()) {
  const nowMinutes = minutesInZone(now, timezone);
  const start = minutesInZone(menu.start_from, timezone);
  const end = minutesInZone(menu.end_time, timezone);
  if (start === undefined && end === undefined) return true;
  if (start !== undefined && end !== undefined) {
    const overnight = menu.ends_on_next_day ?? end <= start;
    return overnight ? nowMinutes >= start || nowMinutes <= end : nowMinutes >= start && nowMinutes <= end;
  }
  if (start !== undefined) return nowMinutes >= start;
  return nowMinutes <= end;
}

async function loadRaw(db) {
  const tables = [
    'menu', 'menu_menu_item', 'menu_item', 'category', 'tax', 'kitchen',
    'workflow', 'workflow_stage', 'menu_item_modifier_group', 'modifier_group', 'modifier',
  ];
  const result = await db.query(tables.map((t) => `SELECT * FROM ${t};`).join('\n'));
  const out = {};
  tables.forEach((t, i) => {
    out[t] = Array.isArray(result?.[i]) ? result[i] : rows([result?.[i]]);
  });
  return out;
}

function mapById(list) {
  const map = new Map();
  for (const row of list || []) map.set(idOf(row.id), row);
  return map;
}

/**
 * Build the resolved catalog. Returned dishes carry everything pricing and
 * kitchen routing need; `publicDish()` strips it down for the browser.
 */
function buildCatalog(raw, timezone, now = new Date()) {
  const taxMap = mapById(raw.tax);
  const kitchens = (raw.kitchen || []).filter(alive);
  const categoryMap = mapById((raw.category || []).filter(alive));
  const modifierGroupMap = mapById((raw.modifier_group || []).filter(alive));
  const modifierMap = mapById(raw.modifier);
  const baseDishMap = mapById((raw.menu_item || []).filter(alive));
  const menuItemMap = mapById(raw.menu_menu_item);

  const stagesByWorkflow = new Map();
  for (const stage of raw.workflow_stage || []) {
    const wf = idOf(stage.workflow);
    if (!wf) continue;
    const list = stagesByWorkflow.get(wf) ?? [];
    list.push(stage);
    stagesByWorkflow.set(wf, list);
  }
  for (const list of stagesByWorkflow.values()) {
    list.sort((a, b) => Number(a.sequence ?? 0) - Number(b.sequence ?? 0));
  }
  const workflowMap = new Map();
  for (const wf of (raw.workflow || []).filter(alive)) {
    workflowMap.set(idOf(wf.id), { id: idOf(wf.id), stages: stagesByWorkflow.get(idOf(wf.id)) ?? [] });
  }

  const resolveTaxes = (list) =>
    (Array.isArray(list) ? list : [])
      .map((ref) => taxMap.get(idOf(ref)))
      .filter(Boolean)
      .map((tax) => ({ id: idOf(tax.id), name: String(tax.name ?? 'Tax'), rate: Number(tax.rate || 0) }));

  // Active menus → dish overrides (first menu wins, like resolveMenuItemMap).
  const activeMenus = (raw.menu || [])
    .filter((menu) => alive(menu) && menu.active !== false)
    .filter((menu) => isMenuActiveNow(menu, timezone, now));
  const resolved = new Map();
  for (const menu of activeMenus) {
    for (const ref of menu.items || []) {
      const menuItem = menuItemMap.get(idOf(ref));
      if (!menuItem || menuItem.active === false) continue;
      const dishId = idOf(menuItem.menu_item);
      if (!dishId || resolved.has(dishId) || !baseDishMap.has(dishId)) continue;
      resolved.set(dishId, { menuItem, menuName: String(menu.name ?? '') });
    }
  }

  const dishes = [];
  const pushDish = (base, override) => {
    const taxes = override ? resolveTaxes(override.menuItem.taxes) : [];
    const workflow = workflowMap.get(idOf(base.workflow));
    dishes.push({
      id: idOf(base.id),
      name: String(base.name ?? ''),
      number: base.number != null ? String(base.number) : '',
      priority: Number(base.priority ?? 0),
      price: Number(override?.menuItem.price ?? base.price ?? 0),
      tax_mode: override?.menuItem.tax_mode === 'inclusive' ? 'inclusive' : 'exclusive',
      taxes,
      menu_name: override?.menuName ?? null,
      modifier_overrides: override?.menuItem.modifier_overrides ?? null,
      categoryIds: (base.categories || []).map(idOf).filter((id) => categoryMap.has(id)),
      workflow: workflow && workflow.stages.length ? workflow : null,
      stage_overrides: base.stage_overrides ?? null,
    });
  };
  if (resolved.size > 0) {
    for (const [dishId, override] of resolved) pushDish(baseDishMap.get(dishId), override);
  } else {
    for (const base of baseDishMap.values()) pushDish(base, null);
  }
  dishes.sort(byPriorityName);
  const dishMap = mapById(dishes);

  // Modifier groups attached to each dish (menu_item_modifier_group: in=dish, out=group).
  const groupsByDish = new Map();
  for (const link of raw.menu_item_modifier_group || []) {
    const dishId = idOf(link.in);
    const group = modifierGroupMap.get(idOf(link.out));
    if (!dishId || !group) continue;
    const list = groupsByDish.get(dishId) ?? [];
    list.push({ link, group });
    groupsByDish.set(dishId, list);
  }
  const modifierDishIds = new Set();
  for (const modifier of raw.modifier || []) modifierDishIds.add(idOf(modifier.modifier));

  for (const dish of dishes) {
    const overridePrices = new Map(
      (dish.modifier_overrides?.prices || [])
        .filter((row) => row?.modifier_id != null && Number.isFinite(Number(row.price)))
        .map((row) => [idOf(row.modifier_id), Number(row.price)]),
    );
    dish.modifierGroups = (groupsByDish.get(dish.id) || [])
      .sort((a, b) => Number(a.link.priority ?? 0) - Number(b.link.priority ?? 0))
      .map(({ link, group }) => {
        const required = link.has_required_modifiers ? Math.max(0, Number(link.required_modifiers || 0)) : 0;
        const options = (group.modifiers || [])
          .map((ref) => modifierMap.get(idOf(ref)))
          .filter(Boolean)
          .map((modifier) => {
            const optionDish = baseDishMap.get(idOf(modifier.modifier));
            if (!optionDish) return null;
            const modifierId = idOf(modifier.id);
            return {
              id: modifierId,
              dishId: idOf(optionDish.id),
              name: String(optionDish.name ?? ''),
              number: optionDish.number != null ? String(optionDish.number) : '',
              price: overridePrices.get(modifierId) ?? Number(modifier.price ?? 0),
            };
          })
          .filter(Boolean);
        return {
          id: idOf(link.id),
          groupId: idOf(group.id),
          name: String(group.name ?? ''),
          priority: Number(group.priority ?? 0),
          required,
          options,
        };
      })
      .filter((group) => group.options.length > 0);
  }

  const categories = [...categoryMap.values()]
    .map((c) => ({ id: idOf(c.id), name: String(c.name ?? ''), priority: Number(c.priority ?? 0) }))
    .sort(byPriorityName);

  // Categories made up entirely of modifier-only dishes (e.g. "Extra cheese")
  // are hidden from customers unless the admin chose otherwise.
  const modifierOnlyCategoryIds = categories
    .filter((category) => {
      const inCategory = dishes.filter((d) => d.categoryIds.includes(category.id));
      return inCategory.length > 0 && inCategory.every((d) => modifierDishIds.has(d.id));
    })
    .map((c) => c.id);

  return { dishes, dishMap, categories, kitchens, modifierOnlyCategoryIds };
}

async function getCatalog(db, timezone) {
  const now = Date.now();
  if (!cache || now - cache.at > CACHE_MS || cache.timezone !== timezone) {
    const raw = await loadRaw(db);
    cache = { at: now, timezone, raw };
  }
  return buildCatalog(cache.raw, timezone, new Date());
}

function invalidateCatalog() {
  cache = null;
}

/**
 * Kitchen stage rows for a dish (`kitchenStagesFromDish`): workflow dishes get
 * one row per stage (first pending, rest waiting); others fan out to every
 * kitchen whose `items` include the dish.
 */
function kitchenStagesForDish(dish, kitchens) {
  const stages = dish.workflow?.stages ?? [];
  if (stages.length > 0) {
    const overrides = dish.stage_overrides ?? {};
    return stages.map((stage, index) => ({
      kitchenId: idOf(overrides[idOf(stage.id)] ?? stage.kitchen),
      sequence: Number(stage.sequence ?? index),
      isTerminal: !!stage.is_terminal || index === stages.length - 1,
      workflowId: dish.workflow.id,
      stageId: idOf(stage.id),
      stageName: stage.name != null ? String(stage.name) : null,
      status: index === 0 ? 'pending' : 'waiting',
    }));
  }
  return kitchens
    .filter((kitchen) => (kitchen.items || []).some((item) => idOf(item) === dish.id))
    .map((kitchen) => ({
      kitchenId: idOf(kitchen.id),
      sequence: 0,
      isTerminal: true,
      workflowId: null,
      stageId: null,
      stageName: null,
      status: 'pending',
    }));
}

module.exports = {
  idOf,
  isMenuActiveNow,
  buildCatalog,
  getCatalog,
  invalidateCatalog,
  kitchenStagesForDish,
};
