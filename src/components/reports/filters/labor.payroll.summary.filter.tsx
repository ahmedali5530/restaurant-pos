import {LaborDateRangeFilter} from '@/components/reports/filters/labor.date.range.filter.tsx';
import {REPORTS_LABOR_PAYROLL_SUMMARY} from '@/routes/posr.ts';

export const LaborPayrollSummaryFilter = () => <LaborDateRangeFilter action={REPORTS_LABOR_PAYROLL_SUMMARY} />;
