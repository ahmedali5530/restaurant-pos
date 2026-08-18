import type {Employee} from '@/api/model/employee.ts';
import type {EmployeePayProfile} from '@/api/model/employee_pay_profile.ts';
import type {PayrollSnapshot} from '@/api/model/payroll_snapshot.ts';
import type {ScheduledShift} from '@/api/model/scheduled_shift.ts';
import type {TimeEntry} from '@/api/model/time_entry.ts';
import type {LeaveRequest} from '@/api/model/leave_request.ts';
import type {PublicHoliday} from '@/api/model/public_holiday.ts';
import type {LaborAdjustment} from '@/api/model/labor_adjustment.ts';
import type {LaborPayRule} from '@/api/model/labor_pay_rule.ts';
import {recordToString} from '@/api/reports/shared/records.ts';
import type {DateRangeFilter} from '@/api/reports/shared/types.ts';
import {calculateEmployeeLabor} from '@/lib/labor-engine/calculator.ts';
import {resolveEffectivePayProfile} from '@/lib/labor-engine/pay-profile.resolver.ts';
import type {LaborCalculationResult, TimeEntryWithBreaks} from '@/lib/labor-engine/types.ts';
import {getAppTimezone, toJsDate, toLuxonDateTime} from '@/lib/datetime.ts';
import {safeNumber} from '@/lib/utils.ts';
import {DateTime} from 'luxon';
import type {
  AbsenceRow,
  AttendanceReportRow,
  EmployeeLaborRow,
  GroupedLaborRow,
  HolidayCostRow,
  LaborCostResult,
  LaborForecastPoint,
  LaborReportContext,
  LaborTrendPoint,
  LateArrivalRow,
  LeaveReportRow,
  ManagerApprovalRow,
  OvertimeReportRow,
  PayrollDetailRow,
  PayrollSummaryResult,
  ScheduleRosterEmployeeRow,
  ScheduleRosterResult,
  ScheduledVsActualRow,
} from '@/api/reports/labor/shared/types.ts';

const roundMoney = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

const employeeName = (employee: Employee): string =>
  `${employee.first_name || ''} ${employee.last_name || ''}`.trim() || employee.employee_number || 'Unknown';

const employeeId = (employee: Employee): string => recordToString(employee.id);

const shiftHours = (shift: ScheduledShift): number => {
  const start = toLuxonDateTime(shift.start_at);
  const end = toLuxonDateTime(shift.end_at);
  return roundMoney(Math.max(0, end.diff(start, 'hours').hours));
};

const entryHours = (entry: TimeEntry): number => {
  if (entry.duration_seconds != null) {
    return roundMoney(safeNumber(entry.duration_seconds) / 3600);
  }
  if (!entry.clock_out) {
    const start = toLuxonDateTime(entry.clock_in);
    return roundMoney(Math.max(0, DateTime.now().diff(start, 'hours').hours));
  }
  const start = toLuxonDateTime(entry.clock_in);
  const end = toLuxonDateTime(entry.clock_out);
  return roundMoney(Math.max(0, end.diff(start, 'hours').hours));
};

const sumCostResult = (rows: EmployeeLaborRow[]): LaborCostResult => {
  const totals = rows.reduce(
    (acc, row) => ({
      totalCost: acc.totalCost + row.totalCost,
      totalHours: acc.totalHours + row.totalHours,
      regularHours: acc.regularHours + row.regularHours,
      overtimeHours: acc.overtimeHours + row.overtimeHours,
      doubleTimeHours: acc.doubleTimeHours + row.doubleTimeHours,
      regularPay: acc.regularPay + row.cost.regularPay,
      overtimePay: acc.overtimePay + row.cost.overtimePay,
      premiumPay: acc.premiumPay + row.cost.premiumPay,
      grossPay: acc.grossPay + row.cost.grossPay,
    }),
    {
      totalCost: 0,
      totalHours: 0,
      regularHours: 0,
      overtimeHours: 0,
      doubleTimeHours: 0,
      regularPay: 0,
      overtimePay: 0,
      premiumPay: 0,
      grossPay: 0,
    },
  );

  return {
    period: 'total',
    totalCost: roundMoney(totals.totalCost),
    totalHours: roundMoney(totals.totalHours),
    regularHours: roundMoney(totals.regularHours),
    overtimeHours: roundMoney(totals.overtimeHours),
    doubleTimeHours: roundMoney(totals.doubleTimeHours),
    employeeCount: rows.length,
    regularPay: roundMoney(totals.regularPay),
    overtimePay: roundMoney(totals.overtimePay),
    premiumPay: roundMoney(totals.premiumPay),
    grossPay: roundMoney(totals.grossPay),
  };
};

