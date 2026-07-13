import { OrderItem } from "@/api/model/order_item.ts";
import { Tax } from "@/api/model/tax.ts";
import { TaxMode } from "@/api/model/menu.ts";
import { calculateOrderItemPrice, getOrderItemTaxableUnitBase } from "@/lib/cart.ts";
import { calculateItemTax } from "@/lib/tax-calculator.ts";
import { safeNumber } from "@/lib/utils.ts";

export const inflateInclusiveUnitPrice = (
  net: number,
  taxes: Tax[] | undefined | null,
  originalPrice?: number | null,
): number => {
  const netPrice = safeNumber(net);
  if (taxes && taxes.length > 0) {
    return calculateItemTax(netPrice, taxes, "exclusive").gross_price;
  }
  if (originalPrice != null) {
    return safeNumber(originalPrice);
  }
  return netPrice;
};

export const shouldShowInclusiveItemPrice = (
  item: { tax_mode?: TaxMode; taxes?: Tax[] | null },
  showInclusive: boolean,
): boolean => {
  if (!showInclusive) {
    return false;
  }
  return (item.tax_mode ?? "exclusive") === "inclusive";
};

export const getOrderItemDisplayUnitPrice = (
  item: OrderItem,
  showInclusive: boolean,
): number => {
  const net = safeNumber(item.price ?? item.item?.price ?? 0);
  if (!shouldShowInclusiveItemPrice(item, showInclusive)) {
    return net;
  }
  return inflateInclusiveUnitPrice(net, item.taxes, item.original_price);
};

export const getOrderItemDisplayLineTotal = (
  item: OrderItem,
  showInclusive: boolean,
): number => {
  const netLine = calculateOrderItemPrice(item);
  if (!shouldShowInclusiveItemPrice(item, showInclusive)) {
    return netLine;
  }

  const quantity = safeNumber(item.quantity || 1);
  const unitBase = getOrderItemTaxableUnitBase(item);

  if (item.taxes && item.taxes.length > 0) {
    const grossUnit = inflateInclusiveUnitPrice(unitBase, item.taxes);
    return Math.round(grossUnit * quantity * 100) / 100;
  }

  if (item.original_price != null) {
    const modifiersNet = unitBase - safeNumber(item.price ?? 0);
    const grossUnit = safeNumber(item.original_price) + modifiersNet;
    return Math.round(grossUnit * quantity * 100) / 100;
  }

  return netLine;
};

export const getOrderItemModifierDisplayPrice = (
  modifierPrice: number,
  parentItem: OrderItem,
  showInclusive: boolean,
): number => {
  const net = safeNumber(modifierPrice);
  if (!shouldShowInclusiveItemPrice(parentItem, showInclusive)) {
    return net;
  }
  return inflateInclusiveUnitPrice(net, parentItem.taxes);
};
