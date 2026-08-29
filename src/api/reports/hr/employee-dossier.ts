import {Tables} from "@/api/db/tables.ts";
import type {Employee} from "@/api/model/employee.ts";
import type {EmployeeAssignmentHistory} from "@/api/model/employee.ts";
import type {EmployeeDocument} from "@/api/model/employee_document.ts";
import type {EmployeePayProfile} from "@/api/model/employee_pay_profile.ts";
import type {EmployeePerformanceNote} from "@/api/model/employee_performance_note.ts";
import type {LaborAdjustment} from "@/api/model/labor_adjustment.ts";
import type {LeaveBalance} from "@/api/model/leave_balance.ts";
import type {LeaveRequest} from "@/api/model/leave_request.ts";
import type {PayrollSnapshot} from "@/api/model/payroll_snapshot.ts";
import type {ScheduledShift} from "@/api/model/scheduled_shift.ts";
import type {TimeEntry} from "@/api/model/time_entry.ts";
import {formatDateTimeForQuery} from "@/api/reports/shared/filters.ts";
import {unwrapQueryResult} from "@/api/reports/shared/query.ts";
import type {DbClient} from "@/api/reports/shared/types.ts";
import {recordIdToString} from "@/api/reports/shared/records.ts";
import {
  fetchLaborAdjustments,
  fetchLeaveRequests,
  fetchPayProfiles,
  fetchPayrollSnapshots,
  fetchScheduledShifts,
  fetchTimeEntries,
} from "@/api/reports/labor/fetch.ts";
import type {EmployeeSummary} from "@/api/reports/hr/employees.ts";
import {getAppTimezone} from "@/lib/datetime.ts";
import {safeNumber} from "@/lib/utils.ts";
import {DateTime} from "luxon";

const personName = (row: {first_name?: string; last_name?: string; login?: string} | null | undefined) => {
  if (!row) return undefined;
  const full = `${row.first_name ?? ""} ${row.last_name ?? ""}`.trim();
  return full || row.login || undefined;
};

const entityName = (row: {name?: string} | null | undefined) => row?.name ?? undefined;

const summarizePayProfile = (row: EmployeePayProfile) => ({
  id: recordIdToString(row.id),
  effectiveFrom: row.effective_from,
  effectiveTo: row.effective_to,
  payType: row.pay_type,
  baseRate: row.base_rate,
  currency: row.currency,
  expectedWorkDays: row.expected_work_days,
  overtimePolicy: row.overtime_policy?.name,
  notes: row.notes,
});

const summarizeShift = (row: ScheduledShift) => ({
  id: recordIdToString(row.id),
  startAt: row.start_at,
  endAt: row.end_at,
  status: row.status,
  shiftName: row.shift_template?.name,
  department: entityName(row.department),
  position: entityName(row.position),
  notes: row.notes,
});

const summarizeTimeEntry = (row: TimeEntry) => ({
  id: recordIdToString(row.id),
  clockIn: row.clock_in,
  clockOut: row.clock_out,
  status: row.attendance_status,
  approvalStatus: row.approval_status,
  source: row.source,
  breakCount: Array.isArray((row as {breaks?: unknown[]}).breaks) ? (row as {breaks: unknown[]}).breaks.length : 0,
});

const summarizeLeaveBalance = (row: LeaveBalance) => ({
  id: recordIdToString(row.id),
  leaveType: row.leave_type?.name,
  year: row.year,
  accrued: row.accrued,
  used: row.used,
  pending: row.pending,
  carriedOver: row.carried_over,
  available: safeNumber(row.accrued) + safeNumber(row.carried_over) - safeNumber(row.used) - safeNumber(row.pending),
});

const summarizeLeaveRequest = (row: LeaveRequest) => ({
  id: recordIdToString(row.id),
  leaveType: row.leave_type?.name,
  startDate: row.start_date,
  endDate: row.end_date,
  days: row.days,
  status: row.status,
  reason: row.reason,
  approvedBy: personName(row.approved_by),
});

const summarizePayrollSnapshot = (row: PayrollSnapshot) => ({
  id: recordIdToString(row.id),
  periodName: row.payroll_run?.payroll_period?.name,
  runStatus: row.payroll_run?.status,
  payType: row.pay_type,
  regularHours: row.regular_hours,
  overtimeHours: row.overtime_hours,
  grossPay: row.gross_pay,
  netPay: row.net_pay,
  calculatedAt: row.calculated_at,
});

