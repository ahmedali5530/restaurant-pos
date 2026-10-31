import {findBestSmartMatch} from "@/lib/data-import/fuzzy.ts";
import {
  DEFAULT_INVENTORY_UOMS,
  getActiveInventoryUoms,
  getInventoryUomByCode,
  getInventoryUomCatalog,
} from "@/lib/inventory/uom.catalog.ts";
import type {InventoryUomFamily} from "@/api/model/inventory_uom.ts";

/** Seed codes (system defaults). Custom DB units are also valid InventoryUom values. */
export const INVENTORY_UOMS = DEFAULT_INVENTORY_UOMS as readonly string[];

/** Canonical UOM code (system or custom). */
export type InventoryUom = string;

export type UomFamily = InventoryUomFamily | "unknown";

const UOM_ALIASES: Record<string, string> = {
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
  mg: "MG",
  milligram: "MG",
  milligrams: "MG",
  lb: "LB",
  lbs: "LB",
  pound: "LB",
  pounds: "LB",
  oz: "OZ",
  ounce: "OZ",
  ounces: "OZ",
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
  gal: "GAL",
  gallon: "GAL",
  gallons: "GAL",
  qt: "QT",
  quart: "QT",
  quarts: "QT",
  pt: "PT",
  pint: "PT",
  pints: "PT",
  floz: "FLOZ",
  fluidounce: "FLOZ",
  fluidounces: "FLOZ",
  flounce: "FLOZ",
  flounces: "FLOZ",
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
  pac: "PK",
  pack: "PK",
  packs: "PK",
  package: "PK",
  packages: "PK",
};

export function getInventoryUomOptions(): Array<{label: string; value: InventoryUom}> {
  return getActiveInventoryUoms().map((u) => ({label: u.name || u.code, value: u.code}));
}

export function isInventoryUom(value: string): value is InventoryUom {
  return getInventoryUomByCode(value) != null;
}

export function getUomFamily(uom: string | null | undefined): UomFamily {
  const canonical = normalizeUom(uom);
  if (!canonical) return "unknown";
  return getInventoryUomByCode(canonical)?.family ?? "unknown";
}

/**
 * Units the user may enter on a line for an item whose stock unit is `stockUom`.
 * Pack and unknown units only allow the stock unit itself.
 */
export function getConvertibleUoms(stockUom: string | null | undefined): InventoryUom[] {
  const canonical = normalizeUom(stockUom);
  if (!canonical) return [];
  const family = getUomFamily(canonical);
  if (family === "pack" || family === "unknown") return [canonical];
  const codes = getActiveInventoryUoms()
    .filter((u) => u.family === family)
    .map((u) => u.code);
  if (!codes.includes(canonical)) codes.unshift(canonical);
  return codes;
}

export function getConvertibleUomOptions(
  stockUom: string | null | undefined
): Array<{label: string; value: InventoryUom}> {
  return getConvertibleUoms(stockUom).map((code) => {
    const rec = getInventoryUomByCode(code);
    return {label: rec?.name || code, value: code};
  });
}

/** True when packaging has no cross-unit conversion (PK or unknown). */
export function isNonConvertibleStockUom(stockUom: string | null | undefined): boolean {
  const family = getUomFamily(stockUom);
  return family === "pack" || family === "unknown";
}

/**
 * Factor from `uom` into the family's base (G, ML, or PC).
 * Optional `packSize` is reserved for a future pack-size table.
 */
export function getUomBaseFactor(uom: InventoryUom, packSize?: number): number {
  const rec = getInventoryUomByCode(uom);
  if (!rec) return 1;
  if (rec.family === "pack") {
    const size = Number(packSize);
    return Number.isFinite(size) && size > 0 ? size : rec.base_factor || 1;
  }
  return rec.base_factor;
}

/**
 * Convert quantity from one UOM to another within the same family.
 * Throws when units are missing, unknown, or from different families.
 */
