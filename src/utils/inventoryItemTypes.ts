import {
  InventoryItem,
  InventoryItemType,
} from "@/api/model/inventory_item.ts";

const VALID_TYPES: InventoryItemType[] = ["raw", "semi_finished", "finished"];

const TYPE_ORDER: Record<InventoryItemType, number> = {
  raw: 0,
  semi_finished: 1,
  finished: 2,
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

export const hasItemType = (
  item: ItemTypeSource | null | undefined,
  type: InventoryItemType
): boolean => getItemTypesFromRecord(item).includes(type);

export const canUseInDishRecipe = (item: ItemTypeSource | null | undefined): boolean =>
  hasItemType(item, "semi_finished") || hasItemType(item, "finished");

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
