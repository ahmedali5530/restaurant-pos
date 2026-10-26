import {useCallback, useEffect, useState} from "react";
import {useDB} from "@/api/db/db.ts";
import type {InventoryUomRecord} from "@/api/model/inventory_uom.ts";
import {
  ensureInventoryUomCatalog,
  getInventoryUomCatalog,
  reloadInventoryUomCatalog,
} from "@/lib/inventory/uom.catalog.ts";

/**
 * Ensures the unit catalog is loaded from DB and exposes a refresh helper.
 * Never puts `db` in effect deps (project rule).
 */
export function useInventoryUomCatalog() {
  const db = useDB();
  const [units, setUnits] = useState<InventoryUomRecord[]>(() => getInventoryUomCatalog());
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const rows = await reloadInventoryUomCatalog(db);
      setUnits(rows);
    } catch {
      setUnits(getInventoryUomCatalog());
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const rows = await ensureInventoryUomCatalog(db);
        if (!cancelled) setUnits(rows);
      } catch {
        if (!cancelled) setUnits(getInventoryUomCatalog());
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return {units, loading, refresh, activeUnits: units.filter((u) => u.is_active)};
}
