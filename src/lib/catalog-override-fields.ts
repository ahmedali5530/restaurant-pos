/**
 * Per-table fields that may appear in catalog_branch_override.patch.
 * Relations (modifiers, recipes, categories, …) stay on the shared base only.
 * Keep in sync with sync-service/src/catalog-override-fields.js.
 */
export const CATALOG_OVERRIDEABLE_FIELDS: Record<string, readonly string[]> = {
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
  // Branch-owned / structural — no sparse overrides
  order_type_placeholder: [],
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

export function overridableFieldsFor(table: string): readonly string[] {
  return CATALOG_OVERRIDEABLE_FIELDS[table] || [];
}

export function tableSupportsBranchOverrides(table: string): boolean {
  return overridableFieldsFor(table).length > 0;
}

export function sanitizeCatalogPatch(
  table: string,
  patch: Record<string, unknown> | null | undefined,
): Record<string, unknown> {
  const allowed = new Set(overridableFieldsFor(table));
  const out: Record<string, unknown> = {};
  if (!patch || typeof patch !== 'object') return out;
  for (const [key, value] of Object.entries(patch)) {
    if (!allowed.has(key)) continue;
    if (value === undefined) continue;
    if (value === '') continue;
    out[key] = value;
  }
  return out;
}

export function mergeCatalogBaseWithPatch(
  table: string,
  base: Record<string, unknown> | null | undefined,
  patch: Record<string, unknown> | null | undefined,
): Record<string, unknown> {
  const baseRow = base && typeof base === 'object' ? { ...base } : {};
  const safePatch = sanitizeCatalogPatch(table, patch);
  return { ...baseRow, ...safePatch };
}

/** Diff next values for overridable keys only (branch-mode save). */
export function buildOverridePatchFromValues(
  table: string,
  nextValues: Record<string, unknown>,
  _previousMerged?: Record<string, unknown> | null,
): Record<string, unknown> {
  const allowed = overridableFieldsFor(table);
  const patch: Record<string, unknown> = {};
  for (const key of allowed) {
    if (!(key in nextValues)) continue;
    const next = nextValues[key];
    if (next === undefined || next === '') continue;
    patch[key] = next;
  }
  return sanitizeCatalogPatch(table, patch);
}

export function catalogOverrideRecordKey(
  table: string,
  baseId: string,
  branchId: string,
): string {
  const baseKey = String(baseId || '')
    .replace(/^[^:]+:/, '')
    .replace(/[^A-Za-z0-9_-]/g, '_');
  const branchKey = String(branchId || '').replace(/[^A-Za-z0-9_-]/g, '_');
  const tableKey = String(table || '').replace(/[^A-Za-z0-9_-]/g, '_');
  return `${tableKey}_${baseKey}_${branchKey}`;
}
