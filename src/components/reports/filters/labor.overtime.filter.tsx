import {LaborDateRangeFilter} from '@/components/reports/filters/labor.date.range.filter.tsx';
import {REPORTS_LABOR_OVERTIME} from '@/routes/posr.ts';

export const LaborOvertimeFilter = () => <LaborDateRangeFilter action={REPORTS_LABOR_OVERTIME} />;
