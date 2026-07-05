import {LaborDateRangeFilter} from '@/components/reports/filters/labor.date.range.filter.tsx';
import {REPORTS_LABOR_ATTENDANCE} from '@/routes/posr.ts';

export const LaborAttendanceFilter = () => <LaborDateRangeFilter action={REPORTS_LABOR_ATTENDANCE} />;
