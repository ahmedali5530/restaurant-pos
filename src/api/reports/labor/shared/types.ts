import type {LaborCostBreakdown, HoursBreakdown, LaborCalculationResult} from '@/lib/labor-engine/types.ts';

export interface LaborCostResult {
  period: string;
  label?: string;
  totalCost: number;
  totalHours: number;
  regularHours: number;
  overtimeHours: number;
  doubleTimeHours: number;
  employeeCount: number;
  regularPay: number;
  overtimePay: number;
  premiumPay: number;
  grossPay: number;
}

export interface EmployeeLaborRow {
  employeeId: string;
  employeeNumber: string;
  employeeName: string;
  departmentId?: string;
  departmentName?: string;
  costCenterId?: string;
  costCenterName?: string;
  positionName?: string;
  totalHours: number;
  regularHours: number;
  overtimeHours: number;
  doubleTimeHours: number;
  totalCost: number;
  hours: HoursBreakdown;
  cost: LaborCostBreakdown;
}

export interface GroupedLaborRow {
  groupId: string;
  groupName: string;
  employeeCount: number;
  totalHours: number;
  regularHours: number;
  overtimeHours: number;
  totalCost: number;
}

export interface OvertimeReportRow {
  employeeId: string;
  employeeName: string;
  departmentName?: string;
  regularHours: number;
  overtimeHours: number;
  doubleTimeHours: number;
  overtimePay: number;
  totalCost: number;
}

export interface AttendanceReportRow {
  employeeId: string;
  employeeName: string;
  scheduledShifts: number;
  workedShifts: number;
  lateCount: number;
  absentCount: number;
  onTimeCount: number;
  totalLateMinutes: number;
  attendanceRate: number;
}

export interface LateArrivalRow {
  employeeId: string;
  employeeName: string;
  date: string;
  scheduledStart?: string;
  actualClockIn?: string;
  lateMinutes: number;
}

export interface AbsenceRow {
  employeeId: string;
  employeeName: string;
  date: string;
  scheduledShiftId?: string;
  reason?: string;
}

export interface LeaveReportRow {
  requestId: string;
  employeeId: string;
  employeeName: string;
  leaveType: string;
  startDate: string;
  endDate: string;
  days: number;
  status?: string;
}

export interface HolidayCostRow {
  holidayId: string;
  holidayName: string;
  date: string;
  employeeCount: number;
  premiumHours: number;
  premiumPay: number;
  totalCost: number;
}

export interface ScheduledVsActualRow {
  employeeId: string;
  employeeName: string;
  date: string;
  scheduledHours: number;
  actualHours: number;
  varianceHours: number;
  variancePercent: number;
  scheduledCost: number;
  actualCost: number;
  costVariance: number;
}

export interface ManagerApprovalRow {
  entryId: string;
  employeeName: string;
  clockIn: string;
  clockOut?: string;
  source?: string;
  approvalStatus?: string;
  approvedBy?: string;
  hours: number;
}

export interface PayrollSummaryResult {
  periodStart?: string;
  periodEnd?: string;
  employeeCount: number;
  totalRegularHours: number;
  totalOvertimeHours: number;
  totalGrossPay: number;
  totalNetPay: number;
  totalDeductions: number;
  totalBonuses: number;
  totalAdjustments: number;
  rows: PayrollDetailRow[];
}

export interface PayrollDetailRow {
  snapshotId: string;
  employeeId: string;
  employeeName: string;
  regularHours: number;
  overtimeHours: number;
  grossPay: number;
  netPay: number;
  deductions: number;
  bonuses: number;
  adjustments: number;
}

export interface LaborTrendPoint {
  period: string;
  label: string;
  totalCost: number;
  totalHours: number;
  laborPercent?: number;
  netSales?: number;
}

export interface LaborForecastPoint {
  period: string;
  label: string;
  projectedCost: number;
  projectedHours: number;
  method: 'scheduled' | 'trend';
}

export interface LaborPercentResult {
  laborCost: number;
  netSales: number;
  laborPercent: number;
}

export interface SalesPerLaborHourResult {
  netSales: number;
  laborHours: number;
  salesPerLaborHour: number;
}

export interface RevenuePerEmployeeResult {
  netSales: number;
  employeeCount: number;
  revenuePerEmployee: number;
}

export interface AverageHourlyCostResult {
  totalCost: number;
  totalHours: number;
  averageHourlyCost: number;
}

export interface LaborDashboardSnapshot {
  asOf: string;
  clockedInCount: number;
  onBreakCount: number;
  scheduledTodayCount: number;
  missingCount: number;
  lateTodayCount: number;
  currentLaborCost: number;
  projectedEodCost: number;
  laborCostToday: number;
  salesToday: number;
  laborPercent: number;
  salesPerLaborHour: number;
  overtimeHoursToday: number;
  pendingApprovals: number;
  activeHeadcount: number;
  avgHourlyCost: number;
}

export interface AiLaborDatasets {
  dashboard: LaborDashboardSnapshot;
  dailyCost: LaborCostResult[];
  laborPercent: LaborPercentResult;
  overtime: OvertimeReportRow[];
  attendance: AttendanceReportRow[];
  payrollSummary: PayrollSummaryResult;
  scheduledVsActual: ScheduledVsActualRow[];
  laborTrend: LaborTrendPoint[];
  topLaborCostEmployees: EmployeeLaborRow[];
}

export interface LaborReportContext {
  calculations: LaborCalculationResult[];
  employeeRows: EmployeeLaborRow[];
}

export interface ScheduleRosterCellShift {
  start: string;
  end: string;
}

export interface ScheduleRosterEmployeeRow {
  employeeId: string;
  employeeName: string;
  departmentName?: string;
  days: Record<string, ScheduleRosterCellShift[]>;
}

export interface ScheduleRosterWeek {
  weekStart: string;
  days: string[];
  rows: ScheduleRosterEmployeeRow[];
}

export interface ScheduleRosterResult {
  weeks: ScheduleRosterWeek[];
}
