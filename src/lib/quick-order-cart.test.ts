import {describe, expect, it} from "vitest";
import {createQuickCartLine, mergeOrAppendCartLine} from "@/lib/quick-order-cart.ts";
import type {Dish} from "@/api/model/dish.ts";

const dish = (id: string, name: string): Dish =>
  ({id, name, number: id, price: 5}) as Dish;

describe("mergeOrAppendCartLine", () => {
  it("bumps quantity for the same plain dish", () => {
    const cola = dish("menu_item:1", "Cola");
    const first = [createQuickCartLine(cola)];
    const next = mergeOrAppendCartLine(first, cola);
    expect(next).toHaveLength(1);
    expect(next[0].quantity).toBe(2);
  });

  it("bumps by explicit quantity", () => {
    const cola = dish("menu_item:1", "Cola");
    const first = [createQuickCartLine(cola)];
    const next = mergeOrAppendCartLine(first, cola, {quantity: 6});
    expect(next).toHaveLength(1);
    expect(next[0].quantity).toBe(7);
  });

  it("creates a line with quantity when new", () => {
    const cola = dish("menu_item:1", "Cola");
    const next = mergeOrAppendCartLine([], cola, {quantity: 3});
    expect(next).toHaveLength(1);
    expect(next[0].quantity).toBe(3);
  });

  it("appends a new line for a different dish", () => {
    const cola = dish("menu_item:1", "Cola");
    const bun = dish("menu_item:2", "Bun");
    const next = mergeOrAppendCartLine([createQuickCartLine(cola)], bun);
    expect(next).toHaveLength(2);
    expect(next[0].dish.id).toBe("menu_item:2");
  });
});
