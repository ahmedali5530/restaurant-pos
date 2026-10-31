import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  faCompress,
  faExpand,
  faMagnifyingGlassMinus,
  faMagnifyingGlassPlus,
  faMaximize,
} from "@fortawesome/free-solid-svg-icons";
import { Modal } from "@/components/common/react-aria/modal.tsx";
import { Input } from "@/components/common/input/input.tsx";
import { Button } from "@/components/common/input/button.tsx";
import { useDB } from "@/api/db/db.ts";
import { Tables } from "@/api/db/tables.ts";
import { Category } from "@/api/model/category.ts";
import { Dish } from "@/api/model/dish.ts";
import { DishModifierGroup } from "@/api/model/dish_modifier_group.ts";
import { useHqCatalogBranchContext } from "@/hooks/useHqCatalogBranchEdit.ts";
import { hqCatalogVisibilityClause } from "@/lib/catalog-row-scope.ts";
import {
  buildMenuTree,
  collectExpandableKeys,
  filterMenuTree,
  linkId,
  MenuTreeNode,
  MenuTreeSelectPayload,
} from "@/components/settings/menu_tree/build-menu-tree.ts";
import { MenuTreeCanvas } from "@/components/settings/menu_tree/menu-tree-canvas.tsx";

interface Props {
  open: boolean;
  onClose: () => void;
  /** Reserved for future edit wiring; currently a no-op when omitted. */
  onSelect?: (node: MenuTreeSelectPayload) => void;
}

function kindLabelFn(
  kind: MenuTreeNode["kind"],
  t: (key: string, opts?: { defaultValue?: string }) => string
): string {
  switch (kind) {
    case "category":
      return t("menuTree.kind.category", { defaultValue: "Category" });
    case "dish":
      return t("menuTree.kind.dish", { defaultValue: "Dish" });
    case "modifier_group":
      return t("menuTree.kind.modifierGroup", { defaultValue: "Modifier group" });
    case "modifier":
      return t("menuTree.kind.modifier", { defaultValue: "Modifier" });
    case "uncategorized":
      return t("menuTree.kind.uncategorized", { defaultValue: "Uncategorized" });
    default:
      return "";
  }
}

