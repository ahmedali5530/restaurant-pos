import {Tables} from "@/api/db/tables.ts";
import {recordIdToString} from "@/api/reports/shared/records.ts";
import {unwrapQueryResult} from "@/api/reports/shared/query.ts";
import type {DbClient} from "@/api/reports/shared/types.ts";
import {formatDateTime} from "@/lib/datetime.ts";

/**
 * Tables with CHANGEFEED enabled (FOH sync + Manage catalog).
 * SHOW CHANGES is heavy and retention-bound (~14d) — still only loaded on demand.
 */
export const CHANGEFEED_ALLOWLIST = [
  // FOH / sales sync
  Tables.orders,
  Tables.order_items,
  Tables.order_items_kitchen,
  Tables.order_payment,
  Tables.order_taxes,
  Tables.order_discounts,
  Tables.order_coupons,
  Tables.coupon_redemptions,
  Tables.order_voids,
  Tables.order_refunds,
  Tables.order_split,
  Tables.order_merge,
  Tables.order_prints,
  Tables.order_extras,
  Tables.order_meta,
  Tables.closings,
  Tables.shifts,
  Tables.time_entries,
  Tables.tip_distributions,
  Tables.tip_distribution_user_shares,
  Tables.customers,
  Tables.integration_order_fiscals,
  // Manage catalog
  Tables.dishes,
  Tables.dishes_recipes,
  Tables.dish_modifier_groups,
  Tables.categories,
  Tables.modifier_groups,
  Tables.modifiers,
  Tables.floors,
  Tables.tables,
  Tables.kitchens,
  Tables.workflows,
  Tables.workflow_stages,
  Tables.discounts,
  Tables.coupons,
  Tables.taxes,
  Tables.order_types,
  Tables.payment_types,
  Tables.extras,
  Tables.menus,
  Tables.menu_menu_items,
  Tables.printers,
  Tables.users,
  Tables.user_roles,
] as const;

export type ChangefeedTable = (typeof CHANGEFEED_ALLOWLIST)[number];

export type GetTableChangefeedOptions = {
  table: string;
  /** ISO datetime or versionstamp (number/digit string). Default: 0 (start of retained feed). */
  since?: string | number;
  limit?: number;
  /** Optional record id filter (client-side; SHOW is table-scoped). */
  record_id?: string;
  /** When true, collapse to latest net effect per record id. */
  compact?: boolean;
};

export type ChangefeedAction = "CREATE" | "UPDATE" | "DELETE" | "SCHEMA" | "OTHER";

export type ChangefeedFieldChange = {
  field: string;
  from: any;
  to: any;
};

/** One changefeed change (includes schema define_table events). */
export type ChangefeedMutation = {
  action: ChangefeedAction;
  record_id: string;
  versionstamp: string | number | null;
  /** Wall-clock hint from the record when present (updated_at / created_at). */
  at?: string | null;
  /** Human label (name, number, …). */
  label?: string | null;
  /** Only fields that changed (UPDATE) or were set (CREATE). */
  changes?: ChangefeedFieldChange[];
  /** Slim after-image / payload for tooling; prefer `changes` for display. */
  value?: any;
};

const ALLOWLIST_SET = new Set<string>(CHANGEFEED_ALLOWLIST);

