import type {ImportDbLike} from "@/lib/data-import/types.ts";
import {Tables} from "@/api/db/tables.ts";

export async function resolveByNameOrCode(
  db: ImportDbLike,
  table: string,
  key: string,
  fields: string[] = ["name"]
): Promise<any | null> {
  const trimmed = key.trim();
  if (!trimmed) return null;

  for (const field of fields) {
    const [rows] = await db.query(
      `SELECT id, ${fields.join(", ")} FROM ${table} WHERE ${field} = $key LIMIT 1`,
      {key: trimmed}
    );
    if (rows?.length) return rows[0];
  }

  if (fields.includes("name")) {
    const [rows] = await db.query(
      `SELECT id, name FROM ${table} WHERE string::lowercase(name) = string::lowercase($key) LIMIT 1`,
      {key: trimmed}
    );
    if (rows?.length) return rows[0];
  }
  return null;
}

export function parseImportDateTime(value: any): Date {
  const raw = String(value ?? "").trim();
  if (!raw) throw new Error("Date/time is required");
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) throw new Error(`Invalid date/time: ${raw}`);
  return d;
}

export async function resolveEmployee(db: ImportDbLike, employeeKey: string): Promise<any> {
  const [byNumber] = await db.query(
    `SELECT id, employee_number, first_name, last_name FROM ${Tables.employees}
     WHERE employee_number = $key LIMIT 1`,
    {key: employeeKey}
  );
  let employee = byNumber?.[0];
  if (!employee) {
    const [byName] = await db.query(
      `SELECT id, employee_number, first_name, last_name FROM ${Tables.employees}
       WHERE string::lowercase(string::concat(first_name, ' ', last_name ?? '')) = string::lowercase($key)
       OR string::lowercase(first_name) = string::lowercase($key)
       LIMIT 1`,
      {key: employeeKey}
    );
    employee = byName?.[0];
  }
  return employee ?? null;
}
