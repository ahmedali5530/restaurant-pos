import type {DbClient} from "@/api/reports/shared/types.ts";

/** Stable DbClient shim — avoids putting useDB() return value in hook deps. */
export const createStableDbClient = (
  queryFn: DbClient["query"],
): DbClient => ({
  query: (...args) => queryFn(...args),
});
