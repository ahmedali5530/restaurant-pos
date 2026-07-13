import { useEffect, useState } from "react";
import { useDB } from "@/api/db/db.ts";
import { Tables } from "@/api/db/tables.ts";
import {
  DEFAULT_SHOW_INCLUSIVE_PRICES,
  SHOW_INCLUSIVE_PRICES_KEY,
  ShowInclusivePricesSettings,
} from "@/api/model/show_inclusive_prices.ts";

export type ShowInclusivePricesDb = {
  query: (sql: string, params?: Record<string, unknown>) => Promise<unknown[][]>;
};

export const fetchShowInclusivePricesEnabled = async (
  db: ShowInclusivePricesDb,
): Promise<boolean> => {
  const [rows] = await db.query(
    `SELECT * FROM ${Tables.settings} WHERE key = $key AND is_global = true LIMIT 1`,
    { key: SHOW_INCLUSIVE_PRICES_KEY },
  );
  const row = Array.isArray(rows) ? rows[0] : undefined;
  const values = (row as { values?: ShowInclusivePricesSettings } | undefined)?.values;
  return Boolean(values?.enabled ?? DEFAULT_SHOW_INCLUSIVE_PRICES.enabled);
};

export const useShowInclusivePrices = () => {
  const db = useDB();
  const [enabled, setEnabled] = useState(DEFAULT_SHOW_INCLUSIVE_PRICES.enabled);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const value = await fetchShowInclusivePricesEnabled(db);
        if (!cancelled) {
          setEnabled(value);
        }
      } catch {
        if (!cancelled) {
          setEnabled(DEFAULT_SHOW_INCLUSIVE_PRICES.enabled);
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

  return { enabled, loading };
};
