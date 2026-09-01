import {safeNumber} from "@/lib/utils.ts";

type Priced = {price?: number | null} | null | undefined;
type CatalogItem = {price?: number | null; average_price?: number | null} | null | undefined;

/**
 * Resolve unit cost for an inventory line:
 * 1) snapshot line.price
 * 2) linked purchase/issue line price
 * 3) catalog average_price || price
 */
export const resolveInventoryLineUnitCost = (opts: {
  price?: number | null;
  purchaseItem?: Priced;
  issueItem?: Priced;
  issuedItem?: Priced;
  item?: CatalogItem;
}): number => {
  if (opts.price != null && opts.price !== undefined && Number.isFinite(Number(opts.price))) {
    return safeNumber(opts.price);
  }
  if (opts.purchaseItem?.price != null && Number.isFinite(Number(opts.purchaseItem.price))) {
    return safeNumber(opts.purchaseItem.price);
  }
  if (opts.issuedItem?.price != null && Number.isFinite(Number(opts.issuedItem.price))) {
    return safeNumber(opts.issuedItem.price);
  }
  if (opts.issueItem?.price != null && Number.isFinite(Number(opts.issueItem.price))) {
    return safeNumber(opts.issueItem.price);
  }
  if (opts.item?.average_price != null && Number.isFinite(Number(opts.item.average_price))) {
    return safeNumber(opts.item.average_price);
  }
  return safeNumber(opts.item?.price);
};

export const resolveCatalogUnitCost = (item?: CatalogItem): number => {
  if (item?.average_price != null && Number.isFinite(Number(item.average_price))) {
    return safeNumber(item.average_price);
  }
  return safeNumber(item?.price);
};

export const lineAmount = (unitCost: number, quantity: number) =>
  safeNumber(unitCost) * safeNumber(quantity);
