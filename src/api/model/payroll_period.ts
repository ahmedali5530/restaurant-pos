import {DateTime} from 'surrealdb';
import {User} from '@/api/model/user.ts';
import {PayrollPeriodType, PayrollPeriodStatus} from '@/api/model/hr.types.ts';

export interface PayrollPeriod {
  id: string;
  name: string;
  period_type?: PayrollPeriodType;
  start_date: DateTime;
  end_date: DateTime;
  status?: PayrollPeriodStatus;
  locked_at?: DateTime;
  locked_by?: User;
  closed_at?: DateTime;
  paid_at?: DateTime;
}