export interface BuildLaborContextInput {
  employees: Employee[];
  timeEntries: TimeEntry[];
  payProfiles: EmployeePayProfile[];
  holidays: PublicHoliday[];
  adjustments: LaborAdjustment[];
  rules: LaborPayRule[];
  periodStart: string;
  periodEnd: string;
}

export const buildLaborReportContext = ({
  employees,
  timeEntries,
  payProfiles,
  holidays,
  adjustments,
  rules,
  periodStart,
  periodEnd,
}: BuildLaborContextInput): LaborReportContext => {
  const entriesByEmployee = new Map<string, TimeEntryWithBreaks[]>();
  for (const entry of timeEntries) {
    const empRef = entry.employee ?? entry.user;
    const key = recordToString(typeof empRef === 'object' ? empRef?.id ?? empRef : empRef);
    if (!key) continue;
    const list = entriesByEmployee.get(key) ?? [];
    list.push(entry as TimeEntryWithBreaks);
    entriesByEmployee.set(key, list);
  }

  const calculations: LaborCalculationResult[] = [];
  const employeeRows: EmployeeLaborRow[] = [];

  for (const employee of employees) {
    const id = employeeId(employee);
    const entries = entriesByEmployee.get(id) ?? [];
    if (entries.length === 0) continue;

    const midPeriod = toJsDate(periodEnd);
    const payProfile = resolveEffectivePayProfile(employee, midPeriod, payProfiles);
    if (!payProfile) continue;

    const employeeAdjustments = adjustments.filter(
      adj => recordToString(adj.employee?.id ?? adj.employee) === id,
    );

    const result = calculateEmployeeLabor({
      employee,
      payProfile,
      timeEntries: entries,
      rules,
      holidays,
      periodStart,
      periodEnd,
      adjustments: employeeAdjustments,
    });

    calculations.push(result);
    employeeRows.push({
      employeeId: id,
      employeeNumber: employee.employee_number,
      employeeName: employeeName(employee),
      departmentId: recordToString(employee.department?.id ?? employee.department),
      departmentName: employee.department?.name,
      costCenterId: recordToString(employee.cost_center?.id ?? employee.cost_center),
      costCenterName: employee.cost_center?.name,
      positionName: employee.position?.name,
      totalHours: result.hours.totalHours,
      regularHours: result.hours.regularHours,
      overtimeHours: result.hours.overtimeHours,
      doubleTimeHours: result.hours.doubleTimeHours,
      totalCost: result.cost.grossPay,
      hours: result.hours,
      cost: result.cost,
    });
  }

  return {calculations, employeeRows};
};

