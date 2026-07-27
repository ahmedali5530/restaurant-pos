import { useEffect, useState } from "react";
import { useDB } from "@/api/db/db.ts";
import { Tables } from "@/api/db/tables.ts";
import {
  CURRENCY_SYMBOL_KEY,
  CurrencySymbolSettings,
  DEFAULT_CURRENCY_SYMBOL,
} from "@/api/model/currency_symbol.ts";
import { setShowCurrencySymbolInUi } from "@/lib/currency-format.ts";

export type CurrencySymbolDb = {
  query: (sql: string, params?: Record<string, unknown>) => Promise<unknown[][]>;
};

export const fetchCurrencySymbolSettings = async (
  db: CurrencySymbolDb,
): Promise<CurrencySymbolSettings> => {
  const [rows] = await db.query(
    `SELECT * FROM ${Tables.settings} WHERE key = $key AND is_global = true LIMIT 1`,
    { key: CURRENCY_SYMBOL_KEY },
  );
  const row = Array.isArray(rows) ? rows[0] : undefined;
  const values = (row as { values?: Partial<CurrencySymbolSettings> } | undefined)?.values;
  return {
    ui: values?.ui ?? DEFAULT_CURRENCY_SYMBOL.ui,
    receipts: values?.receipts ?? DEFAULT_CURRENCY_SYMBOL.receipts,
  };
};

/** Loads the UI preference into the module cache used by `withCurrency`. */
export const useHydrateCurrencySymbol = () => {
  const db = useDB();

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const settings = await fetchCurrencySymbolSettings(db);
        if (!cancelled) {
          setShowCurrencySymbolInUi(settings.ui);
        }
      } catch {
        if (!cancelled) {
          setShowCurrencySymbolInUi(DEFAULT_CURRENCY_SYMBOL.ui);
        }
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, []);
};

export const useCurrencySymbol = () => {
  const db = useDB();
  const [settings, setSettings] = useState<CurrencySymbolSettings>(DEFAULT_CURRENCY_SYMBOL);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const value = await fetchCurrencySymbolSettings(db);
        if (!cancelled) {
          setSettings(value);
          setShowCurrencySymbolInUi(value.ui);
        }
      } catch {
        if (!cancelled) {
          setSettings(DEFAULT_CURRENCY_SYMBOL);
          setShowCurrencySymbolInUi(DEFAULT_CURRENCY_SYMBOL.ui);
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
