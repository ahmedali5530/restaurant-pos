import React from "react";
import { toast } from "sonner";
import { getDefaultStore } from "jotai";
import i18n from "@/lib/i18n.ts";
import { authHeaders } from "@/lib/session.ts";
import { Tables } from "@/api/db/tables.ts";
import type { Printer } from "@/api/model/printer.ts";
import {RecordId, StringRecordId} from "surrealdb";
import { fetchShowInclusivePricesEnabled } from "@/hooks/useShowInclusivePrices.ts";
import { fetchTranslateReceiptsEnabled } from "@/hooks/useTranslateReceipts.ts";
import { buildReceiptLabels } from "@/lib/receipt-labels.ts";
import { systemPrinterSettings, type SystemPrinterSettings } from "@/store/jotai.ts";


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
  pulse: 'final_print_printers',
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
  pulse: 'Final Print',
};

const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: '$', PKR: 'Rs', EUR: '€', GBP: '£',
};

// Set VITE_PRINT_SERVER_URL in .env (e.g. http://localhost:3132) to override.
const DEFAULT_PRINT_URL = 'http://localhost:3132';

function toIdString(v: unknown): string {
  if (v == null) return '';
  if (typeof v === 'string') return v;
  const o = v as { id?: unknown; tb?: string; toString?: () => string };
  if (typeof o?.toString === 'function') {
    const s = o.toString();
    if (typeof s === 'string' && s !== '[object Object]') return s;
  }
  if (typeof o?.tb === 'string' && o?.id != null) return `${o.tb}:${String(o.id)}`;
  if (o?.id != null) return String(o.id);
  return String(v);
}

function toPrinterQueryId(id: unknown): StringRecordId {
  const s = toIdString(id);
  if (s.includes(':')) return new StringRecordId(s);
  return new StringRecordId(`${Tables.printers}:${s}`);
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

function normalizeReceiptSections(sections: unknown): unknown[] {
  if (!Array.isArray(sections)) return [];
  return sections.map((section) => {
    if (!section || typeof section !== 'object') return section;
    const s = section as Record<string, unknown>;
    if (s.type !== 'image') return section;
    const image = logoToBase64(s.content);
    return {
      ...s,
      content: image ?? s.content,
    };
  });
}

function printerToDriverConfig(p: Printer): { type: string; ip?: string; port?: number, vid?: string, pid?: string } {
  const type = String(p.type || 'network').toLowerCase();
  return {
    type,
    ip: p.ip_address,
    port: p.port,
    vid: p?.vid,
    pid: p?.pid
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
    headerSections: normalizeReceiptSections(values.headerSections),
    footerSections: normalizeReceiptSections(values.footerSections),
    currencySymbol: (values.currencySymbol as string) ?? currencySymbol,
  };
}

function isBareRecordRef(value: unknown): boolean {
  if (value == null) return false;
  const s = typeof value === 'object' && value !== null && 'id' in value
    ? String((value as { id: unknown }).id)
    : String(value);
  return /^[a-zA-Z0-9_]+:[\w-]+$/.test(s) && !s.includes(' ');
}

function orderNeedsEnrichment(order: Record<string, unknown>): boolean {
  if (!order?.id) return false;
  if (isBareRecordRef(order.order_type)) return true;
  if (isBareRecordRef(order.user)) return true;
  return false;
}

async function enrichOrderForPrint(db: PrintDB, order: Record<string, unknown>): Promise<Record<string, unknown>> {
  if (!orderNeedsEnrichment(order)) return order;
  try {
    const [res] = await db.query(
      `SELECT * FROM $id FETCH order_type, user, table`,
      { id: order.id }
    );
    const rows = Array.isArray(res) ? res : [];
    const fetched = rows[0] as Record<string, unknown> | undefined;
    if (!fetched) return order;
    return {
      ...order,
      order_type: fetched.order_type ?? order.order_type,
      user: fetched.user ?? order.user,
      table: order.table ?? fetched.table,
    };
  } catch {
    return order;
  }
}

async function loadPrintersByIds(db: PrintDB, ids: unknown[]): Promise<Printer[]> {
  if (ids.length === 0) return [];
  const queryIds = ids.map((id) => toPrinterQueryId(id));
  const [printerRes] = await db.query(
    `SELECT * FROM ${Tables.printers} WHERE id IN $ids AND deleted_at = none`,
    { ids: queryIds }
  );
  const printerRows = (Array.isArray(printerRes) ? printerRes : []) as Printer[];
  const idStrings = ids.map((v) => toIdString(v));
  const keyOf = (s: string) => (s.includes(':') ? s.slice(s.indexOf(':') + 1) : s);
  return printerRows.sort((a, b) => {
    const ai = idStrings.findIndex((id) => keyOf(id) === keyOf(a.id.toString()) || id === a.id.toString());
    const bi = idStrings.findIndex((id) => keyOf(id) === keyOf(b.id.toString()) || id === b.id.toString());
    return ai - bi;
  });
}

const SYSTEM_PRINTER_KEYS: (keyof Omit<SystemPrinterSettings, 'useSystemPrinters'>)[] = [
  'temp_print_printers',
  'final_print_printers',
  'refund_print_printers',
  'summary_print_printers',
];

function isSystemPrinterKey(key: string): key is keyof Omit<SystemPrinterSettings, 'useSystemPrinters'> {
  return (SYSTEM_PRINTER_KEYS as string[]).includes(key);
}

export async function getPrintersForType(db: PrintDB, template: string, userId?: string | null): Promise<Printer[]> {
  const key = PRINTER_SETTING_KEYS[template];
  if (!key) return [];

  // Delivery always uses user/global DB settings (not terminal-scoped).
  if (template !== 'delivery' && isSystemPrinterKey(key)) {
    const system = getDefaultStore().get(systemPrinterSettings);
    if (system.useSystemPrinters) {
      const ids = Array.isArray(system[key]) ? system[key] : [];
      return loadPrintersByIds(db, ids);
    }
  }

  let row: { values?: unknown[] } | undefined;
  const uid = userId != null && userId !== '' ? new StringRecordId(toIdString(userId)) : null;

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
  return loadPrintersByIds(db, ids);
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
  let [config, settingsPrinters, showInclusivePrices, translateReceipts] = await Promise.all([
    getPrintConfig(db, template),
    explicitPrinters ? Promise.resolve([]) : getPrintersForType(db, template, uid),
    fetchShowInclusivePricesEnabled(db).catch(() => false),
    fetchTranslateReceiptsEnabled(db).catch(() => false),
  ]);

  const printers = explicitPrinters || (settingsPrinters.length > 0 ? settingsPrinters : null);

  const driverPrinters = printers?.map(printerToDriverConfig);
  if (!driverPrinters || driverPrinters.length === 0) {
    console.error('No printers configured for this print type.');
    return;
  }

  let printPayload = { ...(payload as Record<string, unknown>) };
  if (printPayload.order && (template === 'kitchen' || template === 'deletion')) {
    printPayload.order = await enrichOrderForPrint(db, printPayload.order as Record<string, unknown>);
  }

  const printConfig: Record<string, unknown> = {
    ...config,
    decimal_place: import.meta.env.VITE_DECIMAL_PLACES,
    showInclusivePrices,
  };

  if (translateReceipts) {
    await i18n.loadNamespaces(['receipts', 'summary']);
    printConfig.labels = buildReceiptLabels(i18n.t.bind(i18n));
    printConfig.locale = i18n.language;
  }

  const body = {
    data: { printType: template, ...printPayload },
    config: printConfig,
    printers: driverPrinters,
  };

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: authHeaders(),
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