export const MenuTreeModal = ({ open, onClose, onSelect }: Props) => {
  const { t } = useTranslation(["admin", "common"]);
  const db = useDB();
  const { enabled: hqEnabled, branchIds } = useHqCatalogBranchContext();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [roots, setRoots] = useState<MenuTreeNode[]>([]);
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [fitToken, setFitToken] = useState(0);
  const [zoomInToken, setZoomInToken] = useState(0);
  const [zoomOutToken, setZoomOutToken] = useState(0);

  const uncategorizedLabel = t("menuTree.uncategorized", {
    defaultValue: "Uncategorized",
  });

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const visibility = hqEnabled
        ? hqCatalogVisibilityClause(branchIds)
        : null;
      const catWhere = visibility
        ? `deleted_at = none AND ${visibility.filter}`
        : "deleted_at = none";
      const dishWhere = visibility
        ? `deleted_at = none AND ${visibility.filter}`
        : "deleted_at = none";
      const params = visibility?.params ?? {};

      const [catResult, dishResult, edgeResult] = await Promise.all([
        db.query(
          `SELECT * FROM ${Tables.categories} WHERE ${catWhere} ORDER BY priority ASC`,
          params
        ),
        db.query(
          `SELECT * FROM ${Tables.dishes} WHERE ${dishWhere} ORDER BY priority ASC FETCH categories`,
          params
        ),
        db.query(
          `SELECT * FROM ${Tables.dish_modifier_groups} ORDER BY priority ASC FETCH in, out, out.modifiers, out.modifiers.modifier, out.modifiers.allowed_next_groups, out.modifiers.next_group_overrides`
        ),
      ]);

      const categories = (
        Array.isArray(catResult) ? catResult[0] : catResult
      ) as Category[];
      let dishes = (
        Array.isArray(dishResult) ? dishResult[0] : dishResult
      ) as Dish[];
      let edges = (
        Array.isArray(edgeResult) ? edgeResult[0] : edgeResult
      ) as DishModifierGroup[];

      dishes = Array.isArray(dishes) ? dishes : [];
      edges = Array.isArray(edges) ? edges : [];

      const dishIds = new Set(dishes.map((d) => linkId(d)));
      if (hqEnabled) {
        edges = edges.filter((e) => dishIds.has(linkId(e.in)));
      }

      const tree = buildMenuTree({
        categories: Array.isArray(categories) ? categories : [],
        dishes,
        edges,
        uncategorizedLabel,
      });
      setRoots(tree);
      setExpanded(new Set(collectExpandableKeys(tree)));
      setFitToken((n) => n + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setRoots([]);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- never put db in deps
  }, [hqEnabled, branchIds.join(","), uncategorizedLabel]);

  useEffect(() => {
    if (!open) return;
    setSearch("");
    void load();
  }, [open, load]);

  const filtered = useMemo(
    () => filterMenuTree(roots, search) ?? roots,
    [roots, search]
  );

  useEffect(() => {
    if (!roots.length) return;
    setExpanded(new Set(collectExpandableKeys(filtered)));
    setFitToken((n) => n + 1);
    // Re-fit when search changes or catalog reloads — not on node clicks
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, roots]);

  const expandAll = () => {
    setExpanded(new Set(collectExpandableKeys(filtered)));
  };

  const collapseAll = () => {
    setExpanded(new Set());
  };

  const handleSelect = useCallback(
    (payload: MenuTreeSelectPayload) => {
      onSelect?.(payload);
    },
    [onSelect]
  );

  const kindLabel = useCallback(
    (kind: MenuTreeNode["kind"]) => kindLabelFn(kind, t),
    [t]
  );

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t("menuTree.title", { defaultValue: "Menu tree" })}
      size="full"
      testId="menu-tree-modal"
    >
      <div className="flex flex-col gap-3 h-[calc(100vh-10rem)] min-h-[50vh]">
        <div className="flex flex-wrap items-end gap-3 shrink-0">
          <div className="flex-1 min-w-[12rem]">
            <Input
              label={t("menuTree.search", { defaultValue: "Search" })}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("menuTree.searchPlaceholder", {
                defaultValue: "Filter by name…",
              })}
              data-testid="menu-tree-search"
            />
          </div>
          <Button
            type="button"
            variant="secondary"
            icon={faExpand}
            onClick={expandAll}
            data-testid="menu-tree-expand-all"
          >
            {t("menuTree.expandAll", { defaultValue: "Expand all" })}
          </Button>
          <Button
            type="button"
            variant="secondary"
            icon={faCompress}
            onClick={collapseAll}
            data-testid="menu-tree-collapse-all"
          >
            {t("menuTree.collapseAll", { defaultValue: "Collapse all" })}
          </Button>
          <Button
            type="button"
            variant="secondary"
            icon={faMagnifyingGlassPlus}
            onClick={() => setZoomInToken((n) => n + 1)}
            data-testid="menu-tree-zoom-in"
          >
            {t("menuTree.zoomIn", { defaultValue: "Zoom in" })}
          </Button>
          <Button
            type="button"
            variant="secondary"
            icon={faMagnifyingGlassMinus}
            onClick={() => setZoomOutToken((n) => n + 1)}
            data-testid="menu-tree-zoom-out"
          >
            {t("menuTree.zoomOut", { defaultValue: "Zoom out" })}
          </Button>
          <Button
            type="button"
            variant="secondary"
            icon={faMaximize}
            onClick={() => setFitToken((n) => n + 1)}
            data-testid="menu-tree-fit"
          >
            {t("menuTree.fit", { defaultValue: "Fit to screen" })}
          </Button>
          <p className="w-full text-xs text-muted m-0">
            {t("menuTree.panHint", {
              defaultValue: "Drag to pan · scroll to zoom",
            })}
          </p>
        </div>

        {loading && (
          <div className="text-muted py-8 text-center">
            {t("menuTree.loading", { defaultValue: "Loading menu tree…" })}
          </div>
        )}

        {!loading && error && (
          <div className="text-danger py-8 text-center">{error}</div>
        )}

        {!loading && !error && filtered.length === 0 && (
          <div className="text-muted py-8 text-center">
            {t("menuTree.empty", { defaultValue: "No menu items to show." })}
          </div>
        )}

        {!loading && !error && filtered.length > 0 && (
          <div className="flex-1 min-h-0">
            <MenuTreeCanvas
              roots={filtered}
              expanded={expanded}
              onSelect={handleSelect}
              kindLabel={kindLabel}
              fitToken={fitToken}
              zoomInToken={zoomInToken}
              zoomOutToken={zoomOutToken}
            />
          </div>
        )}
      </div>
    </Modal>
  );
};
