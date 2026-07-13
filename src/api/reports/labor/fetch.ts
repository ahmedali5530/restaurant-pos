import {Tables} from '@/api/db/tables.ts';
import type {Employee} from '@/api/model/employee.ts';
import type {EmployeePayProfile} from '@/api/model/employee_pay_profile.ts';
import type {LeaveRequest} from '@/api/model/leave_request.ts';
import type {PayrollSnapshot} from '@/api/model/payroll_snapshot.ts';
import type {PublicHoliday} from '@/api/model/public_holiday.ts';
import type {ScheduledShift} from '@/api/model/scheduled_shift.ts';
import type {TimeEntry} from '@/api/model/time_entry.ts';
import type {LaborAdjustment} from '@/api/model/labor_adjustment.ts';
import type {LaborPayRule} from '@/api/model/labor_pay_rule.ts';
import {buildCreatedAtDateConditions, buildOrConditions, buildStringInsideCondition, unwrapQueryResult} from '@/api/reports/shared/query.ts';
import type {DateRangeFilter, DbClient} from '@/api/reports/shared/types.ts';

const TIME_ENTRY_FETCHES = [
  'user',
  'employee',
  'employee.department',
  'employee.position',
  'employee.cost_center',
  'scheduled_shift',
  'breaks',
];

const EMPLOYEE_FETCHES = [
  'user',
  'department',
  'position',
  'cost_center',
  'manager',
];

const SCHEDULED_SHIFT_FETCHES = [
  'employee',
  'employee.department',
  'shift_template',
  'department',
  'position',
  'cost_center',
  'work_schedule',
];

const PAYROLL_SNAPSHOT_FETCHES = [
  'employee',
  'employee.department',
  'payroll_run',
  'payroll_run.payroll_period',
];

const LEAVE_REQUEST_FETCHES = [
  'employee',
  'leave_type',
  'approved_by',
];

export interface FetchTimeEntriesOptions extends DateRangeFilter {
  employeeIds?: string[];
  activeOnly?: boolean;
  includeOpen?: boolean;
}

export interface FetchEmployeesOptions {
  employeeIds?: string[];
  activeOnly?: boolean;
}

export interface FetchPayProfilesOptions extends DateRangeFilter {
  employeeIds?: string[];
}

export interface FetchScheduledShiftsOptions extends DateRangeFilter {
  employeeIds?: string[];
  dateField?: 'start_at' | 'end_at';
}

export interface FetchPayrollSnapshotsOptions extends DateRangeFilter {
  employeeIds?: string[];
  payrollRunId?: string;
}

export interface FetchLeaveRequestsOptions extends DateRangeFilter {
  employeeIds?: string[];
  statuses?: string[];
}

const buildDateFieldConditions = (
  options: DateRangeFilter,
  field: string,
): {conditions: string[]; params: Record<string, string>} =>
  buildCreatedAtDateConditions(options, field);

export const fetchTimeEntries = async (
  db: DbClient,
  options: FetchTimeEntriesOptions = {},
): Promise<TimeEntry[]> => {
  const {
    startDate,
    endDate,
    employeeIds = [],
    activeOnly = false,
    includeOpen = true,
  } = options;

  const conditions: string[] = [];
  const params: Record<string, string> = {};

  if (activeOnly) {
    conditions.push('clock_out = NONE');
  } else if (!includeOpen) {
    conditions.push('clock_out != NONE');
  }

  const dateFilter = buildDateFieldConditions({startDate, endDate}, 'clock_in');
  conditions.push(...dateFilter.conditions);
  Object.assign(params, dateFilter.params);

  const employeeFilter = buildOrConditions('employee', employeeIds, 'employee');
  if (employeeFilter.condition) {
    conditions.push(employeeFilter.condition);
    Object.assign(params, employeeFilter.params);
  }

  const query = `
    SELECT * FROM ${Tables.time_entries}
    ${conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''}
    ORDER BY clock_in ASC
    FETCH ${TIME_ENTRY_FETCHES.join(', ')}
  `;

  const result = await db.query(query, params);
  return unwrapQueryResult<TimeEntry>(result);
};