const ALIASES: Record<string, string> = {
  order: Tables.orders,
  orders: Tables.orders,
  order_item: Tables.order_items,
  order_items: Tables.order_items,
  order_void: Tables.order_voids,
  voids: Tables.order_voids,
  order_refund: Tables.order_refunds,
  refunds: Tables.order_refunds,
  order_payment: Tables.order_payment,
  payments: Tables.order_payment,
  day_closing: Tables.closings,
  closings: Tables.closings,
  customer: Tables.customers,
  customers: Tables.customers,
  time_entry: Tables.time_entries,
  shift: Tables.shifts,
  shifts: Tables.shifts,
  tip_distribution: Tables.tip_distributions,
  fiscal: Tables.integration_order_fiscals,
  integration_order_fiscal: Tables.integration_order_fiscals,
  // Manage aliases (UI / English names → Surreal table)
  menu_item: Tables.dishes,
  menu_items: Tables.dishes,
  dish: Tables.dishes,
  dishes: Tables.dishes,
  category: Tables.categories,
  categories: Tables.categories,
  modifier_group: Tables.modifier_groups,
  modifier_groups: Tables.modifier_groups,
  floor: Tables.floors,
  floors: Tables.floors,
  table: Tables.tables,
  tables: Tables.tables,
  floor_table: Tables.tables,
  kitchen: Tables.kitchens,
  kitchens: Tables.kitchens,
  discount: Tables.discounts,
  discounts: Tables.discounts,
  coupon: Tables.coupons,
  coupons: Tables.coupons,
  tax: Tables.taxes,
  taxes: Tables.taxes,
  order_type: Tables.order_types,
  payment_type: Tables.payment_types,
  extra: Tables.extras,
  extras: Tables.extras,
  menu: Tables.menus,
  menus: Tables.menus,
  printer: Tables.printers,
  printers: Tables.printers,
  user: Tables.users,
  users: Tables.users,
  user_role: Tables.user_roles,
  role: Tables.user_roles,
  roles: Tables.user_roles,
};

export const normalizeChangefeedTable = (raw: string): string | null => {
  const key = String(raw ?? "").trim().toLowerCase().replace(/\s+/g, "_");
  if (!key) return null;
  if (ALLOWLIST_SET.has(key)) return key;
  const aliased = ALIASES[key];
  if (aliased && ALLOWLIST_SET.has(aliased)) return aliased;
  return null;
};

/**
 * SHOW CHANGES SINCE does not accept query params — literal only.
 * Default to versionstamp 0 (start of retained feed). A datetime older than
 * when CHANGEFEED was defined returns [] in Surreal — do not default to "yesterday".
 */
export const sinceLiteral = (value?: string | number): string => {
  if (value == null || value === "") {
    return "0";
  }
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "number" && Number.isFinite(value)) return String(Math.trunc(value));
  const asString = String(value).trim().replace(/n$/i, "");
  if (/^\d+$/.test(asString)) return asString;
  if (/^d".+"$/.test(asString)) return asString;
  if (/^\d{4}-\d{2}-\d{2}/.test(asString)) {
    const iso = asString.includes("T") ? asString : `${asString}T00:00:00.000Z`;
    return `d"${iso.replace(/"/g, "")}"`;
  }
  // Phrases like "yesterday" from the model — fall back to feed start, not a pre-feed datetime.
  return "0";
};

/**
 * Surreal table changefeeds share one DB-level log. `LIMIT N` bounds that global
 * scan window, not "N rows for this table" — a small LIMIT often returns only
 * early `define_table` SCHEMA events and skips later data mutations. Match the
 * sync-service scan size and page forward.
 */
export const CHANGEFEED_SCAN_LIMIT = 1000;
const CHANGEFEED_MAX_PAGES = 30;

export const compareVersionstamp = (a: any, b: any): number => {
  if (a == null && b == null) return 0;
  if (a == null) return -1;
  if (b == null) return 1;
  try {
    const left = BigInt(typeof a === "bigint" ? a : String(a).replace(/n$/i, ""));
    const right = BigInt(typeof b === "bigint" ? b : String(b).replace(/n$/i, ""));
    if (left < right) return -1;
    if (left > right) return 1;
    return 0;
  } catch {
    return String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0;
  }
};

/** Surreal `SINCE stamp` is inclusive — drop entries at or before the cursor. */
export const entriesAfterCursor = (
  entries: Array<{changes?: any[]; versionstamp?: any}>,
  cursor: string | number | null | undefined,
): Array<{changes?: any[]; versionstamp?: any}> => {
  if (cursor == null || cursor === "" || cursor === 0 || cursor === "0") {
    return Array.isArray(entries) ? [...entries] : [];
  }
  return (entries || []).filter(
    (entry) => entry && compareVersionstamp(entry.versionstamp, cursor) > 0,
  );
};

