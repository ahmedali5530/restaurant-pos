import { describe, expect, it } from "vitest";
import { MenuTreeNode } from "@/components/settings/menu_tree/build-menu-tree.ts";
import {
  collectCategoryExpandKeys,
  layoutMenuTree,
  treeLinkPath,
} from "@/components/settings/menu_tree/layout-menu-tree.ts";

const node = (
  key: string,
  kind: MenuTreeNode["kind"],
  name: string,
  children: MenuTreeNode[] = []
): MenuTreeNode => ({
  key,
  kind,
  id: key,
  name,
  selectable: kind !== "uncategorized",
  children,
});

describe("layoutMenuTree", () => {
  it("places categories on the top row and dishes below", () => {
    const tree = [
      node("c1", "category", "Drinks", [
        node("d1", "dish", "Soda"),
        node("d2", "dish", "Juice"),
      ]),
      node("c2", "category", "Food", [node("d3", "dish", "Burger")]),
    ];
    const expanded = new Set(collectCategoryExpandKeys(tree));
    const layout = layoutMenuTree(tree, expanded);

    expect(layout.roots).toHaveLength(2);
    expect(layout.roots[0].y).toBe(0);
    expect(layout.roots[1].y).toBe(0);
    expect(layout.roots[0].children).toHaveLength(2);
    expect(layout.roots[0].children[0].y).toBeGreaterThan(0);
    expect(layout.links.length).toBe(3);
    expect(layout.width).toBeGreaterThan(0);
  });

  it("hides collapsed branches from the layout", () => {
    const tree = [
      node("c1", "category", "Drinks", [
        node("d1", "dish", "Soda", [
          node("g1", "modifier_group", "Size", [
            node("m1", "modifier", "Large"),
          ]),
        ]),
      ]),
    ];
    const expanded = new Set(["c1"]);
    const layout = layoutMenuTree(tree, expanded);
    expect(layout.nodes.map((n) => n.key)).toEqual(["c1", "d1"]);
    expect(layout.nodes.find((n) => n.key === "d1")?.collapsed).toBe(true);
  });

  it("builds an orthogonal link path", () => {
    const path = treeLinkPath(
      { key: "a", node: node("a", "category", "A"), x: 10, y: 0, depth: 0, collapsed: false, children: [] },
      { key: "b", node: node("b", "dish", "B"), x: 40, y: 100, depth: 1, collapsed: false, children: [] },
      52
    );
    expect(path).toContain("M 10 52");
    expect(path).toContain("L 40 100");
  });
});
