import { useEffect, useState } from "react";
import { useDB } from "@/api/db/db.ts";
import { Tables } from "@/api/db/tables.ts";
import {
  DEFAULT_TRANSLATE_RECEIPTS,
  TRANSLATE_RECEIPTS_KEY,
  TranslateReceiptsSettings,
} from "@/api/model/translate_receipts.ts";

export type TranslateReceiptsDb = {
  query: (sql: string, params?: Record<string, unknown>) => Promise<unknown[][]>;
};

export const fetchTranslateReceiptsEnabled = async (
  db: TranslateReceiptsDb,
): Promise<boolean> => {
  const [rows] = await db.query(
    `SELECT * FROM ${Tables.settings} WHERE key = $key AND is_global = true LIMIT 1`,
    { key: TRANSLATE_RECEIPTS_KEY },
  );
  const row = Array.isArray(rows) ? rows[0] : undefined;
  const values = (row as { values?: TranslateReceiptsSettings } | undefined)?.values;
  return Boolean(values?.enabled ?? DEFAULT_TRANSLATE_RECEIPTS.enabled);
};

export const useTranslateReceipts = () => {
  const db = useDB();
  const [enabled, setEnabled] = useState(DEFAULT_TRANSLATE_RECEIPTS.enabled);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const value = await fetchTranslateReceiptsEnabled(db);
        if (!cancelled) {
          setEnabled(value);
        }
      } catch {
        if (!cancelled) {
          setEnabled(DEFAULT_TRANSLATE_RECEIPTS.enabled);
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
