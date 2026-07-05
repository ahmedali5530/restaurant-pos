import {DateTime} from 'surrealdb';
import {Shift} from '@/api/model/shift.ts';
import {Department} from '@/api/model/department.ts';
import {Position} from '@/api/model/position.ts';
import {CostCenter} from '@/api/model/cost_center.ts';

export interface ScheduleTemplate {
  id: string;
  name: string;
  shift_template?: Shift;
  department?: Department;
  position?: Position;
  cost_center?: CostCenter;
  days_of_week?: number[];
  start_time: string;
  end_time: string;
  break_minutes?: number;
  is_active?: boolean;
  deleted_at?: DateTime;
}
