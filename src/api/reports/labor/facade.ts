import type {DateRangeFilter, DbClient} from '@/api/reports/shared/types.ts';
import {getSalesSummary} from '@/api/reports/sales';
import {formatDateTimeForQuery} from '@/api/reports/shared/filters.ts';
import {
  aggregateAbsenceReport,
  aggregateAttendanceReport,
  aggregateCostCenterLaborCost,
  aggregateDailyLaborCost,
  aggregateDepartmentLaborCost,
  aggregateEmployeeLaborCost,
  aggregateHolidayCostReport,
  aggregateLaborForecastDataset,
  aggregateLaborTrend,
  aggregateLateArrivalReport,
  aggregateLeaveReport,
  aggregateManagerApprovalReport,
  aggregateMonthlyLaborCost,
  aggregateOvertimeReport,
  aggregatePayrollSummary,
  aggregateScheduledVsActual,
  aggregateTopLaborCostEmployees,
  aggregateTopOvertimeEmployees,
  aggregateTotalLaborCost,
  aggregateWeeklyLaborCost,
  buildLaborReportContext,
  type LaborDateRange,
} from '@/api/reports/labor/aggregate.ts';
import {
  fetchEmployees,
  fetchLaborAdjustments,
  fetchLaborPayRules,
  fetchLeaveRequests,
  fetchPayProfiles,
  fetchPayrollSnapshots,
  fetchPublicHolidays,
  fetchScheduledShifts,
  fetchTimeEntries,
} from '@/api/reports/labor/fetch.ts';
import {DateTime} from 'luxon';
import {getAppTimezone} from '@/lib/datetime.ts';
import {safeNumber} from '@/lib/utils.ts';
import type {
  AverageHourlyCostResult,
  LaborCostResult,
  LaborPercentResult,
  RevenuePerEmployeeResult,
  SalesPerLaborHourResult,
} from '@/api/reports/labor/shared/types.ts';

const defaultPeriod = (): DateRangeFilter => {
  const now = DateTime.now().setZone(getAppTimezone());
  return {
    startDate: formatDateTimeForQuery(now.startOf('day')),
    endDate: formatDateTimeForQuery(now.endOf('day')),
  };
};

const resolvePeriod = (options: LaborDateRange = {}): Required<Pick<DateRangeFilter, 'startDate' | 'endDate'>> => {
  const fallback = defaultPeriod();
  return {
    startDate: options.startDate ?? fallback.startDate!,
    endDate: options.endDate ?? fallback.endDate!,
  };
};

const loadLaborContext = async (db: DbClient, options: LaborDateRange = {}) => {
  const {startDate, endDate} = resolvePeriod(options);
  const employeeIds = options.employeeIds ?? [];

  const [
    employees,
    timeEntries,
    payProfiles,
    holidays,
    adjustments,
    rules,
  ] = await Promise.all([
    fetchEmployees(db, {employeeIds}),
    fetchTimeEntries(db, {startDate, endDate, employeeIds, includeOpen: true}),
    fetchPayProfiles(db, {startDate, endDate, employeeIds}),
    fetchPublicHolidays(db, {startDate, endDate}),
    fetchLaborAdjustments(db, {startDate, endDate, employeeIds}),
    fetchLaborPayRules(db),
  ]);

  const context = buildLaborReportContext({
    employees,
    timeEntries,
    payProfiles,
    holidays,
    adjustments,
    rules,
    periodStart: startDate,
    periodEnd: endDate,
  });

  return {context, employees, timeEntries, holidays, startDate, endDate};
};

export const getDailyLaborCost = async (
  db: DbClient,
  options: LaborDateRange = {},
): Promise<LaborCostResult[]> => {
  const {context} = await loadLaborContext(db, options);
  return aggregateDailyLaborCost(context);
};

export const getWeeklyLaborCost = async (db: DbClient, options: LaborDateRange = {}) => {
  const {context} = await loadLaborContext(db, options);
  return aggregateWeeklyLaborCost(context);
};

export const getMonthlyLaborCost = async (db: DbClient, options: LaborDateRange = {}) => {
  const {context} = await loadLaborContext(db, options);
  return aggregateMonthlyLaborCost(context);
};

