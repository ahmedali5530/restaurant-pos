import {describe, expect, it} from "vitest";
import {buildCustomerDisplaySnapshot} from "@/lib/customer-display.ts";
import type {MenuItem} from "@/api/model/cart_item.ts";
import {MenuItemType} from "@/api/model/cart_item.ts";

describe("buildCustomerDisplaySnapshot", () => {
  it("maps live cart lines and totals", () => {
    const cart = [
      {
        id: "a",
        quantity: 2,
        dish: {id: "menu_item:1", name: "Cola", price: 5},
        price: 5,
        newOrOld: MenuItemType.new,
        level: 0,
      },
      {
        id: "b",
        quantity: 1,
        dish: {id: "menu_item:2", name: "Bun", price: 3},
        price: 3,
        newOrOld: MenuItemType.new,
        level: 0,
        deleted_at: new Date(),
      },
    ] as unknown as MenuItem[];

    const snap = buildCustomerDisplaySnapshot(cart);
    expect(snap.lines).toHaveLength(1);
    expect(snap.lines[0].name).toBe("Cola");
    expect(snap.lines[0].quantity).toBe(2);
    expect(snap.lines[0].unitPrice).toBe(5);
    expect(snap.lines[0].lineTotal).toBe(10);
    expect(snap.lines[0].modifiers).toEqual([]);
    expect(snap.itemsBase).toBe(10);
    expect(snap.total).toBe(10);
    expect(snap.taxTotals).toEqual([]);
  });

  it("includes nested modifiers with depth and unit prices", () => {
    const cart = [
      {
        id: "burger",
        quantity: 2,
        dish: {id: "menu_item:1", name: "Burger", price: 10},
        price: 10,
        newOrOld: MenuItemType.new,
        level: 0,
        selectedGroups: [
          {
            out: {id: "group:1"},
            selectedModifiers: [
              {
                id: "mod-cheese",
                quantity: 1,
                dish: {id: "menu_item:2", name: "Cheese", price: 2},
                price: 2,
                level: 1,
                isModifier: true,
                newOrOld: MenuItemType.new,
                selectedGroups: [
                  {
                    out: {id: "group:2"},
                    selectedModifiers: [
                      {
                        id: "mod-extra",
                        quantity: 1,
                        dish: {id: "menu_item:3", name: "Extra melt", price: 1},
                        price: 1,
                        level: 2,
                        isModifier: true,
                        newOrOld: MenuItemType.new,
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
    ] as unknown as MenuItem[];

    const snap = buildCustomerDisplaySnapshot(cart);
    expect(snap.lines).toHaveLength(1);
    const line = snap.lines[0];
    // unit base = 10 + 2 + 1 = 13
    expect(line.unitPrice).toBe(13);
    expect(line.lineTotal).toBe(26);
    expect(line.modifiers).toEqual([
      {name: "Cheese", quantity: 1, unitPrice: 2, depth: 0},
      {name: "Extra melt", quantity: 1, unitPrice: 1, depth: 1},
    ]);
    expect(snap.itemsBase).toBe(26);
  });

  it("mirrors CartTotals tax-inclusive total from system taxes", () => {
    const cart = [
      {
        id: "a",
        quantity: 2,
        dish: {id: "menu_item:1", name: "Cola", price: 10},
        price: 10,
        newOrOld: MenuItemType.new,
        level: 0,
      },
    ] as unknown as MenuItem[];

    const snap = buildCustomerDisplaySnapshot(cart, {
      taxes: [{id: "tax:gst", name: "GST", rate: 10} as any],
    });

    // Base 20 + 10% = 22
    expect(snap.itemsBase).toBe(20);
    expect(snap.taxTotals).toHaveLength(1);
    expect(snap.taxTotals[0].name).toBe("GST");
    expect(snap.taxTotals[0].rate).toBe(10);
    expect(snap.taxTotals[0].taxAmount).toBe(2);
    expect(snap.taxTotals[0].total).toBe(22);
    expect(snap.total).toBe(22);
  });

  it("flags thank you when requested", () => {
    expect(buildCustomerDisplaySnapshot([], {thankYou: true}).thankYou).toBe(true);
  });

  it("includes order-attached tax, discount, service, tip, extras, and coupon in total", () => {
    const cart = [
      {
        id: "a",
        quantity: 1,
        dish: {id: "menu_item:1", name: "Cola", price: 100},
        price: 100,
        newOrOld: MenuItemType.new,
        level: 0,
      },
    ] as unknown as MenuItem[];

    const order = {
      id: "order:1",
      items: [],
      tax: {id: "tax:1", name: "VAT", rate: 10},
      tax_amount: 10,
      discount: {id: "discount:1", name: "Happy Hour", value_type: "percent", type: "percent"},
      discount_rate: 10,
      discount_amount: 10,
      service_charge: 5,
      service_charge_type: "percent",
      service_charge_amount: 5,
      tip: 10,
      tip_type: "percent",
      tip_amount: 10,
      extras: [{name: "Bag fee", value: 3}],
      coupon: {discount: 4, coupon: {name: "SAVE4"}},
    } as any;

    const snap = buildCustomerDisplaySnapshot(cart, {order});
    expect(snap.itemsBase).toBe(100);
    expect(snap.adjustments.map((a) => a.kind)).toEqual([
      "tax",
      "discount",
      "coupon",
      "service",
      "extra",
      "tip",
    ]);
    // 100 + 10 tax - 10 discount - 4 coupon + 5 service + 3 extra + 10 tip = 114
    expect(snap.total).toBe(114);
  });

  it("clears lines when cart is empty even if an order is still passed", () => {
    const order = {
      id: "order:1",
      items: [
        {
          id: "order_item:1",
          quantity: 1,
          price: 10,
          item: {id: "menu_item:1", name: "Burger", price: 10},
          modifiers: [],
        },
      ],
    } as any;

    const snap = buildCustomerDisplaySnapshot([], {order, thankYou: true});
    expect(snap.lines).toEqual([]);
    expect(snap.total).toBe(0);
    expect(snap.thankYou).toBe(true);
  });

  it("builds lines from order items when menu cart is empty (Orders → Pay Now)", () => {
    const order = {
      id: "order:1",
      items: [
        {
          id: "order_item:1",
          quantity: 2,
          price: 10,
          item: {id: "menu_item:1", name: "Burger", price: 10},
          modifiers: [
            {
              selectedModifiers: [
                {
                  id: "mod:1",
                  quantity: 1,
                  price: 2,
                  dish: {id: "menu_item:2", name: "Cheese", price: 2},
                  level: 1,
                },
              ],
            },
          ],
        },
      ],
      tax: {id: "tax:1", name: "VAT", rate: 10},
    } as any;

    const snap = buildCustomerDisplaySnapshot([], {
      order,
      paymentLive: {
        itemsTotal: 24,
        taxAmount: 2.4,
        taxName: "VAT",
        taxRate: 10,
        discountTotal: 0,
        couponAmount: 0,
        serviceChargeAmount: 0,
        tipAmount: 0,
        extras: [],
        total: 26.4,
      },
    });

    expect(snap.lines).toHaveLength(1);
    expect(snap.lines[0].name).toBe("Burger");
    expect(snap.lines[0].quantity).toBe(2);
    expect(snap.lines[0].unitPrice).toBe(12);
    expect(snap.lines[0].lineTotal).toBe(24);
    expect(snap.lines[0].modifiers).toEqual([
      {name: "Cheese", quantity: 1, unitPrice: 2, depth: 0},
    ]);
    expect(snap.itemsBase).toBe(24);
    expect(snap.total).toBe(26.4);
    expect(snap.adjustments.some((a) => a.kind === "tax")).toBe(true);
  });
});
