import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import {RecordId, StringRecordId} from "surrealdb";

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

export const withCurrency = (amount: string | number | undefined) => {
  if (amount === undefined) {
    //just return currency symbol
    return (0)
      .toLocaleString(import.meta.env.VITE_LOCALE, {
        style: "currency",
        currency: import.meta.env.VITE_CURRENCY,
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
      })
      .replace(/\d/g, "")
      .trim();
  }

  return new Intl.NumberFormat(import.meta.env.VITE_LOCALE, {
    style: "currency",
    currency: import.meta.env.VITE_CURRENCY,
    maximumFractionDigits: DECIMAL_PLACES,
  }).format(Number(amount));
};

export const formatNumber = (amount: string | number) => {
  return new Intl.NumberFormat(import.meta.env.VITE_LOCALE, {
    maximumFractionDigits: DECIMAL_PLACES,
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