export const fetchEmployees = async (
  db: DbClient,
  options: FetchEmployeesOptions = {},
): Promise<Employee[]> => {
  const {employeeIds = [], activeOnly = true} = options;
  const conditions: string[] = [];
  const params: Record<string, string> = {};

  if (activeOnly) {
    conditions.push('employment_status = "active"');
    conditions.push('deleted_at = NONE');
  }

  const employeeFilter = buildOrConditions('id', employeeIds, 'employee');
  if (employeeFilter.condition) {
    conditions.push(employeeFilter.condition);
    Object.assign(params, employeeFilter.params);
  }

  const query = `
    SELECT * FROM ${Tables.employees}
    ${conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''}
    ORDER BY last_name ASC, first_name ASC
    FETCH ${EMPLOYEE_FETCHES.join(', ')}
  `;

  const result = await db.query(query, params);
  return unwrapQueryResult<Employee>(result);
};

export const fetchPayProfiles = async (
  db: DbClient,
  options: FetchPayProfilesOptions = {},
): Promise<EmployeePayProfile[]> => {
  const {startDate, endDate, employeeIds = []} = options;
  const conditions: string[] = [];
  const params: Record<string, string> = {};

  if (startDate) {
    conditions.push(`(effective_to = NONE OR time::format(effective_to, "${import.meta.env.VITE_DB_DATABASE_FORMAT}") >= $startDate)`);
    params.startDate = startDate;
  }

  if (endDate) {
    conditions.push(`time::format(effective_from, "${import.meta.env.VITE_DB_DATABASE_FORMAT}") <= $endDate`);
    params.endDate = endDate;
  }

  const employeeFilter = buildOrConditions('employee', employeeIds, 'employee');
  if (employeeFilter.condition) {
    conditions.push(employeeFilter.condition);
    Object.assign(params, employeeFilter.params);
  }

  const query = `
    SELECT * FROM ${Tables.employee_pay_profiles}
    ${conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''}
    ORDER BY effective_from DESC
    FETCH employee, overtime_policy, holiday_policy, night_policy, weekend_policy
  `;

  const result = await db.query(query, params);
  return unwrapQueryResult<EmployeePayProfile>(result);
};

export const fetchScheduledShifts = async (
  db: DbClient,
  options: FetchScheduledShiftsOptions = {},
): Promise<ScheduledShift[]> => {
  const {
    startDate,
    endDate,
    employeeIds = [],
    dateField = 'start_at',
  } = options;

  const conditions: string[] = [];
  const params: Record<string, string> = {};

  const dateFilter = buildDateFieldConditions({startDate, endDate}, dateField);
  conditions.push(...dateFilter.conditions);
  Object.assign(params, dateFilter.params);

  const employeeFilter = buildOrConditions('employee', employeeIds, 'employee');
  if (employeeFilter.condition) {
    conditions.push(employeeFilter.condition);
    Object.assign(params, employeeFilter.params);
  }

  const query = `
    SELECT * FROM ${Tables.scheduled_shifts}
    ${conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''}
    ORDER BY start_at ASC
    FETCH ${SCHEDULED_SHIFT_FETCHES.join(', ')}
  `;

  const result = await db.query(query, params);
  return unwrapQueryResult<ScheduledShift>(result);
};

export const fetchPayrollSnapshots = async (
  db: DbClient,
  options: FetchPayrollSnapshotsOptions = {},
): Promise<PayrollSnapshot[]> => {
  const {startDate, endDate, employeeIds = [], payrollRunId} = options;
  const conditions: string[] = [];
  const params: Record<string, string> = {};

  if (payrollRunId) {
    conditions.push('payroll_run = $payrollRunId');
    params.payrollRunId = payrollRunId;
  }

  if (startDate) {
    conditions.push(`payroll_run.payroll_period.start_date >= <datetime>$periodStart`);
    params.periodStart = startDate;
  }

  if (endDate) {
    conditions.push(`payroll_run.payroll_period.end_date <= <datetime>$periodEnd`);
    params.periodEnd = endDate;
  }

  const employeeFilter = buildOrConditions('employee', employeeIds, 'employee');
  if (employeeFilter.condition) {
    conditions.push(employeeFilter.condition);
    Object.assign(params, employeeFilter.params);
  }

  const query = `
    SELECT * FROM ${Tables.payroll_snapshots}
    ${conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''}
    ORDER BY calculated_at DESC
    FETCH ${PAYROLL_SNAPSHOT_FETCHES.join(', ')}
  `;

  const result = await db.query(query, params);
  return unwrapQueryResult<PayrollSnapshot>(result);
};

