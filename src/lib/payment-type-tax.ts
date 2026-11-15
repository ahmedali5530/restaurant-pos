import type {MenuItem} from "@/api/model/cart_item.ts";
import type {PaymentType} from "@/api/model/payment_type.ts";
import type {Tax} from "@/api/model/tax.ts";
import {
  calculateCartTotalWithOrderTax,
} from "@/lib/tax-calculator.ts";

export const isTaxObject = (value: unknown): value is Tax => {
  return (
    !!value &&
    typeof value === "object" &&
    "id" in (value as object) &&
    "rate" in (value as object) &&
    typeof (value as Tax).name === "string"
  );
};

export const getPaymentTypeTax = (paymentType?: PaymentType | null): Tax | undefined => {
  return isTaxObject(paymentType?.tax) ? paymentType?.tax : undefined;
};

/** Highest-rate tax among candidates (same rule as payment receiving). */
export const pickHighestTax = (...candidates: Array<Tax | null | undefined>): Tax | undefined => {
  const taxes = candidates.filter((tax): tax is Tax => !!tax && typeof tax.rate === "number");
  if (!taxes.length) {
    return undefined;
  }
  return taxes.reduce((acc, tax) => (acc.rate >= tax.rate ? acc : tax));
};

/**
 * Tax to apply when selecting a payment type for a single-tender quick settle
 * (mirrors applyPaymentTypeTaxAndDiscount with no prior tenders).
 */
export const resolvePaymentTypeTax = (paymentType?: PaymentType | null): Tax | undefined => {
  return getPaymentTypeTax(paymentType);
};

/** Cart payable for quick checkout: items base + exclusive order tax from payment type. */
export const resolveQuickCheckoutPayable = (
  cart: MenuItem[] | null | undefined,
  paymentType?: PaymentType | null,
): number => {
  const live = (cart ?? []).filter((line) => !line.deleted_at);
  const tax = resolvePaymentTypeTax(paymentType);
  return calculateCartTotalWithOrderTax(live, tax ?? null);
};