/** Surreal DateTime → ISO before Object.entries turns it into `{}`. */
const dateLikeToIso = (value: any): string | null => {
  if (value == null || typeof value !== "object") return null;
  if (value instanceof Date) {
    return Number.isFinite(value.getTime()) ? value.toISOString() : null;
  }
  if (typeof value.toDate === "function") {
    try {
      const date = value.toDate();
      if (date instanceof Date && Number.isFinite(date.getTime())) {
        return date.toISOString();
      }
    } catch {
      // fall through
    }
  }
  if (typeof value.toISOString === "function" && typeof value.getTime === "function") {
    try {
      const iso = value.toISOString();
      return typeof iso === "string" ? iso : null;
    } catch {
      // fall through
    }
  }
  return null;
};

const jsonSafe = (value: any): any => {
  if (typeof value === "bigint") return value.toString();
  if (value == null || typeof value !== "object") return value;
  const asIso = dateLikeToIso(value);
  if (asIso) return asIso;
  if (Array.isArray(value)) return value.map(jsonSafe);
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(value)) {
    out[k] = jsonSafe(v);
  }
  return out;
};

/** Surreal versionstamps are often bigint — JSON.stringify throws unless stringified. */
const stampToJson = (value: any): string | number | null => {
  if (value == null) return null;
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") return value;
  try {
    return String(value);
  } catch {
    return null;
  }
};

/** Keep assistant payloads small — full dish after-images blow the tool loop. */
const SLIM_KEYS = new Set([
  "id", "name", "number", "price", "cost", "priority", "code", "login",
  "type", "status", "is_active", "deleted_at", "quantity", "total", "amount",
  "first_name", "last_name", "role_name", "key", "rate", "available",
]);

/** Skip noisy / non-user-facing keys when computing before→after diffs. */
const DIFF_IGNORE_KEYS = new Set([
  "id", "password", "pin", "password_hash", "image", "images", "meta",
  "items", "stage_overrides", "barcodes", "barcode",
]);

const DISPLAY_FIELD_ORDER = [
  "name", "number", "price", "cost", "priority", "available", "status",
  "type", "quantity", "total", "amount", "categories",
];

export const slimChangefeedValue = (value: any): any => {
  if (value == null || typeof value !== "object") return value;
  if (Array.isArray(value)) {
    if (value.length && typeof value[0] === "object" && value[0] && "op" in value[0]) {
      // JSON-patch style reverse diffs — keep as-is (usually small).
      return jsonSafe(value);
    }
    return value.slice(0, 20).map(slimChangefeedValue);
  }
  const out: Record<string, any> = {};
  let omitted = 0;
  for (const [k, v] of Object.entries(value)) {
    if (SLIM_KEYS.has(k) || k.endsWith("_id") || k.endsWith("_name")) {
      if (typeof v === "object" && v !== null && !Array.isArray(v)) {
        out[k] = (v as any).name
          ?? ((v as any).id != null ? recordIdToString((v as any).id) : "[object]");
      } else {
        out[k] = jsonSafe(v);
      }
    } else if (k === "categories" && Array.isArray(v)) {
      out.categories = v.map((c: any) => c?.name ?? c).filter(Boolean).slice(0, 10);
    } else {
      omitted += 1;
    }
  }
  if (omitted > 0) out._fields_omitted = omitted;
  return out;
};

const normalizeComparable = (value: any): any => {
  if (value == null) return null;
  if (typeof value === "bigint") return value.toString();
  if (Array.isArray(value)) {
    return value.map((item) => {
      if (item && typeof item === "object") {
        return (item as any).name
          ?? ((item as any).id != null ? recordIdToString((item as any).id) : normalizeComparable(item));
      }
      return normalizeComparable(item);
    });
  }
  if (typeof value === "object") {
    if ((value as any).id != null && (value as any).name != null) {
      return String((value as any).name);
    }
    if ((value as any).id != null) return recordIdToString((value as any).id);
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(value)) {
      if (DIFF_IGNORE_KEYS.has(k) || k.startsWith("_")) continue;
      out[k] = normalizeComparable(v);
    }
    return out;
  }
  return value;
};

const valuesEqual = (a: any, b: any): boolean => {
  try {
    return JSON.stringify(normalizeComparable(a)) === JSON.stringify(normalizeComparable(b));
  } catch {
    return a === b;
  }
};

