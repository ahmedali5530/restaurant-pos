import {DateTime} from 'surrealdb';
import {User} from '@/api/model/user.ts';
import {Employee} from '@/api/model/employee.ts';
import {Shift} from '@/api/model/shift.ts';
import {ScheduledShift} from '@/api/model/scheduled_shift.ts';
import {ApprovalStatus, AttendanceStatus, BreakType, TimeEntrySource} from '@/api/model/hr.types.ts';

export interface TimeEntryBreak {
  id: string;
  time_entry: string;
  break_type: BreakType;
  start_at: DateTime;
  end_at?: DateTime;
  duration_seconds?: number;
  missed?: boolean;
  approved_by?: User;
}

export interface TimeEntryExtended {
  employee?: Employee;
  scheduled_shift?: ScheduledShift;
  shift_template?: Shift;
  attendance_status?: AttendanceStatus;
  approval_status?: ApprovalStatus;
  approved_by?: User;
  approved_at?: DateTime;
  source?: TimeEntrySource;
  notes?: string;
  late_minutes?: number;
  early_leave_minutes?: number;
  original_time_entry?: string;
}
