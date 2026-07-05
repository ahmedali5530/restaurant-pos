import {DateTime} from 'surrealdb';
import {User} from '@/api/model/user.ts';
import {ScheduleStatus} from '@/api/model/hr.types.ts';

export interface WorkSchedule {
  id: string;
  name: string;
  period_start: DateTime;
  period_end: DateTime;
  status?: ScheduleStatus;
  published_at?: DateTime;
  published_by?: User;
}
