import { describe, expect, it } from "vitest";
import {
  buildMenuTree,
  collectExpandableKeys,
  filterMenuTree,
} from "@/components/settings/menu_tree/build-menu-tree.ts";
import { Category } from "@/api/model/category.ts";
import { Dish } from "@/api/model/dish.ts";
import { DishModifierGroup } from "@/api/model/dish_modifier_group.ts";
import { Modifier } from "@/api/model/modifier.ts";
import { ModifierGroup } from "@/api/model/modifier_group.ts";

const cat = (id: string, name: string, extra?: Partial<Category>): Category =>
  ({ id, name, priority: 0, ...extra }) as Category;

const dish = (
  id: string,
  name: string,
  categories: Category[] = [],
  extra?: Partial<Dish>
): Dish =>
  ({
    id,
    name,
    number: id,
    price: 10,
    priority: 0,
    categories,
    ...extra,
  }) as Dish;

const group = (
  id: string,
  name: string,
  modifiers: Modifier[] = []
): ModifierGroup =>
  ({ id, name, priority: 0, modifiers }) as ModifierGroup;

const mod = (
  id: string,
  dishRef: Dish,
  price: number,
  extra?: Partial<Modifier>
): Modifier =>
  ({
    id,
    modifier: dishRef,
    price,
    ...extra,
  }) as Modifier;

const edge = (
  id: string,
  inDish: Dish,
  out: ModifierGroup,
  priority = 0,
  extra?: Partial<DishModifierGroup>
): DishModifierGroup =>
  ({
    id,
    in: inDish,
    out,
    priority,
    ...extra,
  }) as DishModifierGroup;

