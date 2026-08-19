import {describe, expect, it} from "vitest";
import {collectOrderRefs} from "@/lib/ai/order-refs.ts";
import {resolveReceiptHref} from "@/lib/ai/order-receipt-links.tsx";
import {orderReceiptUrl} from "@/routes/posr.ts";

describe("collectOrderRefs", () => {
  it("collects refs from get_orders rows", () => {
    expect(collectOrderRefs([
      {
        name: "get_orders",
        result: {
          orders: [
            {orderId: "order:abc", invoiceNumber: 42},
            {orderId: "order:abc", invoiceNumber: 42},
            {orderId: "order:def", invoiceNumber: 7},
          ],
        },
      },
    ])).toEqual([
      {orderId: "order:abc", invoiceNumber: 42, autoId: undefined},
      {orderId: "order:def", invoiceNumber: 7, autoId: undefined},
    ]);
  });

  it("collects a ref from get_order_detail", () => {
    expect(collectOrderRefs([
      {
        name: "get_order_detail",
        result: {
          found: true,
          order: {id: "order:xyz", invoiceNumber: 15, autoId: 15},
        },
      },
    ])).toEqual([
      {orderId: "order:xyz", invoiceNumber: 15, autoId: 15},
    ]);
  });
});

describe("resolveReceiptHref", () => {
  const refs = [
    {orderId: "order:abc", invoiceNumber: 42, autoId: 9},
  ];

  it("matches identifier-shaped invoice, hash, record id, and labeled auto id", () => {
    expect(resolveReceiptHref("#42", refs)).toBe(orderReceiptUrl({id: "order:abc"}));
    expect(resolveReceiptHref("#42/1", refs)).toBe(orderReceiptUrl({id: "order:abc"}));
    expect(resolveReceiptHref("order:abc", refs)).toBe(orderReceiptUrl({id: "order:abc"}));
    expect(resolveReceiptHref("Invoice 42", refs)).toBe(orderReceiptUrl({id: "order:abc"}));
    expect(resolveReceiptHref("Order #9", refs)).toBe(orderReceiptUrl({id: "order:abc"}));
    expect(resolveReceiptHref("auto_id 9", refs)).toBe(orderReceiptUrl({id: "order:abc"}));
  });

  it("does not match bare counts such as quantity, covers, or totals", () => {
    expect(resolveReceiptHref("42", refs)).toBeNull();
    expect(resolveReceiptHref("9", refs)).toBeNull();
    expect(resolveReceiptHref("3", refs)).toBeNull();
    expect(resolveReceiptHref("2 items", refs)).toBeNull();
  });
});
