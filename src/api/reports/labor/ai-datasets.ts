import type {DateRangeFilter, DbClient} from '@/api/reports/shared/types.ts';
import {formatDateTimeForQuery} from '@/api/reports/shared/filters.ts';
import {getAttendanceReport, getDailyLaborCost, getLaborPercent, getLaborTrend, getOvertimeReport, getPayrollSummary, getScheduledVsActual, getTopLaborCostEmployees} from '@/api/reports/labor/facade.ts';
import {getLaborDashboardSnapshot} from '@/api/reports/labor/dashboard.ts';
import type {AiLaborDatasets} from '@/api/reports/labor/shared/types.ts';
import {DateTime} from 'luxon';
import {getAppTimezone} from '@/lib/datetime.ts';

export interface GetAiLaborDatasetsOptions extends DateRangeFilter {
  employeeIds?: string[];
  topLimit?: number;
}

export const getAiLaborDatasets = async (
  db: DbClient,
  options: GetAiLaborDatasetsOptions = {},
): Promise<AiLaborDatasets> => {
  const now = DateTime.now().setZone(getAppTimezone());
  const range: GetAiLaborDatasetsOptions = {
    startDate: options.startDate ?? formatDateTimeForQuery(now.minus({days: 13}).startOf('day')),
    endDate: options.endDate ?? formatDateTimeForQuery(now.endOf('day')),
    employeeIds: options.employeeIds,
    topLimit: options.topLimit ?? 10,
  };

  const [
    dashboard,
    dailyCost,
    laborPercent,
    overtime,
    attendance,
    payrollSummary,
    scheduledVsActual,
    laborTrend,
    topLaborCostEmployees,
  ] = await Promise.all([
    getLaborDashboardSnapshot(db),
    getDailyLaborCost(db, range),
    getLaborPercent(db, range),
    getOvertimeReport(db, range),
    getAttendanceReport(db, range),
    getPayrollSummary(db, range),
    getScheduledVsActual(db, range),
    getLaborTrend(db, range),
    getTopLaborCostEmployees(db, {...range, limit: range.topLimit}),
  ]);

  return {
    dashboard,
    dailyCost,
    laborPercent,
    overtime,
    attendance,
    payrollSummary,
    scheduledVsActual,
    laborTrend,
    topLaborCostEmployees,
  };
};