describe("buildMenuTree", () => {
  it("places a dish under every category it belongs to", () => {
    const drinks = cat("category:drinks", "Drinks");
    const food = cat("category:food", "Food");
    const soda = dish("menu_item:soda", "Soda", [drinks, food]);

    const tree = buildMenuTree({
      categories: [drinks, food],
      dishes: [soda],
      edges: [],
    });

    expect(tree).toHaveLength(2);
    expect(tree[0].name).toBe("Drinks");
    expect(tree[0].children).toHaveLength(1);
    expect(tree[0].children[0].name).toBe("Soda");
    expect(tree[0].children[0].kind).toBe("dish");
    expect(tree[0].children[0].id).toBe("menu_item:soda");
    expect(tree[1].name).toBe("Food");
    expect(tree[1].children[0].name).toBe("Soda");
  });

  it("puts dishes without categories under Uncategorized", () => {
    const lone = dish("menu_item:lone", "Lone");
    const tree = buildMenuTree({
      categories: [],
      dishes: [lone],
      edges: [],
      uncategorizedLabel: "Uncategorized",
    });

    expect(tree).toHaveLength(1);
    expect(tree[0].kind).toBe("uncategorized");
    expect(tree[0].selectable).toBe(false);
    expect(tree[0].children[0].name).toBe("Lone");
  });

  it("nests modifier groups under dishes and modifiers under groups", () => {
    const pizzaCat = cat("category:pizza", "Pizza");
    const pizza = dish("menu_item:pizza", "Pizza", [pizzaCat]);
    const sizeLg = dish("menu_item:lg", "Large");
    const sizeGroup = group("modifier_group:size", "Size", [
      mod("modifier:lg", sizeLg, 2),
    ]);

    const tree = buildMenuTree({
      categories: [pizzaCat],
      dishes: [pizza, sizeLg],
      edges: [edge("edge:1", pizza, sizeGroup, 1, { has_required_modifiers: true })],
    });

    const dishNode = tree[0].children[0];
    expect(dishNode.children).toHaveLength(1);
    expect(dishNode.children[0].kind).toBe("modifier_group");
    expect(dishNode.children[0].name).toBe("Size");
    expect(dishNode.children[0].required).toBe(true);
    expect(dishNode.children[0].children[0].kind).toBe("modifier");
    expect(dishNode.children[0].children[0].name).toBe("Large");
    expect(dishNode.children[0].children[0].price).toBe(2);
  });

  it("shows nested groups when allowed_next_groups lists them", () => {
    const cat1 = cat("category:c", "C");
    const burger = dish("menu_item:burger", "Burger", [cat1]);
    const cheese = dish("menu_item:cheese", "Add cheese");
    const cheddar = dish("menu_item:cheddar", "Cheddar");

    const cheeseStyle = group("modifier_group:style", "Cheese style", [
      mod("modifier:cheddar", cheddar, 1),
    ]);
    const toppings = group("modifier_group:toppings", "Toppings", [
      mod("modifier:cheese", cheese, 1.5, {
        allowed_next_groups: [{ id: "modifier_group:style" }] as any,
      }),
    ]);

    const tree = buildMenuTree({
      categories: [cat1],
      dishes: [burger, cheese, cheddar],
      edges: [
        edge("edge:top", burger, toppings, 0),
        edge("edge:style", cheese, cheeseStyle, 0),
      ],
    });

    const cheeseMod = tree[0].children[0].children[0].children[0];
    expect(cheeseMod.name).toBe("Add cheese");
    expect(cheeseMod.children).toHaveLength(1);
    expect(cheeseMod.children[0].name).toBe("Cheese style");
    expect(cheeseMod.children[0].children[0].name).toBe("Cheddar");
  });

  it("opens no nested groups when allowed_next_groups is empty", () => {
    const cat1 = cat("category:c", "C");
    const burger = dish("menu_item:burger", "Burger", [cat1]);
    const cheese = dish("menu_item:cheese", "Add cheese");
    const cheddar = dish("menu_item:cheddar", "Cheddar");

    const cheeseStyle = group("modifier_group:style", "Cheese style", [
      mod("modifier:cheddar", cheddar, 1),
    ]);
    const toppings = group("modifier_group:toppings", "Toppings", [
      mod("modifier:cheese", cheese, 1.5, {
        allowed_next_groups: [],
      }),
    ]);

    const tree = buildMenuTree({
      categories: [cat1],
      dishes: [burger, cheese, cheddar],
      edges: [
        edge("edge:top", burger, toppings, 0),
        edge("edge:style", cheese, cheeseStyle, 0),
      ],
    });

    const cheeseMod = tree[0].children[0].children[0].children[0];
    expect(cheeseMod.children).toHaveLength(0);
  });

  it("opens all attachable groups when allowed_next_groups is unset", () => {
    const cat1 = cat("category:c", "C");
    const burger = dish("menu_item:burger", "Burger", [cat1]);
    const cheese = dish("menu_item:cheese", "Add cheese");
    const cheddar = dish("menu_item:cheddar", "Cheddar");

    const cheeseStyle = group("modifier_group:style", "Cheese style", [
      mod("modifier:cheddar", cheddar, 1),
    ]);
    const toppings = group("modifier_group:toppings", "Toppings", [
      mod("modifier:cheese", cheese, 1.5),
    ]);

    const tree = buildMenuTree({
      categories: [cat1],
      dishes: [burger, cheese, cheddar],
      edges: [
        edge("edge:top", burger, toppings, 0),
        edge("edge:style", cheese, cheeseStyle, 0),
      ],
    });

    const cheeseMod = tree[0].children[0].children[0].children[0];
    expect(cheeseMod.children).toHaveLength(1);
    expect(cheeseMod.children[0].name).toBe("Cheese style");
  });

  it("stops recursion when a dish/group pair repeats on the path", () => {
    const cat1 = cat("category:c", "C");
    const a = dish("menu_item:a", "A", [cat1]);
    const b = dish("menu_item:b", "B");

    const groupB = group("modifier_group:gb", "Group B", [
      mod("modifier:to-a", a, 0),
    ]);
    const groupA = group("modifier_group:ga", "Group A", [
      mod("modifier:to-b", b, 0, {
        allowed_next_groups: [{ id: "modifier_group:gb" }] as any,
      }),
    ]);

    // A → Group A → B → Group B → A → Group A (would cycle)
    // Also attach Group A to A so the cycle can start
    const tree = buildMenuTree({
      categories: [cat1],
      dishes: [a, b],
      edges: [
        edge("edge:a-ga", a, groupA, 0),
        edge("edge:b-gb", b, groupB, 0),
        // A also has Group A attachable when reached via B→A (same pair)
        // The cycle: A|ga already on path when we try again
      ],
    });

    // Walk: A → Group A → B → Group B → A → (Group A skipped as cycle)
    const groupANode = tree[0].children[0].children[0];
    expect(groupANode.name).toBe("Group A");
    const modToB = groupANode.children[0];
    expect(modToB.name).toBe("B");
    const groupBNode = modToB.children[0];
    expect(groupBNode.name).toBe("Group B");
    const modToA = groupBNode.children[0];
    expect(modToA.name).toBe("A");
    // Cycle: A|ga already visited — no nested Group A again
    expect(modToA.children).toHaveLength(0);
  });

  it("marks modifiers hidden via next_group_overrides", () => {
    const cat1 = cat("category:c", "C");
    const burger = dish("menu_item:burger", "Burger", [cat1]);
    const cheese = dish("menu_item:cheese", "Add cheese");
    const cheddar = dish("menu_item:cheddar", "Cheddar");

    const cheeseStyle = group("modifier_group:style", "Cheese style", [
      mod("modifier:cheddar", cheddar, 1),
    ]);
    const toppings = group("modifier_group:toppings", "Toppings", [
      mod("modifier:cheese", cheese, 1.5, {
        allowed_next_groups: [{ id: "modifier_group:style" }] as any,
        next_group_overrides: [
          {
            group_id: "modifier_group:style",
            items: [
              {
                nested_modifier_id: "modifier:cheddar",
                price: 1,
                hidden: true,
              },
            ],
          },
        ],
      }),
    ]);

    const tree = buildMenuTree({
      categories: [cat1],
      dishes: [burger, cheese, cheddar],
      edges: [
        edge("edge:top", burger, toppings, 0),
        edge("edge:style", cheese, cheeseStyle, 0),
      ],
    });

    const cheddarNode =
      tree[0].children[0].children[0].children[0].children[0].children[0];
    expect(cheddarNode.name).toBe("Cheddar");
    expect(cheddarNode.hidden).toBe(true);
  });

  it("labels categories with show_in_menu false", () => {
    const hidden = cat("category:h", "Hidden", { show_in_menu: false });
    const tree = buildMenuTree({
      categories: [hidden],
      dishes: [],
      edges: [],
    });
    expect(tree[0].hiddenFromMenu).toBe(true);
  });
});

describe("filterMenuTree / collectExpandableKeys", () => {
  it("keeps ancestors of name matches", () => {
    const drinks = cat("category:drinks", "Drinks");
    const soda = dish("menu_item:soda", "Cola Soda", [drinks]);
    const tree = buildMenuTree({
      categories: [drinks],
      dishes: [soda],
      edges: [],
    });

    const filtered = filterMenuTree(tree, "cola");
    expect(filtered).not.toBeNull();
    expect(filtered![0].name).toBe("Drinks");
    expect(filtered![0].children[0].name).toBe("Cola Soda");
    expect(filterMenuTree(tree, "")).toBeNull();
  });

  it("collects expandable keys", () => {
    const drinks = cat("category:drinks", "Drinks");
    const soda = dish("menu_item:soda", "Soda", [drinks]);
    const tree = buildMenuTree({
      categories: [drinks],
      dishes: [soda],
      edges: [],
    });
    const keys = collectExpandableKeys(tree);
    expect(keys).toContain("cat:category:drinks");
  });
});
