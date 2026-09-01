import {DateTime} from 'surrealdb';
import {LaborPolicy} from '@/api/model/labor_policy.ts';
import {RecurrenceRule} from '@/api/model/hr.types.ts';

export interface PublicHoliday {
  id: string;
  name: string;
  date: DateTime;
  country_code?: string;
  is_recurring?: boolean;
  recurrence_rule?: RecurrenceRule;
  labor_policy?: LaborPolicy;
  is_active?: boolean;
  deleted_at?: DateTime;
}
