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

export const buildOrConditions = (
  field: string,
  ids: string[],
  paramPrefix: string,
): {condition?: string; params: Record<string, string>} => {
  if (ids.length === 0) {
    return {params: {}};
  }

  const params: Record<string, string> = {};
  const parts = ids.map((id, index) => {
    const paramName = `${paramPrefix}${index}`;
    params[paramName] = id;
    return `${field} = $${paramName}`;
  });

  return {
    condition: `(${parts.join(" OR ")})`,
    params,
  };
};
