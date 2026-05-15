import { Tables } from "@/api/db/tables.ts";
import { DishModifierGroup } from "@/api/model/dish_modifier_group.ts";
import { toRecordId } from "@/lib/utils.ts";

type DbClient = {
  query: (sql: string, bindings?: Record<string, unknown>) => Promise<unknown>;
};

export function resolveAllowedNextGroupIds(
  allowed?: Array<{ id: unknown } | string> | null
): string[] | undefined {
  if (allowed === null || allowed === undefined) {
    return undefined;
  }

  return allowed.map((item) =>
    typeof item === 'string' ? item : String(item.id)
  );
}

export async function fetchAttachableGroupsForDish(
  db: DbClient,
  dishId: string
): Promise<DishModifierGroup[]> {
  const result = await db.query(
    `SELECT * FROM ${Tables.dish_modifier_groups} WHERE in = $dish ORDER BY priority ASC FETCH out`,
    { dish: toRecordId(dishId) }
  );
  const rows = Array.isArray(result) ? result[0] : result;

  return Array.isArray(rows) ? (rows as DishModifierGroup[]) : [];
}