export const getEmployeeLaborCost = async (db: DbClient, options: LaborDateRange = {}) => {
  const {context} = await loadLaborContext(db, options);
  return aggregateEmployeeLaborCost(context);
};

export const getDepartmentLaborCost = async (db: DbClient, options: LaborDateRange = {}) => {
  const {context} = await loadLaborContext(db, options);
  return aggregateDepartmentLaborCost(context);
};

export const getCostCenterLaborCost = async (db: DbClient, options: LaborDateRange = {}) => {
  const {context} = await loadLaborContext(db, options);
  return aggregateCostCenterLaborCost(context);
};

export const getAverageHourlyCost = async (
  db: DbClient,
  options: LaborDateRange = {},
): Promise<AverageHourlyCostResult> => {
  const {context} = await loadLaborContext(db, options);
  const totals = aggregateTotalLaborCost(context);
  return {
    totalCost: totals.totalCost,
    totalHours: totals.totalHours,
    averageHourlyCost: totals.totalHours > 0
      ? safeNumber(totals.totalCost / totals.totalHours)
      : 0,
  };
};

export const getLaborPercent = async (
  db: DbClient,
  options: LaborDateRange = {},
): Promise<LaborPercentResult> => {
  const {startDate, endDate} = resolvePeriod(options);
  const [{context}, sales] = await Promise.all([
    loadLaborContext(db, options),
    getSalesSummary(db, {startDate, endDate}),
  ]);
  const totals = aggregateTotalLaborCost(context);
  const netSales = safeNumber(sales.totalNetSales);
  return {
    laborCost: totals.totalCost,
    netSales,
    laborPercent: netSales > 0 ? safeNumber((totals.totalCost / netSales) * 100) : 0,
  };
};

export const getSalesPerLaborHour = async (
  db: DbClient,
  options: LaborDateRange = {},
): Promise<SalesPerLaborHourResult> => {
  const {startDate, endDate} = resolvePeriod(options);
  const [{context}, sales] = await Promise.all([
    loadLaborContext(db, options),
    getSalesSummary(db, {startDate, endDate}),
  ]);
  const totals = aggregateTotalLaborCost(context);
  const netSales = safeNumber(sales.totalNetSales);
  return {
    netSales,
    laborHours: totals.totalHours,
    salesPerLaborHour: totals.totalHours > 0 ? safeNumber(netSales / totals.totalHours) : 0,
  };
};

export const getRevenuePerEmployee = async (
  db: DbClient,
  options: LaborDateRange = {},
): Promise<RevenuePerEmployeeResult> => {
  const {startDate, endDate} = resolvePeriod(options);
  const [{employees}, sales] = await Promise.all([
    loadLaborContext(db, options),
    getSalesSummary(db, {startDate, endDate}),
  ]);
  const netSales = safeNumber(sales.totalNetSales);
  const employeeCount = employees.length;
  return {
    netSales,
    employeeCount,
    revenuePerEmployee: employeeCount > 0 ? safeNumber(netSales / employeeCount) : 0,
  };
};

export const getOvertimeReport = async (db: DbClient, options: LaborDateRange = {}) => {
  const {context} = await loadLaborContext(db, options);
  return aggregateOvertimeReport(context);
};

export const getAttendanceReport = async (db: DbClient, options: LaborDateRange = {}) => {
  const {startDate, endDate} = resolvePeriod(options);
  const employeeIds = options.employeeIds ?? [];
  const [scheduledShifts, timeEntries] = await Promise.all([
    fetchScheduledShifts(db, {startDate, endDate, employeeIds}),
    fetchTimeEntries(db, {startDate, endDate, employeeIds, includeOpen: true}),
  ]);
  return aggregateAttendanceReport(scheduledShifts, timeEntries);
};

export const getLateArrivalReport = async (db: DbClient, options: LaborDateRange = {}) => {
  const {startDate, endDate} = resolvePeriod(options);
  const timeEntries = await fetchTimeEntries(db, {
    startDate,
    endDate,
    employeeIds: options.employeeIds,
    includeOpen: true,
  });
  return aggregateLateArrivalReport(timeEntries);
};