const formatFieldValue = (value: any): string => {
  if (value == null || value === "") return "—";
  if (typeof value === "boolean") return value ? "yes" : "no";
  if (typeof value === "number") return Number.isInteger(value) ? String(value) : String(value);
  if (Array.isArray(value)) {
    const parts = value.map((item) => {
      if (item && typeof item === "object") {
        return (item as any).name ?? recordIdToString((item as any).id) ?? JSON.stringify(item);
      }
      return String(item);
    }).filter(Boolean);
    return parts.length ? parts.join(", ") : "—";
  }
  if (typeof value === "object") {
    if ((value as any).name != null) return String((value as any).name);
    if ((value as any).id != null) return recordIdToString((value as any).id);
    try {
      return JSON.stringify(normalizeComparable(value));
    } catch {
      return "[object]";
    }
  }
  return String(value);
};

/** Diff two after-images; returns only changed fields (human-facing keys). */
export const diffChangefeedValues = (
  before: any,
  after: any,
): ChangefeedFieldChange[] => {
  const beforeObj = before && typeof before === "object" && !Array.isArray(before) ? before : {};
  const afterObj = after && typeof after === "object" && !Array.isArray(after) ? after : {};
  const keys = new Set([...Object.keys(beforeObj), ...Object.keys(afterObj)]);
  const changes: ChangefeedFieldChange[] = [];
  for (const key of keys) {
    if (DIFF_IGNORE_KEYS.has(key) || key.startsWith("_")) continue;
    // Timestamps are used for `at`, not listed as field edits unless nothing else changed.
    if (key === "created_at" || key === "updated_at" || key === "modified_at" || key === "deleted_at") {
      continue;
    }
    const from = (beforeObj as any)[key];
    const to = (afterObj as any)[key];
    if (valuesEqual(from, to)) continue;
    // Skip pure noise: both empty
    if ((from == null || from === "") && (to == null || to === "")) continue;
    changes.push({field: key, from: jsonSafe(from ?? null), to: jsonSafe(to ?? null)});
  }
  changes.sort((a, b) => {
    const ai = DISPLAY_FIELD_ORDER.indexOf(a.field);
    const bi = DISPLAY_FIELD_ORDER.indexOf(b.field);
    const ao = ai === -1 ? 1000 : ai;
    const bo = bi === -1 ? 1000 : bi;
    return ao - bo || a.field.localeCompare(b.field);
  });
  return changes;
};

export const recordLabelFromValue = (value: any, recordId?: string): string | null => {
  if (!value || typeof value !== "object") {
    return recordId ? recordIdToString(recordId) : null;
  }
  const name = value.name ?? value.label ?? null;
  const number = value.number ?? value.code ?? null;
  if (name != null && number != null) return `${name} (#${number})`;
  if (name != null) return String(name);
  if (number != null) return `#${number}`;
  if (value.first_name || value.last_name) {
    return [value.first_name, value.last_name].filter(Boolean).join(" ");
  }
  return recordId ? recordIdToString(recordId) : null;
};

export const changeTimeFromValue = (value: any): string | null => {
  if (!value || typeof value !== "object") return null;
  const raw = value.updated_at ?? value.modified_at ?? value.created_at ?? value.deleted_at;
  if (raw == null) return null;
  // Empty object leftover from a bad DateTime serialize
  if (typeof raw === "object" && !Array.isArray(raw) && !(raw instanceof Date) && Object.keys(raw).length === 0) {
    return null;
  }
  const iso = typeof raw === "string" ? raw : dateLikeToIso(raw);
  if (iso && iso !== "[object Object]") {
    try {
      return formatDateTime(iso);
    } catch {
      return iso;
    }
  }
  return null;
};

const formatFieldChangeCell = (change: ChangefeedFieldChange): string => {
  const from = formatFieldValue(change.from);
  const to = formatFieldValue(change.to);
  if (from === "—" && to !== "—") return `${change.field}: set to ${to}`;
  if (from !== "—" && to === "—") return `${change.field}: cleared (was ${from})`;
  return `${change.field}: ${from} → ${to}`;
};

const escapeTableCell = (text: string): string =>
  text.replace(/\|/g, "/").replace(/\n/g, " ");

/**
 * Walk mutations in order and attach field-level before→after diffs using the
 * previous after-image per record (plain CHANGEFEED has no built-in before).
 */
