import { useEffect, useState } from "react";
import { useDB } from "@/api/db/db.ts";
import {
  DEFAULT_INVENTORY_SETTINGS,
  InventorySettings,
} from "@/api/model/inventory_settings.ts";
import { fetchInventorySettings } from "@/lib/inventory/settings.ts";

export const useInventorySettings = () => {
  const db = useDB();
  const [settings, setSettings] = useState<InventorySettings>(DEFAULT_INVENTORY_SETTINGS);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const value = await fetchInventorySettings(db);
        if (!cancelled) {
          setSettings(value);
        }
      } catch {
        if (!cancelled) {
          setSettings(DEFAULT_INVENTORY_SETTINGS);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, []);

  return { settings, loading };
};
