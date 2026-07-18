import type { useDB } from "@/api/db/db.ts";

type DatabaseClient = ReturnType<typeof useDB>;

export type TransactionStatement = {
  sql: string;
  params?: Record<string, unknown>;
};

/**
 * Runs statements inside a SurrealDB BEGIN/COMMIT transaction.
 *
 * SurrealDB transactions are a multi-statement query block. Parameters are
 * merged into a single bindings object; callers must use unique param names
 * across statements when values differ.
 *
 * On failure SurrealDB cancels the transaction automatically.
 */
export const withTransaction = async <R extends unknown[] = any[]>(
  db: DatabaseClient,
  statements: TransactionStatement[]
): Promise<R> => {
  if (!statements.length) {
    return [] as unknown as R;
  }

  const parts: string[] = ["BEGIN TRANSACTION;"];
  const bindings: Record<string, unknown> = {};

  for (const statement of statements) {
    const trimmed = statement.sql.trim().replace(/;$/, "");
    parts.push(`${trimmed};`);
    if (statement.params) {
      Object.assign(bindings, statement.params);
    }
  }

  parts.push("COMMIT TRANSACTION;");

  return db.query<R>(parts.join("\n"), bindings);
};
