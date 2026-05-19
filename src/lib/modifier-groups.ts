import { Tables } from "@/api/db/tables.ts";
import { CartModifierGroup, MenuItem, MenuItemType } from "@/api/model/cart_item.ts";
import { DishModifierGroup } from "@/api/model/dish_modifier_group.ts";
import {
  Modifier,
  ModifierNextGroupOverride,
  ModifierNextGroupOverrideItem,
} from "@/api/model/modifier.ts";
import { ModifierGroup } from "@/api/model/modifier_group.ts";
import { toRecordId } from "@/lib/utils.ts";
import { nanoid } from "nanoid";

type DbClient = {
  query: (sql: string, bindings?: Record<string, unknown>) => Promise<unknown>;
};

export function resolveAllowedNextGroupIds(
  allowed?: Array<{ id: unknown } | string> | null
): string[] | undefined {
  if (allowed === null || allowed === undefined) {
    return undefined;
  }

  return allowed.map((item) =>
    typeof item === 'string' ? item : String(item.id)
  );
}

export async function fetchAttachableGroupsForDish(
  db: DbClient,
  dishId: string
): Promise<DishModifierGroup[]> {
  const result = await db.query(
    `SELECT * FROM ${Tables.dish_modifier_groups} WHERE in = $dish ORDER BY priority ASC FETCH out`,
    { dish: toRecordId(dishId) }
  );
  const rows = Array.isArray(result) ? result[0] : result;

  return Array.isArray(rows) ? (rows as DishModifierGroup[]) : [];
}

export async function fetchModifierGroupTemplate(
  db: DbClient,
  groupId: string
): Promise<ModifierGroup | null> {
  const result = await db.query(
    `SELECT * FROM ONLY ${toRecordId(groupId)} FETCH modifiers, modifiers.modifier`
  );
  const row = Array.isArray(result) ? result[0] : result;

  return row ?? null;
}

export function normalizeNextGroupOverrides(
  raw?: ModifierNextGroupOverride[] | null
): ModifierNextGroupOverride[] {
  if (!raw?.length) {
    return [];
  }

  return raw.map((entry) => ({
    group_id: toRecordId(entry.group_id as string).toString(),
    items: (entry.items ?? []).map((item) => ({
      nested_modifier_id: toRecordId(item.nested_modifier_id as string).toString(),
      price: Number(item.price),
      hidden: Boolean(item.hidden),
    })),
  }));
}

export function getOverrideItemsForGroup(
  overrides: ModifierNextGroupOverride[] | undefined,
  groupId: string
): ModifierNextGroupOverrideItem[] | undefined {
  return overrides?.find((o) => o.group_id === groupId)?.items;
}

export function buildOverrideItemsFromTemplate(
  templateModifiers: Modifier[]
): ModifierNextGroupOverrideItem[] {
  return templateModifiers.map((row) => ({
    nested_modifier_id: row.id.toString(),
    price: Number(row.price),
    hidden: false,
  }));
}

export function mergeNextGroupOverrides(
  existing: ModifierNextGroupOverride[] | undefined,
  groupId: string,
  items: ModifierNextGroupOverrideItem[]
): ModifierNextGroupOverride[] {
  const normalized = normalizeNextGroupOverrides(existing);
  const without = normalized.filter((o) => o.group_id !== groupId);

  return [...without, { group_id: groupId, items }];
}

export function applyOverrideToTemplateModifier(
  templateRow: Modifier,
  overrideItems?: ModifierNextGroupOverrideItem[]
): { price: number; hidden: boolean } {
  const override = overrideItems?.find(
    (item) => item.nested_modifier_id === templateRow.id.toString()
  );

  return {
    price: override?.price ?? Number(templateRow.price),
    hidden: override?.hidden ?? false,
  };
}

export function buildCatalogMenuItem(
  templateRow: Modifier,
  level: number,
  category: string,
  overrideItems?: ModifierNextGroupOverrideItem[]
): MenuItem {
  const { price, hidden } = applyOverrideToTemplateModifier(templateRow, overrideItems);

  const modifierRecordId = templateRow.id.toString();

  return {
    dish: templateRow.modifier,
    price,
    basePrice: Number(templateRow.price),
    id: modifierRecordId,
    catalogModifierId: modifierRecordId,
    quantity: 1,
    level,
    newOrOld: MenuItemType.new,
    category,
    hidden,
    allowedNextGroupIds: resolveAllowedNextGroupIds(templateRow.allowed_next_groups),
    sourceModifier: templateRow,
  };
}