const bucketByPeriod = (
  rows: EmployeeLaborRow[],
  granularity: 'daily' | 'weekly' | 'monthly',
): LaborCostResult[] => {
  const periodTotals = new Map<string, {
    totalCost: number;
    totalHours: number;
    regularHours: number;
    overtimeHours: number;
    doubleTimeHours: number;
    employees: Set<string>;
    regularPay: number;
    overtimePay: number;
    premiumPay: number;
    grossPay: number;
  }>();

  for (const row of rows) {
    for (const bucket of row.hours.buckets) {
      const period =
        granularity === 'daily'
          ? bucket.date
          : granularity === 'weekly'
            ? toLuxonDateTime(bucket.date).startOf('week').toFormat('yyyy-MM-dd')
            : toLuxonDateTime(bucket.date).startOf('month').toFormat('yyyy-MM');

      const hoursShare = bucket.hours / Math.max(row.totalHours, 0.0001);
      const current = periodTotals.get(period) ?? {
        totalCost: 0,
        totalHours: 0,
        regularHours: 0,
        overtimeHours: 0,
        doubleTimeHours: 0,
        employees: new Set<string>(),
        regularPay: 0,
        overtimePay: 0,
        premiumPay: 0,
        grossPay: 0,
      };

      current.totalHours += bucket.hours;
      current.regularHours += bucket.type === 'regular' ? bucket.hours : 0;
      current.overtimeHours += bucket.type === 'overtime' ? bucket.hours : 0;
      current.doubleTimeHours += bucket.type === 'double_time' ? bucket.hours : 0;
      current.totalCost += row.totalCost * hoursShare;
      current.regularPay += row.cost.regularPay * hoursShare;
      current.overtimePay += row.cost.overtimePay * hoursShare;
      current.premiumPay += row.cost.premiumPay * hoursShare;
      current.grossPay += row.cost.grossPay * hoursShare;
      current.employees.add(row.employeeId);
      periodTotals.set(period, current);
    }
  }

  return Array.from(periodTotals.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([period, totals]) => ({
      period,
      label: period,
      totalCost: roundMoney(totals.totalCost),
      totalHours: roundMoney(totals.totalHours),
      regularHours: roundMoney(totals.regularHours),
      overtimeHours: roundMoney(totals.overtimeHours),
      doubleTimeHours: roundMoney(totals.doubleTimeHours),
      employeeCount: totals.employees.size,
      regularPay: roundMoney(totals.regularPay),
      overtimePay: roundMoney(totals.overtimePay),
      premiumPay: roundMoney(totals.premiumPay),
      grossPay: roundMoney(totals.grossPay),
    }));
};

export const aggregateDailyLaborCost = (context: LaborReportContext): LaborCostResult[] =>
  bucketByPeriod(context.employeeRows, 'daily');

export const aggregateWeeklyLaborCost = (context: LaborReportContext): LaborCostResult[] =>
  bucketByPeriod(context.employeeRows, 'weekly');

export const aggregateMonthlyLaborCost = (context: LaborReportContext): LaborCostResult[] =>
  bucketByPeriod(context.employeeRows, 'monthly');

export const aggregateEmployeeLaborCost = (context: LaborReportContext): EmployeeLaborRow[] =>
  [...context.employeeRows].sort((a, b) => b.totalCost - a.totalCost);

export const aggregateDepartmentLaborCost = (context: LaborReportContext): GroupedLaborRow[] => {
  const map = new Map<string, GroupedLaborRow>();
  for (const row of context.employeeRows) {
    const groupId = row.departmentId || 'unassigned';
    const groupName = row.departmentName || 'Unassigned';
    const current = map.get(groupId) ?? {
      groupId,
      groupName,
      employeeCount: 0,
      totalHours: 0,
      regularHours: 0,
      overtimeHours: 0,
      totalCost: 0,
    };
    current.employeeCount += 1;
    current.totalHours += row.totalHours;
    current.regularHours += row.regularHours;
    current.overtimeHours += row.overtimeHours;
    current.totalCost += row.totalCost;
    map.set(groupId, current);
  }
  return Array.from(map.values()).sort((a, b) => b.totalCost - a.totalCost);
};

export const aggregateCostCenterLaborCost = (context: LaborReportContext): GroupedLaborRow[] => {
  const map = new Map<string, GroupedLaborRow>();
  for (const row of context.employeeRows) {
    const groupId = row.costCenterId || 'unassigned';
    const groupName = row.costCenterName || 'Unassigned';
    const current = map.get(groupId) ?? {
      groupId,
      groupName,
      employeeCount: 0,
      totalHours: 0,
      regularHours: 0,
      overtimeHours: 0,
      totalCost: 0,
    };
    current.employeeCount += 1;
    current.totalHours += row.totalHours;
    current.regularHours += row.regularHours;
    current.overtimeHours += row.overtimeHours;
    current.totalCost += row.totalCost;
    map.set(groupId, current);
  }
  return Array.from(map.values()).sort((a, b) => b.totalCost - a.totalCost);
};

