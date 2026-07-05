import {DateTime} from 'surrealdb';
import {PayrollRun} from '@/api/model/payroll_run.ts';
import {Employee} from '@/api/model/employee.ts';
import {EmployeePayProfile} from '@/api/model/employee_pay_profile.ts';
import {LaborPayRuleEffect} from '@/api/model/hr.types.ts';

export interface RuleApplication {
  rule_id: string;
  rule_name: string;
  effect: LaborPayRuleEffect;
  amount: number;
}

export interface PayrollSnapshot {
  id: string;
  payroll_run: PayrollRun;
  employee: Employee;
  pay_profile_id?: EmployeePayProfile;
  regular_hours?: number;
  overtime_hours?: number;
  double_time_hours?: number;
  night_premium_hours?: number;
  weekend_premium_hours?: number;
  holiday_premium_hours?: number;
  regular_pay?: number;
  overtime_pay?: number;
  premium_pay?: number;
  bonuses?: number;
  deductions?: number;
  adjustments?: number;
  tips?: number;
  gross_pay?: number;
  net_pay?: number;
  rule_applications?: RuleApplication[];
  calculated_at?: DateTime;
  calculation_version?: string;
}