export function buildOverrideCatalogFromTemplate(
  nestedGroup: ModifierGroup,
  overrideItems?: ModifierNextGroupOverrideItem[],
  level = 0,
  category = ''
): MenuItem[] {
  return (nestedGroup.modifiers ?? []).map((row) =>
    buildCatalogMenuItem(row, level, category, overrideItems)
  );
}

export function buildCartModifierGroups(
  dishGroups: DishModifierGroup[],
  level: number,
  categoryForGroup: (grp: DishModifierGroup) => string,
  parentModifier?: Modifier
): CartModifierGroup[] {
  return dishGroups.map((grp) => {
    const groupId = grp.out.id.toString();
    const overrideItems = getOverrideItemsForGroup(
      parentModifier?.next_group_overrides,
      groupId
    );

    return {
      ...grp,
      selectedModifiers: [],
      catalogCustomized: Boolean(overrideItems?.length),
      modifiers: (grp.out.modifiers ?? []).map((row) =>
        buildCatalogMenuItem(row, level, categoryForGroup(grp), overrideItems)
      ),
    };
  });
}

export function buildCartModifierGroupsWithOverrides(
  dishGroups: DishModifierGroup[],
  parentModifier: Modifier | undefined,
  level: number,
  categoryForGroup: (grp: DishModifierGroup) => string
): CartModifierGroup[] {
  return buildCartModifierGroups(dishGroups, level, categoryForGroup, parentModifier);
}

export function buildNestedGroupsForModifier(
  modifierDishId: string,
  allowedNextGroupIds: string[] | undefined,
  groupsDishes: DishModifierGroup[],
  level: number,
  categoryForGroup: (grp: DishModifierGroup) => string,
  parentModifier?: Modifier
): CartModifierGroup[] {
  const allGroups = groupsDishes.filter(
    (row) => row.in.id.toString() === modifierDishId.toString()
  );

  const filtered =
    allowedNextGroupIds === undefined
      ? allGroups
      : allGroups.filter((g) =>
          allowedNextGroupIds.includes(g.out.id.toString())
        );

  return buildCartModifierGroups(filtered, level, categoryForGroup, parentModifier);
}

export function cloneCartModifierGroups(
  groups: CartModifierGroup[]
): CartModifierGroup[] {
  return groups.map((grp) => ({
    ...grp,
    selectedModifiers: [...(grp.selectedModifiers ?? [])].map((selected) => ({
      ...selected,
      catalogModifierId:
        selected.catalogModifierId ??
        selected.sourceModifier?.id?.toString(),
      selectedGroups: selected.selectedGroups
        ? cloneCartModifierGroups(selected.selectedGroups)
        : undefined,
    })),
    modifiers: (grp.modifiers ?? []).map((catalog) => ({
      ...catalog,
      basePrice: catalog.basePrice ?? catalog.price,
      hidden: catalog.hidden ?? false,
      selectedGroups: catalog.selectedGroups
        ? cloneCartModifierGroups(catalog.selectedGroups)
        : undefined,
    })),
  }));
}

export function updateModifierNestedGroups(
  groups: CartModifierGroup[],
  modifierId: string,
  nestedGroups: CartModifierGroup[]
): CartModifierGroup[] {
  return groups.map((grp) => ({
    ...grp,
    selectedModifiers: (grp.selectedModifiers ?? []).map((selected) =>
      selected.id === modifierId
        ? {
            ...selected,
            selectedGroups: cloneCartModifierGroups(nestedGroups),
          }
        : selected
    ),
  }));
}

export function getVisibleCatalogModifiers(group: CartModifierGroup): MenuItem[] {
  return (group.modifiers ?? []).filter((m) => !m.hidden);
}

/** Unique key for a dish↔modifier_group attachment (edge id), not the template group id. */
export function getGroupInstanceKey(
  grp: DishModifierGroup | CartModifierGroup
): string {
  return grp.id.toString();
}

export function isSameGroupInstance(
  a: DishModifierGroup | CartModifierGroup,
  b: DishModifierGroup | CartModifierGroup
): boolean {
  return getGroupInstanceKey(a) === getGroupInstanceKey(b);
}

