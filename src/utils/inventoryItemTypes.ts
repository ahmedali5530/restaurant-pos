import {
  InventoryItem,
  InventoryItemType,
} from "@/api/model/inventory_item.ts";
import {findBestSmartMatch} from "@/lib/data-import/fuzzy.ts";

const VALID_TYPES: InventoryItemType[] = ["raw", "semi_finished", "finished"];

const TYPE_ORDER: Record<InventoryItemType, number> = {
  raw: 0,
  semi_finished: 1,
  finished: 2,
};

const TYPE_ALIASES: Record<string, InventoryItemType> = {
  raw: "raw",
  ingredient: "raw",
  ingredients: "raw",
  material: "raw",
  materials: "raw",
  semi: "semi_finished",
  semi_finished: "semi_finished",
  "semi-finished": "semi_finished",
  semifinished: "semi_finished",
  "semi finished": "semi_finished",
  finished: "finished",
  "finished goods": "finished",
  finished_goods: "finished",
  product: "finished",
  products: "finished",
};

type ItemTypeSource = {
  item_types?: InventoryItemType[];
  item_type?: InventoryItemType;
};

export const getItemTypesFromRecord = (item?: ItemTypeSource | null): InventoryItemType[] => {
  if (!item) return ["raw"];

  if (item.item_types?.length) {
    return normalizeItemTypes(item.item_types);
  }

  if (item.item_type) {
    return normalizeItemTypes([item.item_type]);
  }

  return ["raw"];
};

export const normalizeItemTypes = (
  value?: InventoryItemType[] | InventoryItemType | null
): InventoryItemType[] => {
  const list = Array.isArray(value) ? value : value ? [value] : ["raw"];
  const unique = [
    ...new Set(
      list.filter((type): type is InventoryItemType => VALID_TYPES.includes(type as InventoryItemType))
    ),
  ];

  if (unique.length === 0) {
    return ["raw"];
  }

  return unique.sort((a, b) => TYPE_ORDER[a] - TYPE_ORDER[b]);
};

/** Resolve a free-text item type token to a canonical InventoryItemType. */
export function resolveItemTypeToken(raw: string): InventoryItemType | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const lower = trimmed.toLowerCase().replace(/[\s-]+/g, "_");
  const spaced = trimmed.toLowerCase().replace(/[_-]+/g, " ").trim();
  if (TYPE_ALIASES[lower]) return TYPE_ALIASES[lower];
  if (TYPE_ALIASES[spaced]) return TYPE_ALIASES[spaced];
  if (VALID_TYPES.includes(lower as InventoryItemType)) {
    return lower as InventoryItemType;
  }

  const candidates = [
    ...VALID_TYPES.map((label) => ({label})),
    ...Object.keys(TYPE_ALIASES).map((label) => ({label})),
  ];
  const hit = findBestSmartMatch(trimmed, candidates, 0.8);
  if (!hit || hit.kind !== "match") return null;
  const key = hit.match.label.toLowerCase().replace(/[\s-]+/g, "_");
  if (TYPE_ALIASES[hit.match.label.toLowerCase()]) {
    return TYPE_ALIASES[hit.match.label.toLowerCase()];
  }
  if (TYPE_ALIASES[key]) return TYPE_ALIASES[key];
  if (VALID_TYPES.includes(hit.match.label as InventoryItemType)) {
    return hit.match.label as InventoryItemType;
  }
  return null;
}

/**
 * Parse comma-separated item type text into canonical types.
 * Unknown tokens are dropped; empty result defaults via normalizeItemTypes.
 */
export function parseItemTypesInput(raw: unknown): InventoryItemType[] {
  if (raw === null || raw === undefined || raw === "") {
    return normalizeItemTypes(null);
  }
  if (Array.isArray(raw)) {
    const mapped = raw
      .map((v) => resolveItemTypeToken(String(v)))
      .filter((v): v is InventoryItemType => Boolean(v));
    return normalizeItemTypes(mapped);
  }
  const parts = String(raw)
    .split(/[|,;]/)
    .map((s) => s.trim())
    .filter(Boolean);
  const mapped = parts
    .map((p) => resolveItemTypeToken(p))
    .filter((v): v is InventoryItemType => Boolean(v));
  return normalizeItemTypes(mapped.length ? mapped : null);
}

export const hasItemType = (
  item: ItemTypeSource | null | undefined,
  type: InventoryItemType
): boolean => getItemTypesFromRecord(item).includes(type);

export const canUseInDishRecipe = (_item: ItemTypeSource | null | undefined): boolean =>
  true;
  // hasItemType(item, "semi_finished") || hasItemType(item, "finished");

export const getItemTypeOptions = (
  t: (key: string) => string
): Array<{label: string; value: InventoryItemType}> => [
  {label: t("itemType.raw"), value: "raw"},
  {label: t("itemType.semiFinished"), value: "semi_finished"},
  {label: t("itemType.finished"), value: "finished"},
];

export const itemTypesToSelectOptions = (
  types: InventoryItemType[],
  options: Array<{label: string; value: InventoryItemType}>
) =>
  normalizeItemTypes(types)
    .map((type) => options.find((option) => option.value === type))
    .filter((option): option is {label: string; value: InventoryItemType} => Boolean(option));

export type {InventoryItem};
