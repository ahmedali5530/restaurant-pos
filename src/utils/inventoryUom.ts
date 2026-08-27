import {findBestSmartMatch} from "@/lib/data-import/fuzzy.ts";

/** Canonical inventory UOM values (same options as the item form). */
export const INVENTORY_UOMS = ["KG", "G", "L", "ML", "PC", "DZN", "PK"] as const;

export type InventoryUom = (typeof INVENTORY_UOMS)[number];

const UOM_ALIASES: Record<string, InventoryUom> = {
  kg: "KG",
  kilo: "KG",
  kilos: "KG",
  kilogram: "KG",
  kilograms: "KG",
  g: "G",
  gram: "G",
  grams: "G",
  gm: "G",
  gms: "G",
  l: "L",
  lt: "L",
  ltr: "L",
  liter: "L",
  liters: "L",
  litre: "L",
  litres: "L",
  ml: "ML",
  milliliter: "ML",
  milliliters: "ML",
  millilitre: "ML",
  millilitres: "ML",
  pc: "PC",
  pcs: "PC",
  piece: "PC",
  pieces: "PC",
  ea: "PC",
  each: "PC",
  unit: "PC",
  units: "PC",
  dzn: "DZN",
  doz: "DZN",
  dozen: "DZN",
  dozens: "DZN",
  pk: "PK",
  pkt: "PK",
  pack: "PK",
  packs: "PK",
  package: "PK",
  packages: "PK",
};

export function getInventoryUomOptions(): Array<{label: string; value: InventoryUom}> {
  return INVENTORY_UOMS.map((uom) => ({label: uom, value: uom}));
}

export function isInventoryUom(value: string): value is InventoryUom {
  return (INVENTORY_UOMS as readonly string[]).includes(value);
}

/**
 * Normalize a free-text UOM to a canonical inventory UOM.
 * Returns null when no confident match is found.
 */
export function normalizeUom(input: unknown): InventoryUom | null {
  if (input === null || input === undefined) return null;
  const raw = String(input).trim();
  if (!raw) return null;

  const compact = raw.toLowerCase().replace(/[\s._-]+/g, "");
  if (UOM_ALIASES[compact]) return UOM_ALIASES[compact];

  const upper = raw.toUpperCase();
  if (isInventoryUom(upper)) return upper;

  const candidates = INVENTORY_UOMS.map((label) => ({label}));
  const smart = findBestSmartMatch(raw, candidates);
  if (smart?.kind === "match" && isInventoryUom(smart.match.label)) {
    return smart.match.label;
  }

  // Also try alias keys via smart match on alias names
  const aliasCandidates = Object.keys(UOM_ALIASES).map((label) => ({label}));
  const aliasHit = findBestSmartMatch(raw, aliasCandidates, 0.85);
  if (aliasHit?.kind === "match") {
    return UOM_ALIASES[aliasHit.match.label] ?? null;
  }

  return null;
}

export function formatUomList(): string {
  return INVENTORY_UOMS.join(", ");
}
