'use strict';

/**
 * Per-table fields that may appear in catalog_branch_override.patch.
 * Keep in sync with src/lib/catalog-override-fields.ts.
 */
const CATALOG_OVERRIDEABLE_FIELDS = {
  menu_item: [
    'price',
    'cost',
    'number',
    'workflow',
    'stage_overrides',
    'tax',
    'discount',
    'discount_type',
    'priority',
    'position',
    'allow_half',
    'allow_service_charges',
    'deleted_at',
  ],
  category: ['priority', 'show_in_menu', 'color', 'background', 'deleted_at'],
  tax: ['rate', 'priority', 'deleted_at'],
  payment_type: ['priority', 'has_discount', 'deleted_at'],
  order_type: ['priority', 'allow_service_charges', 'deleted_at'],
  extra: ['value', 'apply_to_all'],
  discount: [
    'value',
    'max_value',
    'min_value',
    'min_order_amount',
    'max_cap',
    'max_rate',
    'min_rate',
    'priority',
    'is_active',
    'deleted_at',
  ],
  coupon: [
    'discount_value',
    'max_discount_amount',
    'min_order_amount',
    'priority',
    'is_active',
    'usage_limit',
    'usage_limit_per_user',
    'deleted_at',
  ],
  modifier: ['price'],
  modifier_group: ['priority', 'color', 'background', 'deleted_at'],
  menu: ['active', 'deleted_at'],
  menu_menu_item: ['price', 'base_price', 'active', 'tax_mode', 'deleted_at'],
  menu_item_modifier_group: [],
  floor: [],
  floor_table: [],
  kitchen: [],
  workflow: [],
  workflow_stage: [],
  setting: [],
  user: [],
  discount_reason: ['is_active', 'deleted_at'],
  printer: [],
};

const OVERRIDE_CONTROL_TABLE = 'catalog_branch_override';

function overridableFieldsFor(table) {
  return CATALOG_OVERRIDEABLE_FIELDS[table] || [];
}

function sanitizeCatalogPatch(table, patch) {
  const allowed = new Set(overridableFieldsFor(table));
  const out = {};
  if (!patch || typeof patch !== 'object') return out;
  for (const [key, value] of Object.entries(patch)) {
    if (!allowed.has(key)) continue;
    if (value === undefined) continue;
    if (value === '') continue;
    out[key] = value;
  }
  return out;
}

function mergeCatalogBaseWithPatch(table, base, patch) {
  const baseRow = base && typeof base === 'object' ? { ...base } : {};
  const safePatch = sanitizeCatalogPatch(table, patch);
  return { ...baseRow, ...safePatch };
}

function catalogOverrideRecordKey(table, baseId, branchId) {
  const baseKey = String(baseId || '')
    .replace(/^[^:]+:/, '')
    .replace(/[^A-Za-z0-9_-]/g, '_');
  const branchKey = String(branchId || '').replace(/[^A-Za-z0-9_-]/g, '_');
  const tableKey = String(table || '').replace(/[^A-Za-z0-9_-]/g, '_');
  return `${tableKey}_${baseKey}_${branchKey}`;
}

function overrideCacheKey(table, baseId) {
  return `${table}:${String(baseId)}`;
}

module.exports = {
  CATALOG_OVERRIDEABLE_FIELDS,
  OVERRIDE_CONTROL_TABLE,
  overridableFieldsFor,
  sanitizeCatalogPatch,
  mergeCatalogBaseWithPatch,
  catalogOverrideRecordKey,
  overrideCacheKey,
};
