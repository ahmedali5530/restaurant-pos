import {Tables} from "@/api/db/tables.ts";
import {unwrapQueryResult} from "@/api/reports/shared/query.ts";
import {listSyncBranches, type SyncBranch} from "@/lib/catalog-publish.ts";

export type BranchView = "combined" | "by_branch";

export interface BranchScopeParams {
  selectedBranchIds: string[];
  branchView: BranchView;
}

export interface BranchPartition<T> {
  branchId: string;
  label: string;
  rows: T[];
}

export interface ReportBranchContext {
  visible: SyncBranch[];
  /** True only when 2+ visible sync branches AND FOH rows carry branch_id stamps. */
  multiBranchMode: boolean;
  branchLabels: Map<string, string>;
  branchOrder: string[];
}

export const UNKNOWN_BRANCH_ID = "__unknown__";

type DbLike = {query: (sql: string, vars?: any) => Promise<any>};

/**
 * Cloud master stamps FOH uploads with branch_id. Local/demo DBs may still have
 * sync_branch rows for catalog publish without any stamped sales — filtering
 * those by branch_id returns empty reports. Require at least one stamped order.
 */
export const hasStampedBranchOrders = async (db: DbLike): Promise<boolean> => {
  try {
    const rows = unwrapQueryResult<{c?: number; count?: number}>(
      await db.query(
        `SELECT count() AS c FROM ${Tables.orders} WHERE branch_id != NONE GROUP ALL`,
      ),
    );
    const count = Number(rows[0]?.c ?? rows[0]?.count ?? 0);
    return Number.isFinite(count) && count > 0;
  } catch {
    return false;
  }
};

/** Load sync branches + whether HQ branch reporting should be active. */
export const loadReportBranchContext = async (
  db: DbLike,
  userBranchIds?: string[] | null,
): Promise<ReportBranchContext> => {
  let branches: SyncBranch[] = [];
  try {
    branches = await listSyncBranches(db);
  } catch {
    branches = [];
  }
  const visible = filterSyncBranchesForUser(branches, userBranchIds);
  const stamped = visible.length >= 2 ? await hasStampedBranchOrders(db) : false;
  return {
    visible,
    multiBranchMode: visible.length >= 2 && stamped,
    branchLabels: buildBranchLabelMap(visible),
    branchOrder: visible.map((b) => b.client_id),
  };
};

/** Resolve which branch_id values a report query may include. */
export const resolveEffectiveBranchIds = (options: {
  selectedBranchIds: string[];
  userBranchIds?: string[] | null;
  /** True when the connected DB has 2+ active sync_branch rows the user may see. */
  multiBranchMode: boolean;
}): string[] | undefined => {
  if (!options.multiBranchMode) {
    return undefined;
  }

  const allowed = normalizeBranchIds(options.userBranchIds);
  const selected = normalizeBranchIds(options.selectedBranchIds) ?? [];

  if (allowed) {
    if (selected.length === 0) {
      return allowed;
    }
    return selected.filter((id) => allowed.includes(id));
  }

  if (selected.length === 0) {
    return undefined;
  }
  return selected;
};

export const normalizeBranchIds = (ids?: string[] | null): string[] | null => {
  if (!ids || ids.length === 0) {
    return null;
  }
  const cleaned = [
    ...new Set(ids.map((id) => String(id || "").trim()).filter(Boolean)),
  ];
  return cleaned.length > 0 ? cleaned : null;
};

export const filterSyncBranchesForUser = (
  branches: SyncBranch[],
  userBranchIds?: string[] | null,
): SyncBranch[] => {
  const active = branches.filter((b) => b.active !== false && b.client_id);
  const allowed = normalizeBranchIds(userBranchIds);
  if (!allowed) {
    return active;
  }
  return active.filter((b) => allowed.includes(b.client_id));
};

export const buildBranchLabelMap = (
  branches: SyncBranch[],
): Map<string, string> => {
  const map = new Map<string, string>();
  for (const branch of branches) {
    if (!branch.client_id) continue;
    map.set(
      branch.client_id,
      branch.name ? `${branch.name} (${branch.client_id})` : branch.client_id,
    );
  }
  return map;
};

export const getRowBranchId = (row: {branch_id?: unknown} | null | undefined): string => {
  const raw = row?.branch_id;
  if (raw == null || raw === "") {
    return UNKNOWN_BRANCH_ID;
  }
  return String(raw);
};

/**
 * Partition rows by branch_id. Order follows `branchOrder` when provided,
 * then any remaining ids alphabetically by label.
 */
export const partitionByBranchId = <T extends {branch_id?: unknown}>(
  rows: T[],
  labels: Map<string, string>,
  branchOrder?: string[],
): BranchPartition<T>[] => {
  const buckets = new Map<string, T[]>();
  for (const row of rows) {
    const id = getRowBranchId(row);
    const list = buckets.get(id);
    if (list) {
      list.push(row);
    } else {
      buckets.set(id, [row]);
    }
  }

  const labelFor = (id: string) => {
    if (id === UNKNOWN_BRANCH_ID) {
      return labels.get(UNKNOWN_BRANCH_ID) || "Unknown branch";
    }
    return labels.get(id) || id;
  };

  const orderedIds: string[] = [];
  if (branchOrder?.length) {
    for (const id of branchOrder) {
      if (buckets.has(id)) {
        orderedIds.push(id);
      }
    }
  }
  const rest = [...buckets.keys()]
    .filter((id) => !orderedIds.includes(id))
    .sort((a, b) => labelFor(a).localeCompare(labelFor(b)));

  return [...orderedIds, ...rest].map((branchId) => ({
    branchId,
    label: labelFor(branchId),
    rows: buckets.get(branchId) || [],
  }));
};
