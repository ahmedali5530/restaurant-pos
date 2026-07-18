import type { useDB } from "@/api/db/db.ts";
import { Tables } from "@/api/db/tables.ts";
import {
  DEFAULT_INVENTORY_SETTINGS,
  INVENTORY_SETTINGS_KEY,
  InventorySettings,
} from "@/api/model/inventory_settings.ts";

type DatabaseClient = {
  query: (sql: string, params?: Record<string, unknown>) => Promise<unknown[][]>;
};

export const fetchInventorySettings = async (
  db: DatabaseClient
): Promise<InventorySettings> => {
  const [rows] = await db.query(
    `SELECT * FROM ${Tables.settings} WHERE key = $key AND is_global = true LIMIT 1`,
    { key: INVENTORY_SETTINGS_KEY }
  );
  const row = Array.isArray(rows) ? rows[0] : undefined;
  const values = (row as { values?: Partial<InventorySettings> } | undefined)?.values;
  return {
    ...DEFAULT_INVENTORY_SETTINGS,
    ...(values ?? {}),
  };
};

export const isInventoryLedgerEnabled = async (
  db: DatabaseClient
): Promise<boolean> => {
  const settings = await fetchInventorySettings(db);
  return Boolean(settings.inventory_ledger_enabled);
};

export type InventorySettingsDb = ReturnType<typeof useDB>;
