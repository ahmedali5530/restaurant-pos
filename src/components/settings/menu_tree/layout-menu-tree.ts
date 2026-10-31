import { MenuTreeNode } from "@/components/settings/menu_tree/build-menu-tree.ts";

export const MENU_TREE_NODE_WIDTH = 148;
export const MENU_TREE_NODE_HEIGHT = 52;
export const MENU_TREE_H_GAP = 28;
export const MENU_TREE_V_GAP = 80;

export interface LaidOutNode {
  key: string;
  node: MenuTreeNode;
  /** Center x of the node box */
  x: number;
  /** Top y of the node box */
  y: number;
  depth: number;
  /** True when the node has children in the source tree but they are collapsed */
  collapsed: boolean;
  children: LaidOutNode[];
}

export interface MenuTreeLayout {
  roots: LaidOutNode[];
  nodes: LaidOutNode[];
  links: Array<{ from: LaidOutNode; to: LaidOutNode }>;
  width: number;
  height: number;
}

function visibleChildren(
  node: MenuTreeNode,
  expanded: Set<string>
): MenuTreeNode[] {
  if (!node.children?.length) return [];
  if (!expanded.has(node.key)) return [];
  return node.children;
}

/**
 * Top-down tidy layout: leaves get sequential x slots; parents sit at the
 * midpoint of their visible children. Categories sit on the first row.
 */
export function layoutMenuTree(
  roots: MenuTreeNode[],
  expanded: Set<string>,
  options?: {
    nodeWidth?: number;
    nodeHeight?: number;
    hGap?: number;
    vGap?: number;
  }
): MenuTreeLayout {
  const nodeWidth = options?.nodeWidth ?? MENU_TREE_NODE_WIDTH;
  const nodeHeight = options?.nodeHeight ?? MENU_TREE_NODE_HEIGHT;
  const hGap = options?.hGap ?? MENU_TREE_H_GAP;
  const vGap = options?.vGap ?? MENU_TREE_V_GAP;
  const stride = nodeWidth + hGap;

  let nextLeaf = 0;

  const place = (node: MenuTreeNode, depth: number): LaidOutNode => {
    const kids = visibleChildren(node, expanded);
    const hasSourceChildren = (node.children?.length ?? 0) > 0;
    const laidChildren = kids.map((child) => place(child, depth + 1));

    let x: number;
    if (!laidChildren.length) {
      x = nextLeaf * stride + nodeWidth / 2;
      nextLeaf += 1;
    } else {
      const first = laidChildren[0].x;
      const last = laidChildren[laidChildren.length - 1].x;
      x = (first + last) / 2;
    }

    return {
      key: node.key,
      node,
      x,
      y: depth * (nodeHeight + vGap),
      depth,
      collapsed: hasSourceChildren && !expanded.has(node.key),
      children: laidChildren,
    };
  };

  const laidRoots = roots.map((r) => place(r, 0));
  const nodes: LaidOutNode[] = [];
  const links: MenuTreeLayout["links"] = [];

  const walk = (n: LaidOutNode) => {
    nodes.push(n);
    for (const child of n.children) {
      links.push({ from: n, to: child });
      walk(child);
    }
  };
  for (const r of laidRoots) walk(r);

  let minX = Infinity;
  let maxX = -Infinity;
  let maxY = 0;
  for (const n of nodes) {
    minX = Math.min(minX, n.x - nodeWidth / 2);
    maxX = Math.max(maxX, n.x + nodeWidth / 2);
    maxY = Math.max(maxY, n.y + nodeHeight);
  }

  if (!nodes.length) {
    return { roots: [], nodes: [], links: [], width: 0, height: 0 };
  }

  // Normalize so content starts at (0,0) with a small pad
  const pad = 24;
  const shiftX = pad - minX;
  for (const n of nodes) {
    n.x += shiftX;
  }

  return {
    roots: laidRoots,
    nodes,
    links,
    width: maxX - minX + pad * 2,
    height: maxY + pad,
  };
}

/** Expand only category / uncategorized roots so dishes appear under them. */
export function collectCategoryExpandKeys(nodes: MenuTreeNode[]): string[] {
  return nodes
    .filter(
      (n) =>
        (n.kind === "category" || n.kind === "uncategorized") &&
        (n.children?.length ?? 0) > 0
    )
    .map((n) => n.key);
}

/** Orthogonal connector path from parent bottom center to child top center. */
export function treeLinkPath(
  from: LaidOutNode,
  to: LaidOutNode,
  nodeHeight = MENU_TREE_NODE_HEIGHT
): string {
  const x1 = from.x;
  const y1 = from.y + nodeHeight;
  const x2 = to.x;
  const y2 = to.y;
  const midY = (y1 + y2) / 2;
  return `M ${x1} ${y1} L ${x1} ${midY} L ${x2} ${midY} L ${x2} ${y2}`;
}