export const enrichMutationsWithDiffs = (mutations: ChangefeedMutation[]): ChangefeedMutation[] => {
  const previous = new Map<string, any>();
  return mutations.map((mutation) => {
    if (mutation.action === "SCHEMA" || mutation.action === "OTHER") {
      return {
        ...mutation,
        value: mutation.action === "SCHEMA"
          ? {name: mutation.value?.name ?? mutation.value}
          : mutation.value,
      };
    }

    const after = mutation.value;
    const at = changeTimeFromValue(after) ?? changeTimeFromValue(previous.get(mutation.record_id));
    const label = recordLabelFromValue(after, mutation.record_id)
      ?? recordLabelFromValue(previous.get(mutation.record_id), mutation.record_id);

    if (mutation.action === "CREATE") {
      const changes = diffChangefeedValues({}, after).slice(0, 12);
      if (mutation.record_id) previous.set(mutation.record_id, after);
      return {
        ...mutation,
        at,
        label,
        changes,
        value: slimChangefeedValue(after),
      };
    }

    if (mutation.action === "DELETE") {
      const before = after ?? previous.get(mutation.record_id) ?? null;
      if (mutation.record_id) previous.delete(mutation.record_id);
      return {
        ...mutation,
        at: changeTimeFromValue(before) ?? at,
        label: recordLabelFromValue(before, mutation.record_id) ?? label,
        changes: before && typeof before === "object"
          ? diffChangefeedValues(before, {}).slice(0, 8)
          : [],
        value: slimChangefeedValue(before),
      };
    }

    // UPDATE
    const before = mutation.record_id ? previous.get(mutation.record_id) : undefined;
    let changes = diffChangefeedValues(before ?? {}, after);
    // First sighting in the feed: no prior after-image — show key after fields as "set to".
    if (!before && changes.length === 0 && after && typeof after === "object") {
      changes = diffChangefeedValues({}, after).slice(0, 8);
    } else if (!before) {
      // Keep only a short highlight set for first-seen full after-images.
      changes = changes.filter((c) => DISPLAY_FIELD_ORDER.includes(c.field) || c.field.endsWith("_id")).slice(0, 8);
    }
    if (mutation.record_id && after && typeof after === "object") {
      previous.set(mutation.record_id, after);
    }
    return {
      ...mutation,
      at,
      label,
      changes,
      value: slimChangefeedValue(after),
    };
  });
};

export const formatChangefeedAsAnswer = (result: {
  ok?: boolean;
  table?: string;
  error?: string;
  event_count?: number;
  data_mutation_count?: number;
  schema_event_count?: number;
  mutations?: ChangefeedMutation[];
  note?: string;
}): string => {
  if (!result?.ok) {
    return result?.error
      ? `Changefeed unavailable: ${result.error}`
      : "Changefeed query failed.";
  }
  const rows = result.mutations ?? [];
  const dataRows = rows.filter((row) =>
    row.action === "CREATE" || row.action === "UPDATE" || row.action === "DELETE"
  );
  const schemaCount = result.schema_event_count
    ?? rows.filter((row) => row.action === "SCHEMA").length;
  const lines = [
    `### Changefeed: \`${result.table}\``,
    "",
    `- Data changes: **${result.data_mutation_count ?? dataRows.length}**`
      + (schemaCount ? ` · schema events: ${schemaCount}` : ""),
    "",
  ];
  if (!dataRows.length) {
    if (schemaCount > 0) {
      lines.push(
        "_Only SCHEMA `define_table` events so far (feed enable/alter). "
          + "Edit a row after enabling CHANGEFEED to see field-level changes._",
      );
    } else {
      lines.push("_No events in the retained feed window._");
      lines.push("");
      lines.push(
        "_Tip: changefeeds only record writes after CHANGEFEED was enabled — older edits will not appear._",
      );
    }
    return lines.join("\n");
  }

  lines.push("| Time | Action | Record | Changes |");
  lines.push("|------|--------|--------|---------|");
  for (const row of dataRows) {
    const when = escapeTableCell(row.at && row.at !== "[object Object]" ? row.at : "—");
    const action = row.action;
    const record = escapeTableCell(
      row.label
        ? (row.record_id ? `${row.label} (${row.record_id})` : row.label)
        : (row.record_id || "—"),
    );
    const fieldChanges = row.changes ?? [];
    const changes = escapeTableCell(
      fieldChanges.length
        ? fieldChanges.slice(0, 12).map(formatFieldChangeCell).join("; ")
          + (fieldChanges.length > 12 ? `; +${fieldChanges.length - 12} more` : "")
        : (row.action === "DELETE" ? "record deleted" : "—"),
    );
    lines.push(`| ${when} | ${action} | ${record} | ${changes} |`);
  }

  if (schemaCount > 0) {
    lines.push("");
    lines.push(`_(${schemaCount} schema define_table event(s) omitted)_`);
  }
  return lines.join("\n");
};

