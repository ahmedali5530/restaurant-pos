import {describe, expect, it} from "vitest";
import {
  getPaymentTypeTax,
  pickHighestTax,
  resolveQuickCheckoutPayable,
} from "@/lib/payment-type-tax.ts";
import {MenuItemType} from "@/api/model/cart_item.ts";

describe("payment-type-tax", () => {
  it("reads tax from a payment type", () => {
    expect(
      getPaymentTypeTax({
        id: "payment_type:cash",
        name: "Cash",
        type: "Cash",
        has_discount: false,
        tax: {id: "tax:gst", name: "GST", rate: 10} as any,
      } as any)?.rate,
    ).toBe(10);
    expect(getPaymentTypeTax({id: "x", name: "Card", type: "Card", has_discount: false} as any)).toBeUndefined();
  });

  it("picks the highest rate", () => {
    const a = {id: "tax:a", name: "A", rate: 5} as any;
    const b = {id: "tax:b", name: "B", rate: 12} as any;
    expect(pickHighestTax(a, b)?.id).toBe("tax:b");
  });

  it("computes cart payable with payment-type tax", () => {
    const cart = [
      {
        id: "a",
        quantity: 2,
        price: 10,
        dish: {id: "menu_item:1", name: "Cola", price: 10},
        newOrOld: MenuItemType.new,
        level: 0,
      },
    ] as any;
    const pt = {
      id: "payment_type:cash",
      name: "Cash",
      type: "Cash",
      has_discount: false,
      tax: {id: "tax:gst", name: "GST", rate: 10},
    } as any;
    // Base 20 + 10% = 22
    expect(resolveQuickCheckoutPayable(cart, pt)).toBe(22);
    expect(resolveQuickCheckoutPayable(cart, null)).toBe(20);
  });
});
