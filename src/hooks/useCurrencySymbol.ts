import { useEffect, useState } from "react";
import { useDB } from "@/api/db/db.ts";
import { Tables } from "@/api/db/tables.ts";
import {
  CURRENCY_SYMBOL_KEY,
  CurrencySymbolSettings,
  DEFAULT_CURRENCY_SYMBOL,
} from "@/api/model/currency_symbol.ts";
import { setShowCurrencySymbolInUi } from "@/lib/currency-format.ts";
import { APP_CURRENCIES, AppCurrencyCode, setAppCurrencyCode } from "@/lib/currency.ts";

export type CurrencySymbolDb = {
  query: (sql: string, params?: Record<string, unknown>) => Promise<unknown[][]>;
};

const resolveCode = (code?: string | null): AppCurrencyCode => {
  const upper = (code || "").toUpperCase();
  return APP_CURRENCIES.includes(upper as AppCurrencyCode)
    ? (upper as AppCurrencyCode)
    : (DEFAULT_CURRENCY_SYMBOL.code ?? "HTG");
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
    code: resolveCode(values?.code),
    ui: values?.ui ?? DEFAULT_CURRENCY_SYMBOL.ui,
    receipts: values?.receipts ?? DEFAULT_CURRENCY_SYMBOL.receipts,
  };
};

/** Loads currency prefs into the module caches used by `withCurrency`. */
export const useHydrateCurrencySymbol = () => {
  const db = useDB();

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const settings = await fetchCurrencySymbolSettings(db);
        if (!cancelled) {
          setAppCurrencyCode(settings.code);
          setShowCurrencySymbolInUi(settings.ui);
        }
      } catch {
        if (!cancelled) {
          setAppCurrencyCode(DEFAULT_CURRENCY_SYMBOL.code);
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
          setAppCurrencyCode(value.code);
          setShowCurrencySymbolInUi(value.ui);
        }
      } catch {
        if (!cancelled) {
          setSettings(DEFAULT_CURRENCY_SYMBOL);
          setAppCurrencyCode(DEFAULT_CURRENCY_SYMBOL.code);
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
