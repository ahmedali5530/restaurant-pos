import {toRecordId} from "@/lib/utils.ts";

const DB_DATE_FORMAT = import.meta.env.VITE_DB_DATABASE_FORMAT as string;

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

export const buildCreatedAtDateConditions = (
  {startDate, endDate}: {startDate?: string; endDate?: string},
  field = "created_at",
): {conditions: string[]; params: Record<string, string>} => {
  const conditions: string[] = [];
  const params: Record<string, string> = {};

  if (startDate) {
    conditions.push(`time::format(${field}, "${DB_DATE_FORMAT}") >= $startDate`);
    params.startDate = startDate;
  }

  if (endDate) {
    conditions.push(`time::format(${field}, "${DB_DATE_FORMAT}") <= $endDate`);
    params.endDate = endDate;
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