/** Sidebar label; adds (2), (3) when the same modifier group is attached multiple times. */
export function getGroupSidebarLabel(
  grp: CartModifierGroup,
  allGroups: CartModifierGroup[]
): string {
  const templateId = grp.out.id.toString();
  const instances = allGroups.filter(
    (g) => g.out.id.toString() === templateId
  );

  if (instances.length <= 1) {
    return grp.out.name;
  }

  const instanceNumber =
    instances.findIndex((g) => isSameGroupInstance(g, grp)) + 1;

  return `${grp.out.name} (${instanceNumber})`;
}

/** Stable key for a catalog or selected modifier line (modifier record id, not dish id). */
export function getCatalogModifierKey(item: MenuItem): string {
  return (
    item.catalogModifierId ??
    item.sourceModifier?.id?.toString() ??
    item.id.toString()
  );
}

export function isCatalogModifierSelected(
  group: CartModifierGroup,
  catalogModifier: MenuItem
): boolean {
  const catalogKey = getCatalogModifierKey(catalogModifier);

  return (group.selectedModifiers ?? []).some(
    (selected) => getCatalogModifierKey(selected) === catalogKey
  );
}

export function syncSelectedModifierPrices(
  group: CartModifierGroup
): CartModifierGroup {
  const catalogByModifierId = new Map(
    (group.modifiers ?? []).map((m) => [getCatalogModifierKey(m), m])
  );

  return {
    ...group,
    catalogCustomized: true,
    selectedModifiers: (group.selectedModifiers ?? []).map((selected) => {
      const catalog = catalogByModifierId.get(getCatalogModifierKey(selected));
      if (!catalog) {
        return selected;
      }

      return {
        ...selected,
        price: catalog.price,
      };
    }),
  };
}

export function resetCartModifierGroupCatalog(
  group: CartModifierGroup
): CartModifierGroup {
  const templateByModifierId = new Map(
    (group.out.modifiers ?? []).map((m) => [m.id?.toString(), m])
  );
  const templateByDishId = new Map(
    (group.out.modifiers ?? []).map((m) => [m.modifier.id.toString(), m])
  );

  const resetModifiers = (group.modifiers ?? []).map((catalog) => {
    const template =
      templateByModifierId.get(getCatalogModifierKey(catalog)) ??
      templateByDishId.get(catalog.dish.id.toString());
    const basePrice = template?.price ?? catalog.basePrice ?? catalog.price;

    return {
      ...catalog,
      price: basePrice,
      basePrice,
      hidden: false,
    };
  });

  return syncSelectedModifierPrices({
    ...group,
    catalogCustomized: false,
    modifiers: resetModifiers,
  });
}

export function resolveGroupInList(
  groups: CartModifierGroup[],
  group: CartModifierGroup
): CartModifierGroup {
  return groups.find((g) => isSameGroupInstance(g, group)) ?? group;
}

export function isGroupRequirementMet(grp: CartModifierGroup): boolean {
  if (!grp.has_required_modifiers) {
    return true;
  }

  return (grp.selectedModifiers?.length ?? 0) >= (grp.required_modifiers ?? 0);
}

export function shouldAdvanceFromGroup(grp: CartModifierGroup): boolean {
  return (
    isGroupRequirementMet(grp) ||
    (Boolean(grp.should_auto_open) && !grp.has_required_modifiers)
  );
}

export function findNextActiveGroup(
  groups: CartModifierGroup[],
  current: CartModifierGroup
): CartModifierGroup | undefined {
  const isNotCurrent = (item: CartModifierGroup) =>
    !isSameGroupInstance(item, current);

  const incompleteRequired = groups.find(
    (item) =>
      isNotCurrent(item) &&
      item.has_required_modifiers &&
      (item.selectedModifiers?.length ?? 0) < (item.required_modifiers ?? 0)
  );

  if (incompleteRequired) {
    return incompleteRequired;
  }

  return groups.find(
    (item) =>
      isNotCurrent(item) &&
      Boolean(item.should_auto_open) &&
      !item.has_required_modifiers
  );
}

export function validateNestedGroupsVisibility(
  groups: CartModifierGroup[]
): string | null {
  for (const grp of groups) {
    if (!grp.has_required_modifiers) {
      continue;
    }

    const visibleCount = getVisibleCatalogModifiers(grp).length;
    const required = grp.required_modifiers ?? 0;

    if (visibleCount < required) {
      return `"${grp.out.name}" needs at least ${required} visible options, but only ${visibleCount} are shown.`;
    }
  }

  return null;
}
