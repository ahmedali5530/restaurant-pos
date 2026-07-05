import {LaborDateRangeFilter} from '@/components/reports/filters/labor.date.range.filter.tsx';
import {REPORTS_LABOR_SCHEDULED_VS_ACTUAL} from '@/routes/posr.ts';

export const LaborScheduledVsActualFilter = () => <LaborDateRangeFilter action={REPORTS_LABOR_SCHEDULED_VS_ACTUAL} />;
