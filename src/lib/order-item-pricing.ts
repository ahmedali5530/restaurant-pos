import { CartModifierGroup, MenuItem } from '@/api/model/cart_item.ts';
import { TaxMode } from '@/api/model/menu.ts';
import { Tax } from '@/api/model/tax.ts';
import {
  calculateInclusiveBasePrice,
  calculateItemTax,
} from '@/lib/tax-calculator.ts';
import { safeNumber } from '@/lib/utils.ts';

export interface TaxContext {
  tax_mode: TaxMode;
  taxes: Tax[] | undefined | null;
}

export interface OrderItemPricingPayload {
  price: number;
  original_price?: number;
  tax_mode: TaxMode;
  taxes?: Tax[];
  tax: number;
  modifiers: CartModifierGroup[] | undefined;
}

const resolveCartTaxes = (item: MenuItem): Tax[] | undefined => {
  if (item.taxes && item.taxes.length > 0) {
    return item.taxes;
  }
  return undefined;
};

const resolveCartTaxMode = (item: MenuItem): TaxMode => {
  return item.tax_mode ?? item.dish?.tax_mode ?? 'exclusive';
};

/** Convert inclusive display price to net when menu taxes apply. */
export const normalizeUnitPrice = (
  displayPrice: number,
  taxMode: TaxMode,
  taxes: Tax[] | undefined | null,
): number => {
  const gross = safeNumber(displayPrice);
  if (taxMode === 'inclusive' && taxes && taxes.length > 0) {
    return calculateInclusiveBasePrice(gross, taxes);
  }
  return gross;
};

const normalizeMenuItemModifier = (
  modifier: MenuItem,
  parentTax: TaxContext,
): MenuItem => {
  const taxMode = modifier.tax_mode ?? parentTax.tax_mode;
  const taxes = resolveCartTaxes(modifier) ?? parentTax.taxes;
  const displayPrice = safeNumber(modifier.price ?? modifier.dish?.price ?? 0);
  const netPrice = normalizeUnitPrice(displayPrice, taxMode, taxes);

  return {
    ...modifier,
    price: netPrice,
    tax_mode: taxMode,
    taxes: taxes ?? undefined,
    selectedGroups: normalizeModifierTree(modifier.selectedGroups, {tax_mode: taxMode, taxes}),
  };
};

/** Deep-clone modifier groups with net prices for inclusive lines. */
export const normalizeModifierTree = (
  groups: CartModifierGroup[] | undefined,
  parentTax: TaxContext,
): CartModifierGroup[] | undefined => {
  if (!groups || groups.length === 0) {
    return groups;
  }

  return groups.map((group) => ({
    ...group,
    selectedModifiers: (group.selectedModifiers ?? []).map((modifier) =>
      normalizeMenuItemModifier(modifier, parentTax),
    ),
  }));
};

const sumNormalizedModifierTree = (groups: CartModifierGroup[] | undefined): number => {
  return (groups ?? []).reduce((groupTotal, group) => {
    return groupTotal + (group.selectedModifiers ?? []).reduce((modTotal, modifier) => {
      const modPrice = safeNumber(modifier.price ?? modifier.dish?.price ?? 0);
      return modTotal + modPrice + sumNormalizedModifierTree(modifier.selectedGroups);
    }, 0);
  }, 0);
};

const calculateStoredLineTax = (
  netUnitBase: number,
  quantity: number,
  taxMode: TaxMode,
  taxes: Tax[] | undefined,
): number => {
  if (taxMode !== 'inclusive' || !taxes || taxes.length === 0) {
    return 0;
  }

  const qty = safeNumber(quantity || 1);
  const perUnit = calculateItemTax(netUnitBase, taxes, 'exclusive');
  return Math.round(perUnit.total_tax * qty * 100) / 100;
};

/** Build persisted order_item pricing fields from a cart line. */
export const buildOrderItemPayload = (item: MenuItem): OrderItemPricingPayload => {
  const taxMode = resolveCartTaxMode(item);
  const taxes = resolveCartTaxes(item);
  const displayPrice = safeNumber(item.price ?? item.dish?.price ?? 0);
  const netPrice = normalizeUnitPrice(displayPrice, taxMode, taxes);
  const taxContext: TaxContext = {tax_mode: taxMode, taxes};
  const modifiers = normalizeModifierTree(item.selectedGroups, taxContext);
  const netUnitBase = netPrice + sumNormalizedModifierTree(modifiers);
  const lineTax = calculateStoredLineTax(netUnitBase, item.quantity, taxMode, taxes);

  return {
    price: netPrice,
    original_price: netPrice !== displayPrice ? displayPrice : undefined,
    tax_mode: taxMode,
    taxes,
    tax: lineTax,
    modifiers,
  };
};
