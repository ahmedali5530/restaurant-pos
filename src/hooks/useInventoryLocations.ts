import { useCallback, useEffect, useState } from "react";
import { useDB } from "@/api/db/db.ts";
import {
  listInventoryLocations,
  toLocationOptions,
} from "@/lib/inventory/location.service.ts";

/**
 * Active inventory locations for pickers (value = location id).
 * Never put `db` in deps.
 */
export const useInventoryLocations = (
  enabled = true,
  options?: { types?: string[]; sync?: boolean }
) => {
  const db = useDB();
  const [locations, setLocations] = useState<
    Array<{ label: string; value: string }>
  >([]);
  const [loading, setLoading] = useState(false);

  const reload = useCallback(async () => {
    if (!enabled) return;
    setLoading(true);
    try {
      const rows = await listInventoryLocations(db, {
        activeOnly: true,
        types: options?.types,
        sync: options?.sync,
      });
      setLocations(toLocationOptions(rows));
    } catch (error) {
      console.error("Failed to load inventory locations", error);
      setLocations([]);
    } finally {
      setLoading(false);
    }
  }, [enabled, options?.types?.join(","), options?.sync]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { locations, options: locations, loading, reload };
};

/** @deprecated Use useInventoryLocations — same options (location ids). */
export const useStoreLocations = (enabled = true) => {
  const { locations, loading, reload } = useInventoryLocations(enabled);
  return {
    options: locations,
    storeLocations: locations,
    loading,
    reload,
  };
};
