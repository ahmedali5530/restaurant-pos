import { Category } from "@/api/model/category.ts";
import { Dish } from "@/api/model/dish.ts";
import { DishModifierGroup } from "@/api/model/dish_modifier_group.ts";
import { Modifier } from "@/api/model/modifier.ts";
import { resolveAllowedNextGroupIds } from "@/lib/modifier-groups.ts";

export type MenuTreeNodeKind =
  | "category"
  | "dish"
  | "modifier_group"
  | "modifier"
  | "uncategorized";

export type MenuTreeSelectableKind =
  | "category"
  | "dish"
  | "modifier_group"
  | "modifier";

export interface MenuTreeSelectPayload {
  kind: MenuTreeSelectableKind;
  id: string;
  name: string;
}

export interface MenuTreeNode {
  key: string;
  kind: MenuTreeNodeKind;
  id?: string;
  name: string;
  price?: number;
  required?: boolean;
  /** Category with show_in_menu === false */
  hiddenFromMenu?: boolean;
  /** Modifier hidden via next_group_overrides */
  hidden?: boolean;
  selectable: boolean;
  children: MenuTreeNode[];
}

export interface BuildMenuTreeInput {
  categories: Category[];
  dishes: Dish[];
  edges: DishModifierGroup[];
  uncategorizedLabel?: string;
}

function idStr(id: unknown): string {
  if (id == null) return "";
  if (typeof id === "string") return id;
  if (typeof id === "object" && id !== null) {
    const value = id as { tb?: unknown; id?: unknown; toString?: () => string };
    // Surreal RecordId — prefer full table:id string
    if (value.tb != null && value.id != null) {
      return `${value.tb}:${String(value.id)}`;
    }
    if (typeof value.toString === "function") {
      const asString = value.toString();
      if (asString && asString !== "[object Object]") return asString;
    }
  }
  return String(id);
}

/** Resolve a record link or FETCHed row to a stable id string. */
export function linkId(link: unknown): string {
  if (link == null) return "";
  if (typeof link === "string") return link;
  if (typeof link === "object") {
    const value = link as { tb?: unknown; id?: unknown };
    if (value.tb != null && value.id != null) {
      return idStr(link);
    }
    if (value.id != null) return idStr(value.id);
  }
  return idStr(link);
}

function compareByPriorityThenName(
  a: { priority?: number; name?: string },
  b: { priority?: number; name?: string }
): number {
  const pa = Number(a.priority ?? 0);
  const pb = Number(b.priority ?? 0);
  if (pa !== pb) return pa - pb;
  return String(a.name ?? "").localeCompare(String(b.name ?? ""), undefined, {
    sensitivity: "base",
  });
}

function isDeleted(row: { deleted_at?: unknown } | null | undefined): boolean {
  return row?.deleted_at != null;
}

function pathKey(dishId: string, groupId: string): string {
  return `${dishId}|${groupId}`;
}

function findHiddenForModifier(
  parentModifier: Modifier | undefined,
  groupId: string,
  modifierId: string
): boolean {
  if (!parentModifier?.next_group_overrides?.length) return false;
  const entry = parentModifier.next_group_overrides.find(
    (o) => idStr(o.group_id) === groupId
  );
  if (!entry?.items?.length) return false;
  const item = entry.items.find(
    (i) => idStr(i.nested_modifier_id) === modifierId
  );
  return Boolean(item?.hidden);
}

function buildModifierNodes(
  modifiers: Modifier[] | undefined,
  dishId: string,
  groupId: string,
  groupEdgeKey: string,
  edgesByDishId: Map<string, DishModifierGroup[]>,
  path: Set<string>,
  parentModifier?: Modifier
): MenuTreeNode[] {
  if (!modifiers?.length) return [];

  const nodes: MenuTreeNode[] = [];

  for (const mod of modifiers) {
    const modDish = mod.modifier;
    if (!modDish || isDeleted(modDish as Dish)) continue;

    const modId = idStr(mod.id);
    const modDishId = idStr(modDish.id);
    const name = String(modDish.name ?? "");
    const hidden = findHiddenForModifier(parentModifier, groupId, modId);

    const nested = buildGroupNodesForDish(
      modDishId,
      edgesByDishId,
      path,
      resolveAllowedNextGroupIds(mod.allowed_next_groups),
      `${groupEdgeKey}/mod:${modId}`,
      mod
    );

    nodes.push({
      key: `${groupEdgeKey}/mod:${modId}`,
      kind: "modifier",
      id: modId,
      name,
      price: Number(mod.price ?? 0),
      hidden: hidden || undefined,
      selectable: true,
      children: nested,
    });
  }

  return nodes;
}

