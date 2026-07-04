import {Tables} from "@/api/db/tables.ts";
import type {Order} from "@/api/model/order.ts";
import type {User} from "@/api/model/user.ts";
import {recordIdToString} from "@/api/reports/shared/records.ts";
import {buildCreatedAtDateConditions, unwrapQueryResult} from "@/api/reports/shared/query.ts";
import type {DateRangeFilter, DbClient} from "@/api/reports/shared/types.ts";
import {safeNumber} from "@/lib/utils.ts";

interface TipDistributionSettings {
  roles?: Array<{role_id: string; weight: number}>;
  users?: Array<{user_id: string; weight: number}>;
}

export interface GetTipsOptions extends DateRangeFilter {
  shiftId?: string;
  /** When true (default), compute each staff member's projected share using tip_distribution weights. */
  includeProjectedDistribution?: boolean;
}

export interface TipStaffRow {
  userId: string;
  name: string;
  role?: string;
  shift?: string;
  amount: number;
  weight?: number;
}

const formatUserName = (user?: {first_name?: string; last_name?: string; login?: string}): string => {
  if (!user) {
    return "Unknown";
  }
  const name = `${user.first_name ?? ""} ${user.last_name ?? ""}`.trim();
  return name || user.login || "Unknown";
};

const getShiftId = (user?: User | null): string => {
  if (!user) {
    return "";
  }
  const shift = user.user_shift as {id?: unknown} | string | undefined;
  if (!shift) {
    return "";
  }
  if (typeof shift === "object" && shift !== null && "id" in shift) {
    return recordIdToString(shift.id);
  }
  return recordIdToString(shift);
};

const getRoleId = (user?: User | null): string => {
  if (!user) {
    return "";
  }
  const role = user.user_role as {id?: unknown} | string | undefined;
  if (!role) {
    return "";
  }
  if (typeof role === "object" && role !== null && "id" in role) {
    return recordIdToString(role.id);
  }
  return recordIdToString(role);
};

const fetchSavedDistributions = async (
  db: DbClient,
  options: DateRangeFilter & {shiftId?: string},
) => {
  const conditions: string[] = [];
  const params: Record<string, string> = {};
  const dbFormat = import.meta.env.VITE_DB_DATABASE_FORMAT as string;

  if (options.startDate) {
    conditions.push(`time::format(from_at, "${dbFormat}") >= $startDate`);
    params.startDate = options.startDate;
  }
  if (options.endDate) {
    conditions.push(`time::format(from_at, "${dbFormat}") <= $endDate`);
    params.endDate = options.endDate;
  }
  if (options.shiftId) {
    conditions.push("shift = $shiftId");
    params.shiftId = options.shiftId;
  }

  const query = `
    SELECT * FROM ${Tables.tip_distributions}
    ${conditions.length ? `WHERE ${conditions.join(" AND ")}` : ""}
    FETCH shift, users, users.user
  `;

  const distributions = unwrapQueryResult<{
    total_tips?: number;
    users?: Array<{user?: {first_name?: string; last_name?: string}; amount?: number}>;
  }>(await db.query(query, params));

  const tipsByUser = new Map<string, number>();
  distributions.forEach(distribution => {
    (distribution.users || []).forEach(share => {
      const name = formatUserName(share?.user);
      tipsByUser.set(name, (tipsByUser.get(name) || 0) + safeNumber(share?.amount));
    });
  });

  return {
    totalTips: distributions.reduce((sum, d) => sum + safeNumber(d.total_tips), 0),
    distributionCount: distributions.length,
    tipsByUser: Array.from(tipsByUser.entries())
      .map(([name, amount]) => ({name, amount}))
      .sort((a, b) => b.amount - a.amount),
  };
};

const fetchTipDistributionSettings = async (db: DbClient): Promise<TipDistributionSettings> => {
  const result = await db.query(
    `SELECT values FROM ${Tables.settings} WHERE key = $key AND is_global = true LIMIT 1`,
    {key: "tip_distribution"},
  );
  const rows = unwrapQueryResult<{values?: TipDistributionSettings}>(result);
  return rows[0]?.values ?? {};
};

const fetchActiveUsers = async (db: DbClient): Promise<User[]> => {
  return unwrapQueryResult<User>(
    await db.query(
      `SELECT * FROM ${Tables.users} WHERE deleted_at = NONE FETCH user_role, user_shift`,
    ),
  );
};

