import {DateTime} from 'surrealdb';
import {Employee} from '@/api/model/employee.ts';
import {LaborPolicy} from '@/api/model/labor_policy.ts';
import {User} from '@/api/model/user.ts';
import {BreakRule, PayType} from '@/api/model/hr.types.ts';

export interface EmployeePayProfile {
  id: string;
  employee: Employee;
  effective_from: DateTime;
  effective_to?: DateTime;
  pay_type: PayType;
  base_rate: number;
  currency?: string;
  overtime_policy?: LaborPolicy;
  holiday_policy?: LaborPolicy;
  night_policy?: LaborPolicy;
  weekend_policy?: LaborPolicy;
  maximum_hours_per_day?: number;
  maximum_hours_per_week?: number;
  break_rules?: BreakRule[];
  created_by?: User;
  created_at?: DateTime;
  notes?: string;
}
