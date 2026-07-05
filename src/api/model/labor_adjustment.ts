import {DateTime} from 'surrealdb';
import {Employee} from '@/api/model/employee.ts';
import {PayrollPeriod} from '@/api/model/payroll_period.ts';
import {User} from '@/api/model/user.ts';
import {LaborAdjustmentType} from '@/api/model/hr.types.ts';

export interface LaborAdjustment {
  id: string;
  employee: Employee;
  payroll_period?: PayrollPeriod;
  type: LaborAdjustmentType;
  amount: number;
  currency?: string;
  description?: string;
  effective_date: DateTime;
  status?: string;
  approved_by?: User;
  created_by?: User;
  created_at?: DateTime;
}
