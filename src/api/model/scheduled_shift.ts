import {DateTime} from 'surrealdb';
import {Employee} from '@/api/model/employee.ts';
import {Shift} from '@/api/model/shift.ts';
import {Department} from '@/api/model/department.ts';
import {Position} from '@/api/model/position.ts';
import {CostCenter} from '@/api/model/cost_center.ts';
import {WorkSchedule} from '@/api/model/work_schedule.ts';
import {ScheduledShiftStatus} from '@/api/model/hr.types.ts';

export interface ScheduledShift {
  id: string;
  work_schedule?: WorkSchedule;
  employee: Employee;
  shift_template?: Shift;
  department?: Department;
  position?: Position;
  cost_center?: CostCenter;
  start_at: DateTime;
  end_at: DateTime;
  status?: ScheduledShiftStatus;
  notes?: string;
}
