import {DateTime} from 'surrealdb';
import {Department} from '@/api/model/department.ts';
import {CostCenter} from '@/api/model/cost_center.ts';

export interface Position {
  id: string;
  code: string;
  name: string;
  department?: Department;
  default_cost_center?: CostCenter;
  is_active?: boolean;
  deleted_at?: DateTime;
}
