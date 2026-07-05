import type {DbClient} from '@/api/reports/shared/types.ts';
import {formatDateTimeForQuery} from '@/api/reports/shared/filters.ts';
import {getSalesSummary} from '@/api/reports/sales';
import {
  aggregateDailyLaborCost,
  aggregateTotalLaborCost,
  buildLaborReportContext,
} from '@/api/reports/labor/aggregate.ts';
import {
  fetchActiveBreakCount,
  fetchEmployees,
  fetchLaborAdjustments,
  fetchLaborPayRules,
  fetchPendingApprovalCount,
  fetchPublicHolidays,
  fetchScheduledShifts,
  fetchTimeEntries,
  fetchPayProfiles,
} from '@/api/reports/labor/fetch.ts';
import type {LaborDashboardSnapshot} from '@/api/reports/labor/shared/types.ts';
import {recordToString} from '@/api/reports/shared/records.ts';
import {toLuxonDateTime, getAppTimezone} from '@/lib/datetime.ts';
import {safeNumber} from '@/lib/utils.ts';
import {DateTime} from 'luxon';

export const getLaborDashboardSnapshot = async (db: DbClient): Promise<LaborDashboardSnapshot> => {
  const now = DateTime.now().setZone(getAppTimezone());
  const startDate = formatDateTimeForQuery(now.startOf('day'));
  const endDate = formatDateTimeForQuery(now.endOf('day'));

  const [
    employees,
    todayEntries,
    activeEntries,
    scheduledToday,
    payProfiles,
    holidays,
    adjustments,
    rules,
    onBreakCount,
    pendingApprovals,
    sales,
  ] = await Promise.all([
    fetchEmployees(db, {activeOnly: true}),
    fetchTimeEntries(db, {startDate, endDate, includeOpen: true}),
    fetchTimeEntries(db, {activeOnly: true, includeOpen: true}),
    fetchScheduledShifts(db, {startDate, endDate}),
    fetchPayProfiles(db, {startDate, endDate}),
    fetchPublicHolidays(db, {startDate, endDate}),
    fetchLaborAdjustments(db, {startDate, endDate}),
    fetchLaborPayRules(db),
    fetchActiveBreakCount(db),
    fetchPendingApprovalCount(db),
    getSalesSummary(db, {startDate, endDate}),
  ]);

  const context = buildLaborReportContext({
    employees,
    timeEntries: todayEntries,
    payProfiles,
    holidays,
    adjustments,
    rules,
    periodStart: startDate,
    periodEnd: endDate,
  });

  const totals = aggregateTotalLaborCost(context);
  const netSales = safeNumber(sales.totalNetSales);

  const workedEmployeeDates = new Set(
    todayEntries.map(entry => {
      const empId = recordToString(entry.employee?.id ?? entry.employee);
      const date = toLuxonDateTime(entry.clock_in).toFormat('yyyy-MM-dd');
      return `${empId}|${date}`;
    }),
  );

  let missingCount = 0;
  let lateTodayCount = 0;
  let scheduledRemainingHours = 0;

  for (const shift of scheduledToday) {
    const empId = recordToString(shift.employee?.id ?? shift.employee);
    const date = toLuxonDateTime(shift.start_at).toFormat('yyyy-MM-dd');
    if (!workedEmployeeDates.has(`${empId}|${date}`) && toLuxonDateTime(shift.end_at) < now) {
      missingCount += 1;
    }

    const shiftEnd = toLuxonDateTime(shift.end_at);
    if (shiftEnd > now) {
      scheduledRemainingHours += Math.max(0, shiftEnd.diff(now, 'hours').hours);
    }
  }

  for (const entry of todayEntries) {
    if (safeNumber(entry.late_minutes) > 0) {
      lateTodayCount += 1;
    }
  }

  const avgHourlyCost = totals.totalHours > 0 ? totals.totalCost / totals.totalHours : 0;
  const projectedRemainingCost = scheduledRemainingHours * avgHourlyCost;
  const projectedEodCost = safeNumber(totals.totalCost + projectedRemainingCost);
  const overtimeHoursToday = totals.overtimeHours + totals.doubleTimeHours;

  return {
    asOf: now.toISO() ?? now.toFormat('yyyy-MM-dd HH:mm'),
    clockedInCount: activeEntries.length,
    onBreakCount,
    scheduledTodayCount: scheduledToday.length,
    missingCount,
    lateTodayCount,
    currentLaborCost: totals.totalCost,
    projectedEodCost,
    laborCostToday: totals.totalCost,
    salesToday: netSales,
    laborPercent: netSales > 0 ? safeNumber((totals.totalCost / netSales) * 100) : 0,
    salesPerLaborHour: totals.totalHours > 0 ? safeNumber(netSales / totals.totalHours) : 0,
    overtimeHoursToday,
    pendingApprovals,
    activeHeadcount: employees.length,
    avgHourlyCost: safeNumber(avgHourlyCost),
  };
};

export const getLaborDashboardTrend = async (db: DbClient) => {
  const now = DateTime.now().setZone(getAppTimezone());
  const startDate = formatDateTimeForQuery(now.minus({days: 13}).startOf('day'));
  const endDate = formatDateTimeForQuery(now.endOf('day'));
  const employees = await fetchEmployees(db, {activeOnly: true});
  const timeEntries = await fetchTimeEntries(db, {startDate, endDate, includeOpen: true});
  const payProfiles = await fetchPayProfiles(db, {startDate, endDate});
  const holidays = await fetchPublicHolidays(db, {startDate, endDate});
  const adjustments = await fetchLaborAdjustments(db, {startDate, endDate});
  const rules = await fetchLaborPayRules(db);
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
  return aggregateDailyLaborCost(context);
};