const normalizeShowChangesResult = (result: unknown): Array<{changes?: any[]; versionstamp?: any}> => {
  // Prefer shared unwrap (handles [rows] and [{result: rows}]).
  const unwrapped = unwrapQueryResult<{changes?: any[]; versionstamp?: any}>(result);
  if (unwrapped.length) {
    return unwrapped.filter((row) => row && typeof row === "object");
  }
  const first = Array.isArray(result) ? result[0] : result;
  const rows = first && typeof first === "object" && first !== null && "result" in first
    ? (first as {result: unknown}).result
    : first;
  if (!Array.isArray(rows)) return [];
  return rows.filter((row) => row && typeof row === "object");
};

const parseChangeMutation = (
  change: any,
  versionstamp: any,
): ChangefeedMutation => {
  const stamp = stampToJson(versionstamp);

  if (!change || typeof change !== "object") {
    return {
      action: "OTHER",
      record_id: "",
      versionstamp: stamp,
      value: jsonSafe(change),
    };
  }

  if (change.define_table || change.define_db || change.define_database) {
    return {
      action: "SCHEMA",
      record_id: "",
      versionstamp: stamp,
      value: jsonSafe(change.define_table ?? change.define_db ?? change.define_database),
    };
  }

  if (change.delete) {
    const id = change.delete.id ?? change.delete;
    return {
      action: "DELETE",
      record_id: recordIdToString(id),
      versionstamp: stamp,
      value: jsonSafe(change.delete.original ?? null),
    };
  }

  if (change.update != null) {
    // Plain feed: update is the after-image object.
    // INCLUDE ORIGINAL: update is a reverse-diff array; current holds after-image.
    const afterImage = change.current && typeof change.current === "object"
      ? change.current
      : (!Array.isArray(change.update) ? change.update : null);
    const id = afterImage?.id
      ?? (!Array.isArray(change.update) ? change.update?.id : null)
      ?? change.id;
    return {
      action: "UPDATE",
      record_id: id != null ? recordIdToString(id) : "",
      versionstamp: stamp,
      value: jsonSafe(
        afterImage
        ?? {
          current: change.current ?? null,
          diff: change.update,
        },
      ),
    };
  }

  if (change.create) {
    const value = change.create;
    return {
      action: "CREATE",
      record_id: value?.id != null ? recordIdToString(value.id) : "",
      versionstamp: stamp,
      value: jsonSafe(value),
    };
  }

  return {
    action: "OTHER",
    record_id: "",
    versionstamp: stamp,
    value: jsonSafe(change),
  };
};

const flattenEntries = (
  entries: Array<{changes?: any[]; versionstamp?: any}>,
): ChangefeedMutation[] => {
  const out: ChangefeedMutation[] = [];
  for (const entry of entries) {
    const changes = Array.isArray(entry.changes) ? entry.changes : [];
    for (const change of changes) {
      out.push(parseChangeMutation(change, entry.versionstamp));
    }
  }
  return out;
};

/** Compact only data rows (same record_id); keep SCHEMA/OTHER in order. */
const compactMutations = (mutations: ChangefeedMutation[]): ChangefeedMutation[] => {
  const byId = new Map<string, ChangefeedMutation>();
  const passthrough: ChangefeedMutation[] = [];
  for (const mutation of mutations) {
    if (mutation.action === "SCHEMA" || mutation.action === "OTHER" || !mutation.record_id) {
      passthrough.push(mutation);
      continue;
    }
    byId.set(mutation.record_id, mutation);
  }
  return [...passthrough, ...byId.values()];
};