function buildGroupNodesForDish(
  dishId: string,
  edgesByDishId: Map<string, DishModifierGroup[]>,
  path: Set<string>,
  allowedNextGroupIds: string[] | undefined,
  keyPrefix: string,
  parentModifier?: Modifier
): MenuTreeNode[] {
  let edges = edgesByDishId.get(dishId) ?? [];

  if (allowedNextGroupIds !== undefined) {
    if (allowedNextGroupIds.length === 0) return [];
    const allowed = new Set(allowedNextGroupIds.map(String));
    edges = edges.filter((e) => allowed.has(idStr(e.out?.id)));
  }

  const nodes: MenuTreeNode[] = [];

  for (const edge of edges) {
    const group = edge.out;
    if (!group || isDeleted(group)) continue;

    const groupId = idStr(group.id);
    const cycleKey = pathKey(dishId, groupId);
    if (path.has(cycleKey)) continue;

    const nextPath = new Set(path);
    nextPath.add(cycleKey);

    const edgeKey = `${keyPrefix}/edge:${idStr(edge.id) || groupId}`;
    const children = buildModifierNodes(
      group.modifiers,
      dishId,
      groupId,
      edgeKey,
      edgesByDishId,
      nextPath,
      parentModifier
    );

    nodes.push({
      key: edgeKey,
      kind: "modifier_group",
      id: groupId,
      name: String(group.name ?? ""),
      required: Boolean(edge.has_required_modifiers),
      selectable: true,
      children,
    });
  }

  return nodes;
}

function buildDishNode(
  dish: Dish,
  edgesByDishId: Map<string, DishModifierGroup[]>,
  keyPrefix: string
): MenuTreeNode {
  const dishId = idStr(dish.id);
  return {
    key: `${keyPrefix}/dish:${dishId}`,
    kind: "dish",
    id: dishId,
    name: String(dish.name ?? ""),
    price: Number(dish.price ?? 0),
    selectable: true,
    children: buildGroupNodesForDish(
      dishId,
      edgesByDishId,
      new Set(),
      undefined,
      `${keyPrefix}/dish:${dishId}`
    ),
  };
}

/**
 * Build a category → dish → modifier group → modifier → nested group tree
 * from catalog rows. Pure function; no DB access.
 */
export function buildMenuTree(input: BuildMenuTreeInput): MenuTreeNode[] {
  const {
    categories,
    dishes,
    edges,
    uncategorizedLabel = "Uncategorized",
  } = input;

  const activeCategories = (categories ?? [])
    .filter((c) => !isDeleted(c))
    .slice()
    .sort(compareByPriorityThenName);

  const activeDishes = (dishes ?? []).filter((d) => !isDeleted(d));

  const edgesByDishId = new Map<string, DishModifierGroup[]>();
  for (const edge of edges ?? []) {
    const dishId = linkId(edge.in);
    if (!dishId) continue;
    if (edge.out && isDeleted(edge.out)) continue;
    const list = edgesByDishId.get(dishId) ?? [];
    list.push(edge);
    edgesByDishId.set(dishId, list);
  }
  for (const list of edgesByDishId.values()) {
    list.sort((a, b) => Number(a.priority ?? 0) - Number(b.priority ?? 0));
  }

  const dishesByCategoryId = new Map<string, Dish[]>();
  const uncategorized: Dish[] = [];

  for (const dish of activeDishes) {
    const cats = (dish.categories ?? []).filter((c) => c && !isDeleted(c));
    if (!cats.length) {
      uncategorized.push(dish);
      continue;
    }
    for (const cat of cats) {
      const cid = idStr(cat.id);
      const list = dishesByCategoryId.get(cid) ?? [];
      list.push(dish);
      dishesByCategoryId.set(cid, list);
    }
  }

  for (const list of dishesByCategoryId.values()) {
    list.sort(compareByPriorityThenName);
  }
  uncategorized.sort(compareByPriorityThenName);

  const roots: MenuTreeNode[] = [];

  for (const cat of activeCategories) {
    const catId = idStr(cat.id);
    const catDishes = dishesByCategoryId.get(catId) ?? [];
    roots.push({
      key: `cat:${catId}`,
      kind: "category",
      id: catId,
      name: String(cat.name ?? ""),
      hiddenFromMenu: cat.show_in_menu === false,
      selectable: true,
      children: catDishes.map((d) =>
        buildDishNode(d, edgesByDishId, `cat:${catId}`)
      ),
    });
  }

  if (uncategorized.length) {
    roots.push({
      key: "uncategorized",
      kind: "uncategorized",
      name: uncategorizedLabel,
      selectable: false,
      children: uncategorized.map((d) =>
        buildDishNode(d, edgesByDishId, "uncategorized")
      ),
    });
  }

  return roots;
}

/** Collect every expandable node key (nodes that have children). */
export function collectExpandableKeys(nodes: MenuTreeNode[]): string[] {
  const keys: string[] = [];
  const walk = (list: MenuTreeNode[]) => {
    for (const node of list) {
      if (node.children?.length) {
        keys.push(node.key);
        walk(node.children);
      }
    }
  };
  walk(nodes);
  return keys;
}

/**
 * Filter tree by case-insensitive name match. Keeps ancestors of matches.
 * Returns null when query is empty (caller should use the full tree).
 */
export function filterMenuTree(
  nodes: MenuTreeNode[],
  query: string
): MenuTreeNode[] | null {
  const q = query.trim().toLowerCase();
  if (!q) return null;

  const filterList = (list: MenuTreeNode[]): MenuTreeNode[] => {
    const out: MenuTreeNode[] = [];
    for (const node of list) {
      const selfMatch = String(node.name ?? "")
        .toLowerCase()
        .includes(q);
      const children = filterList(node.children ?? []);
      if (selfMatch || children.length) {
        out.push({
          ...node,
          children: selfMatch ? node.children : children,
        });
      }
    }
    return out;
  };

  return filterList(nodes);
}
