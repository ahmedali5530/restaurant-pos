import {DateTime} from 'surrealdb';
import {PayrollRun} from '@/api/model/payroll_run.ts';
import {LaborCostEventType} from '@/api/model/hr.types.ts';

export interface LaborCostEvent {
  id: string;
  event_type: LaborCostEventType;
  payroll_run?: PayrollRun;
  period_start?: DateTime;
  period_end?: DateTime;
  payload?: Record<string, unknown>;
  emitted_at?: DateTime;
  consumed_at?: DateTime;
}