export const aggregateOvertimeReport = (context: LaborReportContext): OvertimeReportRow[] =>
  context.employeeRows
    .filter(row => row.overtimeHours > 0 || row.doubleTimeHours > 0)
    .map(row => ({
      employeeId: row.employeeId,
      employeeName: row.employeeName,
      departmentName: row.departmentName,
      regularHours: row.regularHours,
      overtimeHours: row.overtimeHours,
      doubleTimeHours: row.doubleTimeHours,
      overtimePay: roundMoney(row.cost.overtimePay + row.cost.doubleTimePay),
      totalCost: row.totalCost,
    }))
    .sort((a, b) => b.overtimeHours - a.overtimeHours);

export const aggregateAttendanceReport = (
  scheduledShifts: ScheduledShift[],
  timeEntries: TimeEntry[],
): AttendanceReportRow[] => {
  const byEmployee = new Map<string, AttendanceReportRow>();

  for (const shift of scheduledShifts) {
    const emp = shift.employee;
    if (!emp) continue;
    const id = employeeId(emp);
    const current = byEmployee.get(id) ?? {
      employeeId: id,
      employeeName: employeeName(emp),
      scheduledShifts: 0,
      workedShifts: 0,
      lateCount: 0,
      absentCount: 0,
      onTimeCount: 0,
      totalLateMinutes: 0,
      attendanceRate: 0,
    };
    current.scheduledShifts += 1;
    byEmployee.set(id, current);
  }

  const entriesByEmployeeDate = new Map<string, TimeEntry>();
  for (const entry of timeEntries) {
    const emp = entry.employee;
    if (!emp || typeof emp !== 'object') continue;
    const id = employeeId(emp);
    const date = toLuxonDateTime(entry.clock_in).toFormat('yyyy-MM-dd');
    entriesByEmployeeDate.set(`${id}|${date}`, entry);

    const current = byEmployee.get(id) ?? {
      employeeId: id,
      employeeName: employeeName(emp),
      scheduledShifts: 0,
      workedShifts: 0,
      lateCount: 0,
      absentCount: 0,
      onTimeCount: 0,
      totalLateMinutes: 0,
      attendanceRate: 0,
    };
    current.workedShifts += 1;
    const lateMinutes = safeNumber(entry.late_minutes);
    if (lateMinutes > 0) {
      current.lateCount += 1;
      current.totalLateMinutes += lateMinutes;
    } else {
      current.onTimeCount += 1;
    }
    byEmployee.set(id, current);
  }

  for (const shift of scheduledShifts) {
    const emp = shift.employee;
    if (!emp) continue;
    const id = employeeId(emp);
    const date = toLuxonDateTime(shift.start_at).toFormat('yyyy-MM-dd');
    if (!entriesByEmployeeDate.has(`${id}|${date}`)) {
      const current = byEmployee.get(id)!;
      current.absentCount += 1;
    }
  }

  return Array.from(byEmployee.values())
    .map(row => ({
      ...row,
      attendanceRate: row.scheduledShifts > 0
        ? roundMoney(((row.scheduledShifts - row.absentCount) / row.scheduledShifts) * 100)
        : row.workedShifts > 0 ? 100 : 0,
    }))
    .sort((a, b) => b.absentCount - a.absentCount);
};