const summarizeAdjustment = (row: LaborAdjustment) => ({
  id: recordIdToString(row.id),
  type: row.type,
  amount: row.amount,
  currency: row.currency,
  description: row.description,
  effectiveDate: row.effective_date,
  status: row.status,
});

const summarizeDocument = (row: EmployeeDocument) => ({
  id: recordIdToString(row.id),
  title: row.title,
  category: row.category,
  expiresAt: row.expires_at,
  uploadedAt: row.uploaded_at,
  uploadedBy: personName(row.uploaded_by),
});

const summarizePerformanceNote = (row: EmployeePerformanceNote) => ({
  id: recordIdToString(row.id),
  type: row.type,
  title: row.title,
  severity: row.severity,
  createdAt: row.created_at,
  createdBy: personName(row.created_by),
  visibleToEmployee: row.visible_to_employee,
});

const summarizeAssignment = (row: EmployeeAssignmentHistory) => ({
  id: recordIdToString(row.id),
  department: entityName(row.department),
  position: entityName(row.position),
  costCenter: entityName(row.cost_center),
  manager: personName(row.manager),
  effectiveFrom: row.effective_from,
  effectiveTo: row.effective_to,
  reason: row.reason,
});

const dossierDateRanges = () => {
  const now = DateTime.now().setZone(getAppTimezone());
  return {
    past90Start: formatDateTimeForQuery(now.minus({days: 90}).startOf("day")),
    past365Start: formatDateTimeForQuery(now.minus({days: 365}).startOf("day")),
    now: formatDateTimeForQuery(now),
    future30End: formatDateTimeForQuery(now.plus({days: 30}).endOf("day")),
    todayEnd: formatDateTimeForQuery(now.endOf("day")),
  };
};

const fetchAssignmentHistory = async (db: DbClient, employeeId: string, limit = 20) => {
  const query = `
    SELECT * FROM ${Tables.employee_assignment_histories}
    WHERE employee = $employeeId
    ORDER BY effective_from DESC
    LIMIT ${limit}
    FETCH department, position, cost_center, manager, changed_by
  `;
  return unwrapQueryResult<EmployeeAssignmentHistory>(await db.query(query, {employeeId}));
};

const fetchLeaveBalances = async (db: DbClient, employeeId: string) => {
  const query = `
    SELECT * FROM ${Tables.leave_balances}
    WHERE employee = $employeeId
    ORDER BY year DESC, leave_type.name ASC
    FETCH leave_type
  `;
  return unwrapQueryResult<LeaveBalance>(await db.query(query, {employeeId}));
};

const fetchEmployeeDocuments = async (db: DbClient, employeeId: string, limit = 20) => {
  const query = `
    SELECT * FROM ${Tables.employee_documents}
    WHERE employee = $employeeId AND deleted_at = NONE
    ORDER BY uploaded_at DESC
    LIMIT ${limit}
    FETCH document, uploaded_by
  `;
  return unwrapQueryResult<EmployeeDocument>(await db.query(query, {employeeId}));
};

const fetchPerformanceNotes = async (db: DbClient, employeeId: string, limit = 20) => {
  const query = `
    SELECT * FROM ${Tables.employee_performance_notes}
    WHERE employee = $employeeId AND deleted_at = NONE
    ORDER BY created_at DESC
    LIMIT ${limit}
    FETCH created_by
  `;
  return unwrapQueryResult<EmployeePerformanceNote>(await db.query(query, {employeeId}));
};

export type EmployeeDossier = {
  profile: EmployeeSummary & {
    emergencyContact?: Employee["emergency_contact"];
    managerId?: string;
    managerEmployeeNumber?: string;
    departmentId?: string;
    positionId?: string;
    costCenterId?: string;
    rehireDate?: unknown;
    isRehire?: boolean;
  };
  linked: {
    currentPayProfile?: ReturnType<typeof summarizePayProfile>;
    payProfiles: ReturnType<typeof summarizePayProfile>[];
    assignmentHistory: ReturnType<typeof summarizeAssignment>[];
    upcomingShifts: ReturnType<typeof summarizeShift>[];
    recentShifts: ReturnType<typeof summarizeShift>[];
    activeTimeEntry?: ReturnType<typeof summarizeTimeEntry>;
    recentTimeEntries: ReturnType<typeof summarizeTimeEntry>[];
    leaveBalances: ReturnType<typeof summarizeLeaveBalance>[];
    leaveRequests: ReturnType<typeof summarizeLeaveRequest>[];
    payrollSnapshots: ReturnType<typeof summarizePayrollSnapshot>[];
    laborAdjustments: ReturnType<typeof summarizeAdjustment>[];
    documents: ReturnType<typeof summarizeDocument>[];
    performanceNotes: ReturnType<typeof summarizePerformanceNote>[];
  };
};

