import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import {RecordId, StringRecordId} from "surrealdb";
import { getShowCurrencySymbolInUi } from "@/lib/currency-format.ts";

const DECIMAL_PLACES = import.meta.env.VITE_DECIMAL_PLACES;

type RecordIdInput = {
  id: unknown;
  tb: string;
};

export const safeNumber = (value: unknown, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && !isNaN(parsed) ? parsed : fallback;
};

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export const DENOMINATION_NOTES = [10, 20, 50, 100, 500, 1000, 5000];
export const DENOMINATION_COINS = [1, 2, 5];

// An invalid ISO 4217 code (bad data, a stale record from before a currency
// was validated, a manual DB edit) makes Intl.NumberFormat throw — and since
// this runs during render with no error boundary above it, that throw takes
// down the whole page. Cache validity per code so this doesn't re-construct
// a NumberFormat on every cell render just to check.
const currencyValidity = new Map<string, boolean>();
const isValidCurrencyCode = (code: string): boolean => {
  const cached = currencyValidity.get(code);
  if (cached !== undefined) return cached;
  let valid: boolean;
  try {
    new Intl.NumberFormat(undefined, {style: "currency", currency: code});
    valid = true;
  } catch {
    valid = false;
  }
  currencyValidity.set(code, valid);
  return valid;
};

// Almost everything in this app (orders, receipts, reports) is in the
// restaurant's single operating currency, so `currency` defaults to
// VITE_CURRENCY. Pass an override only where an amount was computed in a
// different currency on its own record — e.g. a payroll snapshot frozen from
// a pay profile explicitly set to a different currency than the store's.
export const withCurrency = (
  amount: string | number | undefined,
  decimalPlaces = DECIMAL_PLACES,
  currency: string = import.meta.env.VITE_CURRENCY,
) => {
  const showSymbol = getShowCurrencySymbolInUi();
  const requested = (currency || import.meta.env.VITE_CURRENCY || "USD").toUpperCase();
  // Fall back to a known-valid code. Falling back to VITE_CURRENCY would
  // re-select the invalid value that triggered the fallback in the first place,
  // and Intl.NumberFormat throws on an unknown currency.
  const safeCurrency = isValidCurrencyCode(requested) ? requested : "USD";

  if (amount === undefined) {
    if (!showSymbol) {
      return "";
    }
    //just return currency symbol
    return (0)
      .toLocaleString(import.meta.env.VITE_LOCALE, {
        style: "currency",
        currency: safeCurrency,
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
      })
      .replace(/\d/g, "")
      .trim();
  }

  if (!showSymbol) {
    return new Intl.NumberFormat(import.meta.env.VITE_LOCALE, {
      minimumFractionDigits: decimalPlaces,
      maximumFractionDigits: decimalPlaces,
    }).format(Number(amount));
  }

  return new Intl.NumberFormat(import.meta.env.VITE_LOCALE, {
    style: "currency",
    currency: safeCurrency,
    minimumFractionDigits: decimalPlaces,
    maximumFractionDigits: decimalPlaces,
  }).format(Number(amount));
};

export const formatNumber = (amount: string | number, decimalPlaces = DECIMAL_PLACES) => {
  return new Intl.NumberFormat(import.meta.env.VITE_LOCALE, {
    maximumFractionDigits: decimalPlaces,
    useGrouping: false
  }).format(Number(amount));
}

export const transformValue = {
  input: (value) =>
    value === null || isNaN(value) || value === 0 ? "" : value.toString(),
  output: (e) => {
    const output = parseInt(e.target.value);
    return isNaN(output) ? 0 : output;
  }
}

export const truthy = (value: any) => {
  return value === 'yes' || value === 1 || value === '1' || value === true || value === 'true';
}

export const toRecordId = (id: any): any => {
  if(id === undefined || id === null){
    return id;
  }

  if(typeof id === 'string'){
    return new StringRecordId(id);
  }

  if(typeof id === 'object' && 'id' in id && 'tb' in id){
    const recordId = id as RecordIdInput;
    return new RecordId(recordId.tb, recordId.id as any)
  }

  return id;
}