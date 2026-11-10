import {describe, expect, it, vi} from "vitest";
import {
  getCouponDetail,
  getRoleDetail,
  getTipDistribution,
  listDishModifiers,
} from "@/api/reports/manage/details.ts";

const mockDb = (rowsByCall: unknown[][]) => {
  let call = 0;
  return {
    query: vi.fn(async () => {
      const rows = rowsByCall[call] ?? [];
      call += 1;
      return [rows];
    }),
  };
};

describe("manage detail mappers", () => {
  it("maps role modules from roles field", async () => {
    const db = mockDb([
      [{id: "user_role:1", name: "Manager", roles: ["admin.dishes", "admin.tables"]}],
    ]);
    const result = await getRoleDetail(db as any, {name: "Manager"});
    expect(result).toEqual([
      {
        id: "user_role:1",
        name: "Manager",
        modules: ["admin.dishes", "admin.tables"],
        module_count: 2,
      },
    ]);
  });

  it("maps coupon targets from fetched categories/items", async () => {
    const db = mockDb([
      [{
        id: "coupon:1",
        code: "SAVE10",
        description: "Ten off",
        coupon_type: "discount",
        discount_type: "Percent",
        discount_value: 10,
        categories: [{name: "Pizzas"}],
        items: [{name: "Margherita"}],
        valid_days: ["Mon"],
        stackable: true,
        first_order_only: false,
        is_active: true,
        priority: 1,
      }],
    ]);
    const result = await getCouponDetail(db as any, {code: "SAVE10"});
    expect(result[0].category_names).toEqual(["Pizzas"]);
    expect(result[0].item_names).toEqual(["Margherita"]);
    expect(result[0].discount_value).toBe(10);
  });

  it("maps dish modifier edges", async () => {
    const db = mockDb([
      [{
        id: "menu_item_modifier_group:1",
        in: {id: "menu_item:1", name: "Margherita", number: "101"},
        out: {id: "modifier_group:1", name: "Sizes"},
        has_required_modifiers: true,
        required_modifiers: 1,
        should_auto_open: true,
        should_auto_select: false,
        priority: 0,
      }],
    ]);
    const result = await listDishModifiers(db as any, {dish_name: "Margherita"});
    expect(result[0]).toMatchObject({
      dish_name: "Margherita",
      modifier_group: "Sizes",
      has_required_modifiers: true,
      required_modifiers: 1,
    });
  });

  it("resolves tip distribution role and user labels", async () => {
    const db = mockDb([
      [{values: {roles: [{role_id: "user_role:1", weight: 2}], users: [{user_id: "user:1", weight: 1}]}}],
      [{id: "user_role:1", name: "Manager"}],
      [{id: "user:1", name: "John"}],
      [{id: "user:1", login: "1234", first_name: "John", last_name: "Doe"}],
    ]);
    const result = await getTipDistribution(db as any);
    expect(result.roles[0]).toEqual({role_id: "user_role:1", role_name: "Manager", weight: 2});
    expect(result.users[0]).toEqual({user_id: "user:1", user_login: "1234", weight: 1});
  });
});