export const getTableChangefeed = async (
  db: DbClient,
  options: GetTableChangefeedOptions,
) => {
  const table = normalizeChangefeedTable(options.table);
  if (!table) {
    return {
      ok: false,
      error:
        `Table not allowlisted for changefeed reads. Allowed: ${CHANGEFEED_ALLOWLIST.join(", ")}`,
      allowed_tables: [...CHANGEFEED_ALLOWLIST],
      mutations: [] as ChangefeedMutation[],
    };
  }

  // Display cap (what we return). Scan limit is larger — see CHANGEFEED_SCAN_LIMIT.
  const limit = Math.min(Math.max(Number(options.limit) || 50, 1), 200);
  const since = sinceLiteral(options.since);
  const scanLimit = CHANGEFEED_SCAN_LIMIT;
  const queries: string[] = [];

  let entries: Array<{changes?: any[]; versionstamp?: any}> = [];
  let cursor: string | number | null = since === "0" ? null : since;
  try {
    for (let page = 0; page < CHANGEFEED_MAX_PAGES; page += 1) {
      const sinceLit = cursor == null ? "0" : sinceLiteral(cursor);
      const query = `SHOW CHANGES FOR TABLE ${table} SINCE ${sinceLit} LIMIT ${scanLimit}`;
      queries.push(query);
      const result = await db.query(query);
      const batch = normalizeShowChangesResult(result);
      const fresh = entriesAfterCursor(batch, cursor);
      if (!fresh.length) {
        break;
      }
      entries.push(...fresh);
      cursor = fresh[fresh.length - 1]?.versionstamp ?? cursor;
      // Short page ⇒ end of retained feed for this scan window.
      if (batch.length < scanLimit) {
        break;
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      table,
      since,
      limit,
      scan_limit: scanLimit,
      error: message || "SHOW CHANGES failed (permissions or changefeed unavailable)",
      mutations: [] as ChangefeedMutation[],
    };
  }

  // Diff against prior after-images while the full scan is still in order, then slim.
  let mutations = enrichMutationsWithDiffs(flattenEntries(entries));
  const scanned_event_count = mutations.length;
  const recordFilter = String(options.record_id ?? "").trim().toLowerCase();
  if (recordFilter) {
    mutations = mutations.filter((m) =>
      m.action === "SCHEMA"
      || m.action === "OTHER"
      || m.record_id.toLowerCase().includes(recordFilter),
    );
  }
  if (options.compact) {
    mutations = compactMutations(mutations);
  }

  // Prefer the latest events — early pages are dominated by define_table SCHEMA.
  const truncated = mutations.length > limit;
  if (truncated) {
    mutations = mutations.slice(-limit);
  }

  const last = entries.length ? entries[entries.length - 1]?.versionstamp ?? null : null;
  const data_mutation_count = mutations.filter((m) =>
    m.action === "CREATE" || m.action === "UPDATE" || m.action === "DELETE"
  ).length;
  const schema_event_count = mutations.filter((m) => m.action === "SCHEMA").length;

  // Deep-sanitize so tool results / fast-path JSON.stringify never hit BigInt errors.
  return jsonSafe({
    ok: true,
    table,
    since,
    limit,
    scan_limit: scanLimit,
    pages: queries.length,
    query: queries[0] ?? `SHOW CHANGES FOR TABLE ${table} SINCE ${since} LIMIT ${scanLimit}`,
    queries,
    entry_count: entries.length,
    scanned_event_count,
    raw_event_count: scanned_event_count,
    event_count: mutations.length,
    mutation_count: mutations.length,
    data_mutation_count,
    schema_event_count,
    truncated,
    last_versionstamp: stampToJson(last),
    mutations,
    note:
      "Each data mutation lists only changed fields as from→to (diffed against the previous "
      + "after-image for that record in the feed). `at` uses updated_at/created_at when present. "
      + `Paged SHOW CHANGES with LIMIT ${scanLimit}; returning the latest ${limit} events. `
      + "Retention ~14d after CHANGEFEED was enabled.",
  });
};
