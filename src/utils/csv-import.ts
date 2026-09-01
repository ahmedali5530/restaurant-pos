export type CsvImportMode = 'create' | 'update' | 'upsert';

export type CsvImportRowContext = {
  mode: CsvImportMode;
  matchFields: string[];
};

type DbLike = {
  query: (sql: string, vars?: Record<string, any>) => Promise<any[]>;
  insert: (table: string, data: any) => Promise<any>;
  create: (table: string, data: any) => Promise<any>;
  merge: (thing: any, data: any) => Promise<any>;
};

/** Ensure selected match columns have non-empty values on this row. */
export function assertCsvMatchValues(
  rowData: Record<string, string>,
  matchFields: string[],
  message: (field: string) => string
) {
  for (const field of matchFields) {
    if (!String(rowData[field] ?? '').trim()) {
      throw new Error(message(field));
    }
  }
}

/**
 * Look up existing rows by AND of match conditions.
 * Returns up to 2 rows so callers can detect ambiguous matches.
 */
export async function findCsvImportMatches(
  db: Pick<DbLike, 'query'>,
  table: string,
  conditions: Array<{ column: string; value: any }>,
  options?: { softDelete?: boolean }
): Promise<Array<{ id: any }>> {
  if (conditions.length === 0) {
    return [];
  }

  const whereParts = conditions.map((c, i) => `${c.column} = $v${i}`);
  if (options?.softDelete !== false) {
    whereParts.push('deleted_at = none');
  }

  const vars: Record<string, any> = {};
  conditions.forEach((c, i) => {
    vars[`v${i}`] = c.value;
  });

  const [rows] = await db.query(
    `SELECT id FROM ${table} WHERE ${whereParts.join(' AND ')} LIMIT 2`,
    vars
  );

  return rows ?? [];
}

export async function writeCsvImportRow(
  db: Pick<DbLike, 'insert' | 'create' | 'merge'>,
  options: {
    mode: CsvImportMode;
    table: string;
    existing: Array<{ id: any }>;
    payload: any;
    /** inventory items use db.create instead of db.insert */
    useCreate?: boolean;
    notFoundMessage: string;
    multipleMatchesMessage: string;
  }
): Promise<'created' | 'updated'> {
  const {
    mode,
    table,
    existing,
    payload,
    useCreate,
    notFoundMessage,
    multipleMatchesMessage,
  } = options;

  const createRow = async () => {
    if (useCreate) {
      await db.create(table, payload);
    } else {
      await db.insert(table, payload);
    }
    return 'created' as const;
  };

  if (mode === 'create') {
    return createRow();
  }

  if (existing.length > 1) {
    throw new Error(multipleMatchesMessage);
  }

  if (existing.length === 1) {
    await db.merge(existing[0].id, payload);
    return 'updated';
  }

  if (mode === 'update') {
    throw new Error(notFoundMessage);
  }

  return createRow();
}

/** Build DB match conditions from CSV field names via a column/value mapper. */
export function buildMatchConditions(
  rowData: Record<string, string>,
  matchFields: string[],
  mapField: (field: string, value: string) => { column: string; value: any }
): Array<{ column: string; value: any }> {
  return matchFields.map((field) => mapField(field, String(rowData[field] ?? '').trim()));
}
