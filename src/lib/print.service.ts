import React from "react";
import { toast } from "sonner";
import i18n from "@/lib/i18n.ts";
import { Tables } from "@/api/db/tables.ts";
import type { Printer } from "@/api/model/printer.ts";
import {RecordId, StringRecordId} from "surrealdb";

export const PRINT_EVENT = 'posr:print';

export type PrintEventDetail<Payload = any> = {
  template: string;
  payload: Payload;
  title?: string;
  copies?: number;
};

export type PrintTemplateRenderer<Payload = any> = (payload: Payload) => React.ReactElement;

export type PrintDB = {
  query: (sql: string, params?: Record<string, unknown>) => Promise<unknown[][]>;
};

// Template (PRINT_TYPE) -> setting key for printer IDs
const PRINTER_SETTING_KEYS: Record<string, string> = {
  temp: 'temp_print_printers',
  final: 'final_print_printers',
  refund: 'refund_print_printers',
  delivery: 'delivery_print_printers',
  summary: 'summary_print_printers',
  kitchen: 'kitchen_print_printers',
  deletion: 'kitchen_print_printers',
};

// Template -> setting key for print config (AdminPrints: "Temp Print", etc.)
const PRINT_CONFIG_KEYS: Record<string, string> = {
  temp: 'Temp Print',
  final: 'Final Print',
  refund: 'Final Print',
  kitchen: 'Kitchen Print',
  deletion: 'Deletion Print',
  delivery: 'Delivery Print',
  summary: 'Summary Print',
};

const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: '$', PKR: 'Rs', EUR: '€', GBP: '£',
};

// Set VITE_PRINT_SERVER_URL in .env (e.g. http://localhost:3132) to override.
const DEFAULT_PRINT_URL = 'http://localhost:3132';

function toIdString(v: unknown): string {
  if (typeof v === 'string') return v;
  const o = v as { id?: string; toString?: () => string };
  if (o?.id != null) return String(o.id);
  if (typeof o?.toString === 'function') return o.toString();
  return String(v);
}

function logoToBase64(logo: unknown): string | undefined {
  if (logo == null) return undefined;
  if (typeof logo === 'string') return logo;
  let u8: Uint8Array;
  if (logo instanceof ArrayBuffer) u8 = new Uint8Array(logo);
  else if (logo instanceof Uint8Array) u8 = logo;
  else if (Array.isArray(logo)) u8 = new Uint8Array(logo);
  else return undefined;
  let b = '';
  const chunk = 8192;
  for (let i = 0; i < u8.length; i += chunk) {
    b += String.fromCharCode.apply(null, Array.from(u8.subarray(i, i + chunk)));
  }
  return `data:image/png;base64,${btoa(b)}`;
}

function printerToDriverConfig(p: Printer): { type: string; ip?: string; port?: number } {
  const type = String(p.type || 'network').toLowerCase();
  return {
    type,
    ip: p.ip_address,
    port: p.port,
  };
}

export async function getPrintConfig(db: PrintDB, template: string): Promise<Record<string, unknown>> {
  const key = PRINT_CONFIG_KEYS[template] || 'Final Print';
  const [res] = await db.query(
    `SELECT * FROM ${Tables.settings} WHERE key = $key AND is_global = true LIMIT 1`,
    { key }
  );
  const rows = Array.isArray(res) ? res : [];
  const row = rows[0] as { values?: Record<string, unknown> } | undefined;
  const values = row?.values ?? {};
  const logo = logoToBase64(values.logo);
  const currency = (import.meta.env.VITE_CURRENCY as string) || 'USD';
  const currencySymbol = CURRENCY_SYMBOLS[currency] || (import.meta.env.VITE_CURRENCY as string) || '$';
  return {
    ...values,
    logo: logo ?? values.logo,
    currencySymbol: (values.currencySymbol as string) ?? currencySymbol,
  };
}

export async function getPrintersForType(db: PrintDB, template: string, userId?: string | null): Promise<Printer[]> {
  const key = PRINTER_SETTING_KEYS[template];
  if (!key) return [];

  let row: { values?: unknown[] } | undefined;
  const uid = userId != null && userId !== '' ? new StringRecordId(toIdString(userId)) : null;
  console.log(uid)
  if (uid) {
    const [userRes] = await db.query(
      `SELECT * FROM ${Tables.settings} WHERE key = $key AND user = $uid LIMIT 1`,
      { key, uid }
    );

    const userRows = Array.isArray(userRes) ? userRes : [];
    row = userRows[0] as { values?: unknown[] } | undefined;
  }
  if (!row) {
    const [globalRes] = await db.query(
      `SELECT * FROM ${Tables.settings} WHERE key = $key AND is_global = true LIMIT 1`,
      { key }
    );
    const globalRows = Array.isArray(globalRes) ? globalRes : [];
    row = globalRows[0] as { values?: unknown[] } | undefined;
  }
  const ids = Array.isArray(row?.values)
    ? row.values.map((v) => v as any)
    : [];
  if (ids.length === 0) return [];

  const [printerRes] = await db.query(
    `SELECT * FROM ${Tables.printers} WHERE id IN $ids AND deleted_at = none`,
    { ids }
  );
  const printerRows = (Array.isArray(printerRes) ? printerRes : []) as Printer[];
  return printerRows.sort((a, b) => ids.indexOf(a.id.toString()) - ids.indexOf(b.id.toString()));
}

// Simple in-memory registry for print templates
const templateRegistry: Record<string, PrintTemplateRenderer<any>> = {};

export function registerPrintTemplate<Payload = any>(
  name: string,
  renderer: PrintTemplateRenderer<Payload>
): void {
  templateRegistry[name] = renderer as PrintTemplateRenderer<any>;
}

export function getPrintTemplate(name: string): PrintTemplateRenderer<any> | undefined {
  return templateRegistry[name];
}

export async function dispatchPrint<Payload = any>(
  db: any,
  template: string,
  payload: Payload,
  options?: {
    title?: string; copies?: number; userId?: string | { id?: string; toString?: () => string } | null,
    printers?: Printer[]
  }
): Promise<void> {
  const baseUrl = (import.meta.env.VITE_PRINT_SERVER_URL as string) || DEFAULT_PRINT_URL;
  const url = `${baseUrl.replace(/\/$/, '')}/print`;
  const uid = options?.userId != null ? toIdString(options.userId) : null;

  const explicitPrinters = options?.printers?.length > 0 ? options.printers : null;

  // eslint-disable-next-line prefer-const
  let [config, settingsPrinters] = await Promise.all([
    getPrintConfig(db, template),
    explicitPrinters ? Promise.resolve([]) : getPrintersForType(db, template, uid),
  ]);

  const printers = explicitPrinters || (settingsPrinters.length > 0 ? settingsPrinters : null);

  const driverPrinters = printers?.map(printerToDriverConfig);
  if (!driverPrinters || driverPrinters.length === 0) {
    console.error('No printers configured for this print type.');
    return;
  }

  const body = {
    data: { printType: template, ...payload },
    config : {
      ...config,
      decimal_place: import.meta.env.VITE_DECIMAL_PLACES
    },
    printers: driverPrinters,
  };

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text();
      let msg = text;
      try {
        const j = JSON.parse(text);
        msg = (j?.error as string) ?? text;
      } catch { /* ignore */ }
      toast.error(msg || i18n.t('common:toast.printFailed'));
      return;
    }
  } catch (e) {
    const msg = e && typeof e === 'object' && 'message' in e ? String((e as Error).message) : 'Print request failed';
    console.error(msg);
    toast.error(i18n.t('common:toast.printError'));
  }
}