const computeProjectedShares = (
  tipsPool: number,
  users: User[],
  settings: TipDistributionSettings,
  shiftId?: string,
): TipStaffRow[] => {
  const normalizedShiftId = shiftId ? recordIdToString(shiftId) : "";
  const roleWeights = new Map(
    (settings.roles || []).map(item => [recordIdToString(item.role_id), safeNumber(item.weight)]),
  );
  const userWeights = new Map(
    (settings.users || []).map(item => [recordIdToString(item.user_id), safeNumber(item.weight)]),
  );

  let eligibleUsers = users;
  if (normalizedShiftId) {
    eligibleUsers = users.filter(user => getShiftId(user) === normalizedShiftId);
  }

  const rows = eligibleUsers.map(user => {
    const userId = recordIdToString(user.id);
    const roleId = getRoleId(user);
    const weight = userWeights.has(userId)
      ? safeNumber(userWeights.get(userId))
      : safeNumber(roleWeights.get(roleId));

    return {
      userId,
      name: formatUserName(user),
      role: (user.user_role as {name?: string} | undefined)?.name,
      shift: (user.user_shift as {name?: string} | undefined)?.name,
      weight,
      amount: 0,
    };
  }).filter(row => row.weight > 0);

  if (rows.length === 0) {
    return [];
  }

  const totalWeight = rows.reduce((sum, row) => sum + row.weight, 0);
  if (totalWeight <= 0) {
    return [];
  }

  return rows
    .map(row => ({
      ...row,
      amount: safeNumber((tipsPool * row.weight) / totalWeight),
    }))
    .sort((a, b) => b.amount - a.amount);
};

export const getTips = async (db: DbClient, options: GetTipsOptions = {}) => {
  const includeProjectedDistribution = options.includeProjectedDistribution !== false;
  const normalizedShiftId = options.shiftId ? recordIdToString(options.shiftId) : undefined;

  const conditions = ["status = 'Paid'", "tip_amount > 0"];
  const params: Record<string, string> = {};
  const {conditions: dateConditions, params: dateParams} = buildCreatedAtDateConditions(options);
  conditions.push(...dateConditions);
  Object.assign(params, dateParams);

  const orders = unwrapQueryResult<Order>(
    await db.query(
      `
        SELECT * FROM ${Tables.orders}
        WHERE ${conditions.join(" AND ")}
        FETCH cashier, cashier.user_role, cashier.user_shift, user
      `,
      params,
    ),
  );

  const ordersInScope = normalizedShiftId
    ? orders.filter(order => getShiftId(order.cashier as User) === normalizedShiftId)
    : orders;

  const tipsCollected = ordersInScope.reduce((sum, order) => sum + safeNumber(order.tip_amount), 0);

  const tipsByCashier = new Map<string, TipStaffRow>();
  ordersInScope.forEach(order => {
    const cashier = order.cashier as User | undefined;
    const userId = recordIdToString(cashier?.id ?? order.user);
    const existing = tipsByCashier.get(userId) || {
      userId,
      name: formatUserName(cashier),
      role: (cashier?.user_role as {name?: string} | undefined)?.name,
      shift: (cashier?.user_shift as {name?: string} | undefined)?.name,
      amount: 0,
    };
    existing.amount += safeNumber(order.tip_amount);
    tipsByCashier.set(userId, existing);
  });

  const savedDistributions = await fetchSavedDistributions(db, {
    startDate: options.startDate,
    endDate: options.endDate,
    shiftId: normalizedShiftId,
  });

  let projectedShares: TipStaffRow[] = [];
  let distributionNote: string | undefined;

  if (includeProjectedDistribution && tipsCollected > 0) {
    const [settings, users] = await Promise.all([
      fetchTipDistributionSettings(db),
      fetchActiveUsers(db),
    ]);

    projectedShares = computeProjectedShares(tipsCollected, users, settings, normalizedShiftId);

    if (projectedShares.length === 0) {
      distributionNote = normalizedShiftId
        ? "No tip distribution weights configured for staff on this shift."
        : "No tip distribution weights configured. Set role/user weights in Settings → Tip Distribution.";
    }
  }

  return {
    tipsCollected,
    orderCountWithTips: ordersInScope.length,
    tipsByCashier: Array.from(tipsByCashier.values()).sort((a, b) => b.amount - a.amount),
    savedDistributions,
    projectedShares,
    shiftId: normalizedShiftId,
    distributionNote,
    dateRange: {
      startDate: options.startDate,
      endDate: options.endDate,
    },
  };
};
