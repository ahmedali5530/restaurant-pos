import {Tables} from "@/api/db/tables.ts";
import {unwrapQueryResult} from "@/api/reports/shared/query.ts";
import type {DateRangeFilter, DbClient} from "@/api/reports/shared/types.ts";
import {recordIdToString} from "@/api/reports/shared/records.ts";
import type {LeaveRequest} from "@/api/model/leave_request.ts";
import {fetchLeaveRequests} from "@/api/reports/labor/fetch.ts";

type ListOptions = {search?: string; limit?: number};

const normalizeSearch = (search?: string) => search?.trim().toLowerCase() || "";
const matchesSearch = (haystack: string, search: string) =>
  !search || haystack.toLowerCase().includes(search);

const listNamedEntities = async (
  db: DbClient,
  table: string,
  options: ListOptions = {},
) => {
  const limit = options.limit ?? 50;
  const search = normalizeSearch(options.search);
  const query = `
    SELECT id, name, code FROM ${table}
    WHERE deleted_at = NONE
    ORDER BY name ASC
    LIMIT ${limit}
  `;
  const rows = unwrapQueryResult<{id: unknown; name?: string; code?: string}>(await db.query(query));
  return rows
    .map(row => ({
      id: recordIdToString(row.id),
      name: row.name ?? "Unknown",
      code: row.code ?? undefined,
    }))
    .filter(row => matchesSearch(row.name, search) || matchesSearch(row.code ?? "", search));
};

export const listDepartments = (db: DbClient, options: ListOptions = {}) =>
  listNamedEntities(db, Tables.departments, options);

export const listPositions = (db: DbClient, options: ListOptions = {}) =>
  listNamedEntities(db, Tables.positions, options);

export const listCostCenters = (db: DbClient, options: ListOptions = {}) =>
  listNamedEntities(db, Tables.cost_centers, options);

export const listHrLeaveRequests = async (
  db: DbClient,
  options: DateRangeFilter & {
    employeeNumber?: string;
    employeeId?: string;
    status?: string;
    limit?: number;
  } = {},
) => {
  const {limit = 50, employeeNumber, employeeId, status, ...dateRange} = options;
  let employeeIds: string[] = [];

  if (employeeId) {
    employeeIds = [employeeId];
  } else if (employeeNumber) {
    const rows = unwrapQueryResult<{id: unknown}>(await db.query(
      `SELECT id FROM ${Tables.employees} WHERE employee_number = $num AND deleted_at = NONE LIMIT 1`,
      {num: employeeNumber},
    ));
    if (rows[0]?.id) {
      employeeIds = [recordIdToString(rows[0].id)];
    }
  }

  const requests = await fetchLeaveRequests(db, {
    ...dateRange,
    employeeIds,
    statuses: status ? [status] : undefined,
  });

  return {
    count: Math.min(requests.length, limit),
    leaveRequests: requests.slice(0, limit).map((row: LeaveRequest) => ({
      id: recordIdToString(row.id),
      employeeNumber: row.employee?.employee_number,
      employeeName: `${row.employee?.first_name ?? ""} ${row.employee?.last_name ?? ""}`.trim(),
      leaveType: row.leave_type?.name,
      startDate: row.start_date,
      endDate: row.end_date,
      days: row.days,
      status: row.status,
      reason: row.reason,
    })),
  };
};
