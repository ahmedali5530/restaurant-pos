import {toRecordId} from "@/lib/utils.ts";
import {DateTime} from "luxon";
import {getAppTimezone} from "@/lib/datetime.ts";

const QUERY_DATE_TIME_FORMAT = import.meta.env.VITE_DATE_TIME_FORMAT as string;
const QUERY_DATE_FORMAT = import.meta.env.VITE_DATE_FORMAT as string;
const BARE_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export const unwrapQueryResult = <T>(result: unknown): T[] => {
  if (!result || !Array.isArray(result) || result.length === 0) {
    return [];
  }

  const first = result[0] as {result?: T[]} | T[];
  if (Array.isArray(first)) {
    return first;
  }
  if (first && typeof first === "object" && "result" in first && Array.isArray(first.result)) {
    return first.result;
  }
  return [];
};

/**
 * Report date-range boundaries (from the `DateRange` filter UI, or a plain
 * `?date=` param) are always local wall-clock time in the app's configured
 * timezone, never UTC — unlike SurrealDB datetimes, which are UTC. Parse
 * them against that timezone explicitly instead of treating the string as
 * a bare UTC instant.
 */
const parseReportBoundary = (value: string): DateTime => {
  const timezone = getAppTimezone();
  const trimmed = value.trim();

  const asDateTime = DateTime.fromFormat(trimmed, QUERY_DATE_TIME_FORMAT, {zone: timezone});
  if (asDateTime.isValid) {
    return asDateTime;
  }

  const asDateOnly = DateTime.fromFormat(trimmed, QUERY_DATE_FORMAT, {zone: timezone});
  if (asDateOnly.isValid) {
    return asDateOnly.startOf("day");
  }

  // Last resort: an ISO string. Offset-bearing values name an instant; an
  // offset-less value is interpreted as wall-clock time in the app timezone
  // (never the browser's), matching the rest of the report filters.
  return DateTime.fromISO(trimmed, {zone: timezone});
};

/**
 * Converts one report boundary string to a UTC ISO instant suitable for a
 * `<datetime>$param` cast, or undefined if empty/unparseable.
 *
 * `endOfRange` applies the inclusive-end conventions: a bare date is pushed to
 * the exclusive start of the next local day so the whole calendar day is
 * covered, and a minute-precision datetime is extended to the end of that
 * minute. The filter UI formats with VITE_DATE_TIME_FORMAT (no seconds), so an
 * end like `2026-10-02 23:59` would otherwise parse to 23:59:00.000 and drop
 * every record in the final 59.999 seconds of the range.
 */
export const toReportBoundaryUtcIso = (
  value: string | undefined,
  {endOfRange = false}: {endOfRange?: boolean} = {},
): string | undefined => {
  if (!value) return undefined;

  const parsed = parseReportBoundary(value);
  if (!parsed.isValid) {
    // Don't silently widen the report when a filter value is malformed.
    console.warn(`[reports] Ignoring unparseable date boundary: "${value}"`);
    return undefined;
  }

  const isBareDate = BARE_DATE_RE.test(value.trim());
  let resolved = parsed;

  if (endOfRange) {
    if (isBareDate) {
      resolved = parsed.plus({days: 1});
    } else if (parsed.second === 0 && parsed.millisecond === 0) {
      resolved = parsed.endOf("minute");
    }
  }

  return resolved.toUTC().toISO() ?? undefined;
};

/**
 * startDate/endDate are compared against `field` (a raw UTC SurrealDB
 * datetime) as real UTC instants, not by formatting `field` on the DB
 * server and string-matching — that ignored the app's configured timezone
 * and misbucketed records near local midnight into the wrong day.
 */
export const buildCreatedAtDateConditions = (
  {startDate, endDate}: {startDate?: string; endDate?: string},
  field = "created_at",
): {conditions: string[]; params: Record<string, string>} => {
  const conditions: string[] = [];
  const params: Record<string, string> = {};

  const start = toReportBoundaryUtcIso(startDate);
  if (start) {
    conditions.push(`${field} >= <datetime>$startDate`);
    params.startDate = start;
  }

  if (endDate) {
    // A bare date means "through the end of that calendar day" — use an
    // exclusive next-day boundary so the whole day is covered regardless
    // of the stored field's precision. A full datetime is compared as the
    // inclusive end of its minute (see toReportBoundaryUtcIso).
    const isBareDate = BARE_DATE_RE.test(endDate.trim());
    const end = toReportBoundaryUtcIso(endDate, {endOfRange: true});
    if (end) {
      conditions.push(isBareDate ? `${field} < <datetime>$endDate` : `${field} <= <datetime>$endDate`);
      params.endDate = end;
    }
  }

  return {conditions, params};
};

/** Record-field filter: `field INSIDE $param` with toRecordId-bound values. */
export const buildRecordInsideCondition = (
  field: string,
  ids: string[],
  paramName: string,
): {condition?: string; params: Record<string, any>} => {
  if (ids.length === 0) {
    return {params: {}};
  }

  return {
    condition: `${field} INSIDE $${paramName}`,
    params: {[paramName]: ids.map(id => toRecordId(id))},
  };
};

/**
 * Prefer location field; also match legacy store for documents not yet cut over.
 * `(location INSIDE $param OR store INSIDE $param)`
 * @deprecated Use buildLocationInsideCondition now that reports are location-only.
 */
export const buildLocationOrStoreInsideCondition = (
  ids: string[],
  paramName = "locationIds",
): {condition?: string; params: Record<string, any>} => {
  if (ids.length === 0) {
    return {params: {}};
  }

  return {
    condition: `(location INSIDE $${paramName} OR store INSIDE $${paramName})`,
    params: {[paramName]: ids.map(id => toRecordId(id))},
  };
};

/**
 * Location-only filter for reports fully cut over to location:
 * `location INSIDE $param` (no legacy store fallback).
 */
export const buildLocationInsideCondition = (
  ids: string[],
  paramName = "locationIds",
): {condition?: string; params: Record<string, any>} => {
  return buildRecordInsideCondition("location", ids, paramName);
};

/**
 * Nested array record filter, e.g. line items:
 * `(array::any(items.item, $item0) OR array::any(items.item, $item1))`
 */
export const buildNestedRecordAnyCondition = (
  path: string,
  ids: string[],
  paramPrefix: string,
): {condition?: string; params: Record<string, any>} => {
  if (ids.length === 0) {
    return {params: {}};
  }

  const params: Record<string, any> = {};
  const parts = ids.map((id, index) => {
    const paramName = `${paramPrefix}${index}`;
    params[paramName] = toRecordId(id);
    return `array::any(${path}, $${paramName})`;
  });

  return {
    condition: `(${parts.join(" OR ")})`,
    params,
  };
};

/** String/enum filter: `field INSIDE $param` (no record coercion). */
export const buildStringInsideCondition = (
  field: string,
  values: string[],
  paramName: string,
): {condition?: string; params: Record<string, any>} => {
  if (values.length === 0) {
    return {params: {}};
  }

  return {
    condition: `${field} INSIDE $${paramName}`,
    params: {[paramName]: values},
  };
};

/**
 * Record id OR/INSIDE filter. Prefer this for user/store/supplier/etc.
 * For plain strings (status enums), use buildStringInsideCondition.
 */
export const buildOrConditions = (
  field: string,
  ids: string[],
  paramPrefix: string,
): {condition?: string; params: Record<string, any>} => {
  return buildRecordInsideCondition(field, ids, paramPrefix);
};