export function convertQuantity(
  quantity: number,
  fromUom: string | null | undefined,
  toUom: string | null | undefined,
  packSize?: number
): number {
  const from = normalizeUom(fromUom);
  const to = normalizeUom(toUom);
  if (!from || !to) {
    throw new Error("Unknown unit of measure");
  }
  if (from === to) return quantity;

  const fromRec = getInventoryUomByCode(from);
  const toRec = getInventoryUomByCode(to);
  const fromFamily = fromRec?.family ?? "unknown";
  const toFamily = toRec?.family ?? "unknown";
  if (fromFamily === "pack" || toFamily === "pack") {
    throw new Error("Pack units cannot be converted");
  }
  if (fromFamily === "unknown" || toFamily === "unknown" || fromFamily !== toFamily) {
    throw new Error(`Cannot convert ${from} to ${to}`);
  }

  const inBase = quantity * getUomBaseFactor(from, packSize);
  return inBase / getUomBaseFactor(to, packSize);
}

/**
 * Normalize a free-text UOM to a canonical inventory UOM code.
 * Returns null when no confident match is found.
 */
export function normalizeUom(input: unknown): InventoryUom | null {
  if (input === null || input === undefined) return null;
  const raw = String(input).trim();
  if (!raw) return null;

  const compact = raw.toLowerCase().replace(/[\s._-]+/g, "");
  if (UOM_ALIASES[compact]) {
    const aliased = UOM_ALIASES[compact];
    if (getInventoryUomByCode(aliased)) return aliased;
  }

  const upper = raw.toUpperCase();
  if (getInventoryUomByCode(upper)) return upper;

  const catalog = getInventoryUomCatalog();
  const candidates = catalog.map((u) => ({label: u.code}));
  const smart = findBestSmartMatch(raw, candidates);
  if (smart?.kind === "match" && getInventoryUomByCode(smart.match.label)) {
    return smart.match.label;
  }

  const nameCandidates = catalog.map((u) => ({label: u.name, code: u.code}));
  const nameHit = findBestSmartMatch(raw, nameCandidates.map((n) => ({label: n.label})), 0.85);
  if (nameHit?.kind === "match") {
    const match = nameCandidates.find((n) => n.label === nameHit.match.label);
    if (match && getInventoryUomByCode(match.code)) return match.code;
  }

  const aliasCandidates = Object.keys(UOM_ALIASES).map((label) => ({label}));
  const aliasHit = findBestSmartMatch(raw, aliasCandidates, 0.85);
  if (aliasHit?.kind === "match") {
    const code = UOM_ALIASES[aliasHit.match.label];
    return code && getInventoryUomByCode(code) ? code : null;
  }

  return null;
}

/**
 * Parse values like "1 PAC", "4PAC", "12 kg", "2.5L" into quantity + optional UOM.
 * Returns null when no leading number is found.
 */
export function parseQuantityWithOptionalUom(input: unknown): {
  quantity: number;
  uom: InventoryUom | null;
  rawUom: string | null;
} | null {
  if (input === null || input === undefined) return null;
  if (typeof input === "number" && Number.isFinite(input)) {
    return {quantity: input, uom: null, rawUom: null};
  }
  const raw = String(input).trim();
  if (!raw) return null;

  const match = raw.match(/^([+-]?\d+(?:[.,]\d+)?)\s*(.*)$/);
  if (!match) return null;

  const quantity = Number(String(match[1]).replace(/,/g, ""));
  if (!Number.isFinite(quantity)) return null;

  const rawUom = String(match[2] ?? "").trim();
  if (!rawUom) {
    return {quantity, uom: null, rawUom: null};
  }
  return {
    quantity,
    uom: normalizeUom(rawUom),
    rawUom,
  };
}

/** True when a UOM cell looks like a pack/case size number, not a unit code. */
export function looksLikeNumericPackSize(input: unknown): boolean {
  if (input === null || input === undefined || input === "") return false;
  if (typeof input === "number" && Number.isFinite(input)) return true;
  return /^\d+(\.\d+)?$/.test(String(input).trim());
}

export function formatUomList(): string {
  return getActiveInventoryUoms()
    .map((u) => u.code)
    .join(", ");
}
