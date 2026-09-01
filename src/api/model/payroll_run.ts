import {DateTime} from 'surrealdb';
import {PayrollPeriod} from '@/api/model/payroll_period.ts';
import {User} from '@/api/model/user.ts';
import {PayrollRunStatus} from '@/api/model/hr.types.ts';

export interface PayrollRun {
  id: string;
  payroll_period: PayrollPeriod;
  run_number?: number;
  status?: PayrollRunStatus;
  generated_at?: DateTime;
  generated_by?: User;
  approved_at?: DateTime;
  approved_by?: User;
  notes?: string;
}
