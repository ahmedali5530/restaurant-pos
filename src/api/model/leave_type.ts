import {DateTime} from 'surrealdb';

export interface LeaveType {
  id: string;
  code: string;
  name: string;
  paid?: boolean;
  requires_approval?: boolean;
  max_days_per_year?: number;
  accrual_rate?: number;
  is_active?: boolean;
  deleted_at?: DateTime;
}