export const buildEmployeeDossier = async (
  db: DbClient,
  row: Employee,
  summary: EmployeeSummary,
): Promise<EmployeeDossier> => {
  const employeeId = recordIdToString(row.id);
  const ranges = dossierDateRanges();

  const [
    payProfiles,
    assignmentHistory,
    upcomingShifts,
    recentShifts,
    activeEntries,
    recentTimeEntries,
    leaveBalances,
    leaveRequests,
    payrollSnapshots,
    laborAdjustments,
    documents,
    performanceNotes,
  ] = await Promise.all([
    fetchPayProfiles(db, {employeeIds: [employeeId]}),
    fetchAssignmentHistory(db, employeeId),
    fetchScheduledShifts(db, {
      employeeIds: [employeeId],
      startDate: ranges.now,
      endDate: ranges.future30End,
    }),
    fetchScheduledShifts(db, {
      employeeIds: [employeeId],
      startDate: ranges.past90Start,
      endDate: ranges.todayEnd,
    }),
    fetchTimeEntries(db, {employeeIds: [employeeId], activeOnly: true, includeOpen: true}),
    fetchTimeEntries(db, {
      employeeIds: [employeeId],
      startDate: ranges.past90Start,
      endDate: ranges.todayEnd,
      includeOpen: false,
    }),
    fetchLeaveBalances(db, employeeId),
    fetchLeaveRequests(db, {
      employeeIds: [employeeId],
      startDate: ranges.past365Start,
      endDate: ranges.future30End,
    }),
    fetchPayrollSnapshots(db, {employeeIds: [employeeId]}),
    fetchLaborAdjustments(db, {
      employeeIds: [employeeId],
      startDate: ranges.past365Start,
      endDate: ranges.todayEnd,
    }),
    fetchEmployeeDocuments(db, employeeId),
    fetchPerformanceNotes(db, employeeId),
  ]);

  const summarizedPayProfiles = payProfiles.map(summarizePayProfile);
  const currentPayProfile = summarizedPayProfiles.find(profile => !profile.effectiveTo)
    ?? summarizedPayProfiles[0];

  return {
    profile: {
      ...summary,
      emergencyContact: row.emergency_contact,
      managerId: row.manager?.id ? recordIdToString(row.manager.id) : undefined,
      managerEmployeeNumber: row.manager?.employee_number,
      departmentId: row.department?.id ? recordIdToString(row.department.id) : undefined,
      positionId: row.position?.id ? recordIdToString(row.position.id) : undefined,
      costCenterId: row.cost_center?.id ? recordIdToString(row.cost_center.id) : undefined,
      rehireDate: row.rehire_date,
      isRehire: row.is_rehire,
    },
    linked: {
      currentPayProfile,
      payProfiles: summarizedPayProfiles.slice(0, 10),
      assignmentHistory: assignmentHistory.map(summarizeAssignment),
      upcomingShifts: upcomingShifts.map(summarizeShift).slice(0, 20),
      recentShifts: recentShifts.map(summarizeShift).slice(-20),
      activeTimeEntry: activeEntries[0] ? summarizeTimeEntry(activeEntries[0]) : undefined,
      recentTimeEntries: recentTimeEntries.map(summarizeTimeEntry).slice(-30),
      leaveBalances: leaveBalances.map(summarizeLeaveBalance),
      leaveRequests: leaveRequests.map(summarizeLeaveRequest).slice(0, 20),
      payrollSnapshots: payrollSnapshots.map(summarizePayrollSnapshot).slice(0, 6),
      laborAdjustments: laborAdjustments.map(summarizeAdjustment).slice(0, 20),
      documents: documents.map(summarizeDocument),
      performanceNotes: performanceNotes.map(summarizePerformanceNote),
    },
  };
};
