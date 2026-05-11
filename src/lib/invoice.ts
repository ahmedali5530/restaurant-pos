import {Tables} from "@/api/db/tables.ts";
import {getBusinessDayUnixRange} from "@/lib/datetime.ts";

type QueryableDb = {
  query: <R extends unknown[] = any[]>(sql: string, parameters?: Record<string, unknown>) => Promise<R>;
};

type InvoiceMaxRow = {
  invoice_number?: number | null;
};

type AutoIdMaxRow = {
  auto_id?: number | null;
};

export const generateNextInvoiceNumber = async (db: QueryableDb): Promise<number> => {
  const {startUnix, endUnix} = getBusinessDayUnixRange();
  const [result] = await db.query<InvoiceMaxRow[]>(
    `SELECT math::max(invoice_number) as invoice_number
     FROM ${Tables.orders}
     WHERE time::unix(created_at) >= $startUnix
       AND time::unix(created_at) < $endUnix
     GROUP ALL`,
    {startUnix, endUnix}
  );

  const maxInvoiceNumber = Number(result?.[0]?.invoice_number ?? 0);
  if (!Number.isFinite(maxInvoiceNumber) || maxInvoiceNumber < 1) {
    return 1;
  }

  return Math.floor(maxInvoiceNumber) + 1;
};

export const getNextAutoId = async (db: QueryableDb): Promise<number> => {
  const [result] = await db.query<AutoIdMaxRow[]>(
    `SELECT math::max(auto_id) as auto_id
     FROM ${Tables.orders}
     GROUP ALL`
  );

  const maxAutoId = Number(result?.[0]?.auto_id ?? 0);
  if (!Number.isFinite(maxAutoId) || maxAutoId < 1) {
    return 1;
  }

  return Math.floor(maxAutoId) + 1;
};