export const aggregateLateArrivalReport = (timeEntries: TimeEntry[]): LateArrivalRow[] =>
  timeEntries
    .filter(entry => safeNumber(entry.late_minutes) > 0)
    .map(entry => {
      const emp = entry.employee;
      return {
        employeeId: emp && typeof emp === 'object' ? employeeId(emp) : '',
        employeeName: emp && typeof emp === 'object' ? employeeName(emp) : 'Unknown',
        date: toLuxonDateTime(entry.clock_in).toFormat('yyyy-MM-dd'),
        scheduledStart: entry.scheduled_shift
          ? toLuxonDateTime(entry.scheduled_shift.start_at).toFormat('HH:mm')
          : undefined,
        actualClockIn: toLuxonDateTime(entry.clock_in).toFormat('HH:mm'),
        lateMinutes: safeNumber(entry.late_minutes),
      };
    })
    .sort((a, b) => b.lateMinutes - a.lateMinutes);

export const aggregateAbsenceReport = (
  scheduledShifts: ScheduledShift[],
  timeEntries: TimeEntry[],
): AbsenceRow[] => {
  const workedKeys = new Set(
    timeEntries.map(entry => {
      const emp = entry.employee;
      const id = emp && typeof emp === 'object' ? employeeId(emp) : '';
      const date = toLuxonDateTime(entry.clock_in).toFormat('yyyy-MM-dd');
      return `${id}|${date}`;
    }),
  );

  return scheduledShifts
    .filter(shift => {
      const emp = shift.employee;
      const id = emp ? employeeId(emp) : '';
      const date = toLuxonDateTime(shift.start_at).toFormat('yyyy-MM-dd');
      return !workedKeys.has(`${id}|${date}`);
    })
    .map(shift => ({
      employeeId: employeeId(shift.employee),
      employeeName: employeeName(shift.employee),
      date: toLuxonDateTime(shift.start_at).toFormat('yyyy-MM-dd'),
      scheduledShiftId: recordToString(shift.id),
      reason: shift.status === 'cancelled' ? 'Cancelled shift' : 'No show',
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
};

export const aggregateLeaveReport = (leaveRequests: LeaveRequest[]): LeaveReportRow[] =>
  leaveRequests.map(request => ({
    requestId: recordToString(request.id),
    employeeId: employeeId(request.employee),
    employeeName: employeeName(request.employee),
    leaveType: request.leave_type?.name || 'Leave',
    startDate: toLuxonDateTime(request.start_date).toFormat('yyyy-MM-dd'),
    endDate: toLuxonDateTime(request.end_date).toFormat('yyyy-MM-dd'),
    days: safeNumber(request.days),
    status: request.status,
  }));

export const aggregateHolidayCostReport = (
  context: LaborReportContext,
  holidays: PublicHoliday[],
): HolidayCostRow[] => {
  const holidayMap = new Map<string, HolidayCostRow>();

  for (const row of context.employeeRows) {
    const holidayPremium = row.hours.premiumBuckets.filter(b => b.type === 'holiday');
    for (const bucket of holidayPremium) {
      const holiday = holidays.find(h => toLuxonDateTime(h.date).toFormat('yyyy-MM-dd') === bucket.date);
      const holidayId = holiday ? recordToString(holiday.id) : bucket.date;
      const holidayName = holiday?.name || 'Holiday';
      const current = holidayMap.get(holidayId) ?? {
        holidayId,
        holidayName,
        date: bucket.date,
        employeeCount: 0,
        premiumHours: 0,
        premiumPay: 0,
        totalCost: 0,
      };
      const share = bucket.hours / Math.max(row.totalHours, 0.0001);
      current.premiumHours += bucket.hours;
      current.premiumPay += row.cost.premiumPay * share;
      current.totalCost += row.totalCost * share;
      current.employeeCount += 1;
      holidayMap.set(holidayId, current);
    }
  }

  return Array.from(holidayMap.values())
    .map(row => ({
      ...row,
      premiumHours: roundMoney(row.premiumHours),
      premiumPay: roundMoney(row.premiumPay),
      totalCost: roundMoney(row.totalCost),
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
};

export const aggregateScheduledVsActual = (
  context: LaborReportContext,
  scheduledShifts: ScheduledShift[],
): ScheduledVsActualRow[] => {
  const scheduledByEmployeeDate = new Map<string, {hours: number; cost: number}>();
  const avgRateByEmployee = new Map<string, number>();

  for (const row of context.employeeRows) {
    avgRateByEmployee.set(
      row.employeeId,
      row.totalHours > 0 ? row.totalCost / row.totalHours : 0,
    );
  }

  for (const shift of scheduledShifts) {
    const id = employeeId(shift.employee);
    const date = toLuxonDateTime(shift.start_at).toFormat('yyyy-MM-dd');
    const hours = shiftHours(shift);
    const rate = avgRateByEmployee.get(id) ?? 0;
    const key = `${id}|${date}`;
    const current = scheduledByEmployeeDate.get(key) ?? {hours: 0, cost: 0};
    current.hours += hours;
    current.cost += hours * rate;
    scheduledByEmployeeDate.set(key, current);
  }

  const actualByEmployeeDate = new Map<string, {hours: number; cost: number; name: string}>();
  for (const row of context.employeeRows) {
    for (const bucket of row.hours.buckets) {
      const key = `${row.employeeId}|${bucket.date}`;
      const share = bucket.hours / Math.max(row.totalHours, 0.0001);
      const current = actualByEmployeeDate.get(key) ?? {
        hours: 0,
        cost: 0,
        name: row.employeeName,
      };
      current.hours += bucket.hours;
      current.cost += row.totalCost * share;
      actualByEmployeeDate.set(key, current);
    }
  }

  const keys = new Set([...scheduledByEmployeeDate.keys(), ...actualByEmployeeDate.keys()]);
  return Array.from(keys).map(key => {
    const [employeeIdKey, date] = key.split('|');
    const scheduled = scheduledByEmployeeDate.get(key) ?? {hours: 0, cost: 0};
    const actual = actualByEmployeeDate.get(key) ?? {
      hours: 0,
      cost: 0,
      name: context.employeeRows.find(r => r.employeeId === employeeIdKey)?.employeeName || 'Unknown',
    };
    const varianceHours = roundMoney(actual.hours - scheduled.hours);
    return {
      employeeId: employeeIdKey,
      employeeName: actual.name,
      date,
      scheduledHours: roundMoney(scheduled.hours),
      actualHours: roundMoney(actual.hours),
      varianceHours,
      variancePercent: scheduled.hours > 0 ? roundMoney((varianceHours / scheduled.hours) * 100) : 0,
      scheduledCost: roundMoney(scheduled.cost),
      actualCost: roundMoney(actual.cost),
      costVariance: roundMoney(actual.cost - scheduled.cost),
    };
  }).sort((a, b) => Math.abs(b.varianceHours) - Math.abs(a.varianceHours));
};

export const aggregateManagerApprovalReport = (timeEntries: TimeEntry[]): ManagerApprovalRow[] =>
  timeEntries
    .filter(entry => entry.approval_status === 'pending' || entry.source === 'manual')
    .map(entry => {
      const emp = entry.employee;
      const approver = entry.approved_by;
      return {
        entryId: recordToString(entry.id),
        employeeName: emp && typeof emp === 'object' ? employeeName(emp) : 'Unknown',
        clockIn: toLuxonDateTime(entry.clock_in).toFormat('yyyy-MM-dd HH:mm'),
        clockOut: entry.clock_out ? toLuxonDateTime(entry.clock_out).toFormat('yyyy-MM-dd HH:mm') : undefined,
        source: entry.source,
        approvalStatus: entry.approval_status,
        approvedBy: approver && typeof approver === 'object'
          ? `${approver.first_name || ''} ${approver.last_name || ''}`.trim()
          : undefined,
        hours: entryHours(entry),
      };
    });

export const aggregatePayrollSummary = (snapshots: PayrollSnapshot[]): PayrollSummaryResult => {
  const rows: PayrollDetailRow[] = snapshots.map(snapshot => ({
    snapshotId: recordToString(snapshot.id),
    employeeId: employeeId(snapshot.employee),
    employeeName: employeeName(snapshot.employee),
    regularHours: safeNumber(snapshot.regular_hours),
    overtimeHours: safeNumber(snapshot.overtime_hours),
    grossPay: safeNumber(snapshot.gross_pay),
    netPay: safeNumber(snapshot.net_pay),
    deductions: safeNumber(snapshot.deductions),
    bonuses: safeNumber(snapshot.bonuses),
    adjustments: safeNumber(snapshot.adjustments),
  }));

  const totals = rows.reduce(
    (acc, row) => ({
      totalRegularHours: acc.totalRegularHours + row.regularHours,
      totalOvertimeHours: acc.totalOvertimeHours + row.overtimeHours,
      totalGrossPay: acc.totalGrossPay + row.grossPay,
      totalNetPay: acc.totalNetPay + row.netPay,
      totalDeductions: acc.totalDeductions + row.deductions,
      totalBonuses: acc.totalBonuses + row.bonuses,
      totalAdjustments: acc.totalAdjustments + row.adjustments,
    }),
    {
      totalRegularHours: 0,
      totalOvertimeHours: 0,
      totalGrossPay: 0,
      totalNetPay: 0,
      totalDeductions: 0,
      totalBonuses: 0,
      totalAdjustments: 0,
    },
  );

  const firstPeriod = snapshots[0]?.payroll_run?.payroll_period;

  return {
    periodStart: firstPeriod ? toLuxonDateTime(firstPeriod.start_date).toFormat('yyyy-MM-dd') : undefined,
    periodEnd: firstPeriod ? toLuxonDateTime(firstPeriod.end_date).toFormat('yyyy-MM-dd') : undefined,
    employeeCount: rows.length,
    totalRegularHours: roundMoney(totals.totalRegularHours),
    totalOvertimeHours: roundMoney(totals.totalOvertimeHours),
    totalGrossPay: roundMoney(totals.totalGrossPay),
    totalNetPay: roundMoney(totals.totalNetPay),
    totalDeductions: roundMoney(totals.totalDeductions),
    totalBonuses: roundMoney(totals.totalBonuses),
    totalAdjustments: roundMoney(totals.totalAdjustments),
    rows: rows.sort((a, b) => b.grossPay - a.grossPay),
  };
};

export const aggregateLaborTrend = (
  dailyCosts: LaborCostResult[],
  netSalesByDay: Record<string, number> = {},
): LaborTrendPoint[] =>
  dailyCosts.map(day => ({
    period: day.period,
    label: day.label || day.period,
    totalCost: day.totalCost,
    totalHours: day.totalHours,
    netSales: netSalesByDay[day.period],
    laborPercent: netSalesByDay[day.period]
      ? roundMoney((day.totalCost / netSalesByDay[day.period]) * 100)
      : undefined,
  }));

export const aggregateLaborForecastDataset = (
  scheduledShifts: ScheduledShift[],
  trend: LaborTrendPoint[],
  avgHourlyCost: number,
): LaborForecastPoint[] => {
  const scheduledByDate = new Map<string, number>();
  for (const shift of scheduledShifts) {
    const date = toLuxonDateTime(shift.start_at).toFormat('yyyy-MM-dd');
    scheduledByDate.set(date, (scheduledByDate.get(date) ?? 0) + shiftHours(shift));
  }

  const forecastFromSchedule = Array.from(scheduledByDate.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([period, hours]) => ({
      period,
      label: period,
      projectedCost: roundMoney(hours * avgHourlyCost),
      projectedHours: roundMoney(hours),
      method: 'scheduled' as const,
    }));

  if (forecastFromSchedule.length > 0) {
    return forecastFromSchedule;
  }

  const recent = trend.slice(-7);
  const avgDailyCost = recent.length > 0
    ? recent.reduce((sum, point) => sum + point.totalCost, 0) / recent.length
    : 0;
  const avgDailyHours = recent.length > 0
    ? recent.reduce((sum, point) => sum + point.totalHours, 0) / recent.length
    : 0;

  const lastDate = recent[recent.length - 1]?.period
    ? toLuxonDateTime(recent[recent.length - 1].period)
    : DateTime.now();

  return Array.from({length: 7}).map((_, index) => {
    const date = lastDate.plus({days: index + 1});
    return {
      period: date.toFormat('yyyy-MM-dd'),
      label: date.toFormat('yyyy-MM-dd'),
      projectedCost: roundMoney(avgDailyCost),
      projectedHours: roundMoney(avgDailyHours),
      method: 'trend' as const,
    };
  });
};

export const aggregateTotalLaborCost = (context: LaborReportContext): LaborCostResult =>
  sumCostResult(context.employeeRows);

export const aggregateTopLaborCostEmployees = (
  context: LaborReportContext,
  limit = 10,
): EmployeeLaborRow[] => aggregateEmployeeLaborCost(context).slice(0, limit);

export const aggregateTopOvertimeEmployees = (
  context: LaborReportContext,
  limit = 10,
): OvertimeReportRow[] => aggregateOvertimeReport(context).slice(0, limit);

const parseRosterBound = (value: string) => {
  const timezone = getAppTimezone();
  const fromFormat = DateTime.fromFormat(
    value,
    import.meta.env.VITE_DATE_TIME_FORMAT as string,
    {zone: timezone},
  );
  if (fromFormat.isValid) {
    return fromFormat;
  }
  return toLuxonDateTime(value).setZone(timezone);
};

export const aggregateScheduleRoster = (
  scheduledShifts: ScheduledShift[],
  startDate: string,
  endDate: string,
): ScheduleRosterResult => {
  const rangeStart = parseRosterBound(startDate).startOf('day');
  const rangeEnd = parseRosterBound(endDate).startOf('day');
  const rangeStartKey = rangeStart.toFormat('yyyy-MM-dd');
  const rangeEndKey = rangeEnd.toFormat('yyyy-MM-dd');

  const activeShifts = scheduledShifts.filter(shift => shift.status !== 'cancelled');

  const weeks: ScheduleRosterResult['weeks'] = [];
  let cursor = rangeStart.startOf('week');
  const last = rangeEnd.endOf('week');

  while (cursor <= last) {
    const days = Array.from({length: 7}, (_, index) => cursor.plus({days: index}).toFormat('yyyy-MM-dd'));
    const weekStart = days[0];
    const weekEnd = days[6];

    const weekShifts = activeShifts.filter(shift => {
      const date = toLuxonDateTime(shift.start_at).toFormat('yyyy-MM-dd');
      return date >= weekStart && date <= weekEnd && date >= rangeStartKey && date <= rangeEndKey;
    });

    const byEmployee = new Map<string, ScheduleRosterEmployeeRow>();
    for (const shift of weekShifts) {
      if (!shift.employee) {
        continue;
      }
      const id = employeeId(shift.employee);
      if (!id) {
        continue;
      }
      let row = byEmployee.get(id);
      if (!row) {
        row = {
          employeeId: id,
          employeeName: employeeName(shift.employee),
          departmentName: shift.department?.name || shift.employee.department?.name,
          days: {},
        };
        byEmployee.set(id, row);
      }
      const date = toLuxonDateTime(shift.start_at).toFormat('yyyy-MM-dd');
      const cell = row.days[date] ?? [];
      cell.push({
        start: toLuxonDateTime(shift.start_at).toFormat('HH:mm'),
        end: toLuxonDateTime(shift.end_at).toFormat('HH:mm'),
      });
      row.days[date] = cell;
    }

    const rows = [...byEmployee.values()].sort((a, b) => a.employeeName.localeCompare(b.employeeName));
    for (const row of rows) {
      for (const date of Object.keys(row.days)) {
        row.days[date].sort((a, b) => a.start.localeCompare(b.start));
      }
    }

    if (rows.length > 0) {
      weeks.push({weekStart, days, rows});
    }
    cursor = cursor.plus({weeks: 1});
  }

  return {weeks};
};

export interface LaborDateRange extends DateRangeFilter {
  employeeIds?: string[];
}