export const getAbsenceReport = async (db: DbClient, options: LaborDateRange = {}) => {
  const {startDate, endDate} = resolvePeriod(options);
  const employeeIds = options.employeeIds ?? [];
  const [scheduledShifts, timeEntries] = await Promise.all([
    fetchScheduledShifts(db, {startDate, endDate, employeeIds}),
    fetchTimeEntries(db, {startDate, endDate, employeeIds, includeOpen: true}),
  ]);
  return aggregateAbsenceReport(scheduledShifts, timeEntries);
};

export const getLeaveReport = async (db: DbClient, options: LaborDateRange = {}) => {
  const {startDate, endDate} = resolvePeriod(options);
  const leaveRequests = await fetchLeaveRequests(db, {
    startDate,
    endDate,
    employeeIds: options.employeeIds,
  });
  return aggregateLeaveReport(leaveRequests);
};

export const getHolidayCostReport = async (db: DbClient, options: LaborDateRange = {}) => {
  const {context, holidays} = await loadLaborContext(db, options);
  return aggregateHolidayCostReport(context, holidays);
};

export const getScheduledVsActual = async (db: DbClient, options: LaborDateRange = {}) => {
  const {startDate, endDate} = resolvePeriod(options);
  const employeeIds = options.employeeIds ?? [];
  const [{context}, scheduledShifts] = await Promise.all([
    loadLaborContext(db, options),
    fetchScheduledShifts(db, {startDate, endDate, employeeIds}),
  ]);
  return aggregateScheduledVsActual(context, scheduledShifts);
};

export const getManagerApprovalReport = async (db: DbClient, options: LaborDateRange = {}) => {
  const {startDate, endDate} = resolvePeriod(options);
  const timeEntries = await fetchTimeEntries(db, {
    startDate,
    endDate,
    employeeIds: options.employeeIds,
    includeOpen: true,
  });
  return aggregateManagerApprovalReport(timeEntries);
};

export const getTopLaborCostEmployees = async (
  db: DbClient,
  options: LaborDateRange & {limit?: number} = {},
) => {
  const {context} = await loadLaborContext(db, options);
  return aggregateTopLaborCostEmployees(context, options.limit ?? 10);
};

export const getTopOvertimeEmployees = async (
  db: DbClient,
  options: LaborDateRange & {limit?: number} = {},
) => {
  const {context} = await loadLaborContext(db, options);
  return aggregateTopOvertimeEmployees(context, options.limit ?? 10);
};

export const getPayrollSummary = async (
  db: DbClient,
  options: LaborDateRange & {payrollRunId?: string} = {},
) => {
  const {startDate, endDate} = resolvePeriod(options);
  const snapshots = await fetchPayrollSnapshots(db, {
    startDate,
    endDate,
    employeeIds: options.employeeIds,
    payrollRunId: options.payrollRunId,
  });
  return aggregatePayrollSummary(snapshots);
};

export const getPayrollDetails = async (
  db: DbClient,
  options: LaborDateRange & {payrollRunId?: string} = {},
) => {
  const summary = await getPayrollSummary(db, options);
  return summary.rows;
};

export const getLaborTrend = async (db: DbClient, options: LaborDateRange = {}) => {
  const {startDate, endDate} = resolvePeriod(options);
  const {context} = await loadLaborContext(db, options);
  const dailyCosts = aggregateDailyLaborCost(context);
  const sales = await getSalesSummary(db, {startDate, endDate});
  const netSalesByDay = Object.fromEntries(
    Object.entries(sales.dayPartTotals).map(([label, totals]) => [label, totals.sales]),
  );
  return aggregateLaborTrend(dailyCosts, netSalesByDay);
};

export const getLaborForecastDataset = async (db: DbClient, options: LaborDateRange = {}) => {
  const {startDate, endDate} = resolvePeriod(options);
  const [{context}, scheduledShifts, avgHourly] = await Promise.all([
    loadLaborContext(db, options),
    fetchScheduledShifts(db, {startDate, endDate, employeeIds: options.employeeIds}),
    getAverageHourlyCost(db, options),
  ]);
  const trend = aggregateLaborTrend(aggregateDailyLaborCost(context));
  return aggregateLaborForecastDataset(scheduledShifts, trend, avgHourly.averageHourlyCost);
};