export const fetchLeaveRequests = async (
  db: DbClient,
  options: FetchLeaveRequestsOptions = {},
): Promise<LeaveRequest[]> => {
  const {startDate, endDate, employeeIds = [], statuses = []} = options;
  const conditions: string[] = [];
  const params: Record<string, string> = {};

  const dateFilter = buildDateFieldConditions({startDate, endDate}, 'start_date');
  conditions.push(...dateFilter.conditions);
  Object.assign(params, dateFilter.params);

  const employeeFilter = buildOrConditions('employee', employeeIds, 'employee');
  if (employeeFilter.condition) {
    conditions.push(employeeFilter.condition);
    Object.assign(params, employeeFilter.params);
  }

  if (statuses.length > 0) {
    const statusFilter = buildStringInsideCondition('status', statuses, 'statuses');
    if (statusFilter.condition) {
      conditions.push(statusFilter.condition);
      Object.assign(params, statusFilter.params);
    }
  }

  const query = `
    SELECT * FROM ${Tables.leave_requests}
    ${conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''}
    ORDER BY start_date DESC
    FETCH ${LEAVE_REQUEST_FETCHES.join(', ')}
  `;

  const result = await db.query(query, params);
  return unwrapQueryResult<LeaveRequest>(result);
};

export const fetchPublicHolidays = async (
  db: DbClient,
  options: DateRangeFilter = {},
): Promise<PublicHoliday[]> => {
  const {conditions, params} = buildDateFieldConditions(options, 'date');
  const query = `
    SELECT * FROM ${Tables.public_holidays}
    WHERE is_active = true AND deleted_at = NONE
    ${conditions.length ? `AND ${conditions.join(' AND ')}` : ''}
    ORDER BY date ASC
    FETCH labor_policy
  `;
  const result = await db.query(query, params);
  return unwrapQueryResult<PublicHoliday>(result);
};

export const fetchLaborAdjustments = async (
  db: DbClient,
  options: DateRangeFilter & {employeeIds?: string[]} = {},
): Promise<LaborAdjustment[]> => {
  const {employeeIds = [], ...dateRange} = options;
  const conditions: string[] = [];
  const params: Record<string, string> = {};

  const dateFilter = buildDateFieldConditions(dateRange, 'effective_date');
  conditions.push(...dateFilter.conditions);
  Object.assign(params, dateFilter.params);

  const employeeFilter = buildOrConditions('employee', employeeIds, 'employee');
  if (employeeFilter.condition) {
    conditions.push(employeeFilter.condition);
    Object.assign(params, employeeFilter.params);
  }

  const query = `
    SELECT * FROM ${Tables.labor_adjustments}
    ${conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''}
    FETCH employee
  `;
  const result = await db.query(query, params);
  return unwrapQueryResult<LaborAdjustment>(result);
};

export const fetchLaborPayRules = async (db: DbClient): Promise<LaborPayRule[]> => {
  const query = `
    SELECT * FROM ${Tables.labor_pay_rules}
    WHERE is_active = true AND deleted_at = NONE
    ORDER BY priority ASC
  `;
  const result = await db.query(query);
  return unwrapQueryResult<LaborPayRule>(result);
};

export const fetchActiveBreakCount = async (db: DbClient): Promise<number> => {
  const query = `
    SELECT count() AS count FROM ${Tables.time_entry_breaks}
    WHERE end_at = NONE
    GROUP ALL
  `;
  const result = await db.query(query);
  const rows = unwrapQueryResult<{count: number}>(result);
  return rows[0]?.count ?? 0;
};

export const fetchPendingApprovalCount = async (db: DbClient): Promise<number> => {
  const query = `
    SELECT count() AS count FROM ${Tables.time_entries}
    WHERE approval_status = 'pending'
    GROUP ALL
  `;
  const result = await db.query(query);
  const rows = unwrapQueryResult<{count: number}>(result);
  return rows[0]?.count ?? 0;
};
