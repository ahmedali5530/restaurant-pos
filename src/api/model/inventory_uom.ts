export type InventoryUomFamily = "weight" | "volume" | "count" | "pack";

export interface InventoryUomRecord {
  id?: string;
  code: string;
  name: string;
  family: InventoryUomFamily;
  base_factor: number;
  is_system: boolean;
  is_active: boolean;
  sort: number;
}

/** Family base unit codes shown in admin (“1 GAL = N ML”). */
export const UOM_FAMILY_BASE_CODE: Record<InventoryUomFamily, string> = {
  weight: "G",
  volume: "ML",
  count: "PC",
  pack: "PK",
};
