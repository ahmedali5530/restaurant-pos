import {DateTime} from 'surrealdb';
import {Employee} from '@/api/model/employee.ts';
import {ScheduledShift} from '@/api/model/scheduled_shift.ts';
import {User} from '@/api/model/user.ts';
import {AuthPermission} from '@/api/model/auth_permission.ts';
import {SwapRequestStatus} from '@/api/model/hr.types.ts';

export interface ShiftSwapRequest {
  id: string;
  scheduled_shift: ScheduledShift;
  requesting_employee: Employee;
  target_employee?: Employee;
  proposed_shift?: ScheduledShift;
  status?: SwapRequestStatus;
  approved_by?: User;
  approved_at?: DateTime;
  auth_permission?: AuthPermission;
}
