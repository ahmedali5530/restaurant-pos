import {DateTime} from 'surrealdb';
import {Employee} from '@/api/model/employee.ts';
import {LeaveType} from '@/api/model/leave_type.ts';
import {User} from '@/api/model/user.ts';
import {AuthPermission} from '@/api/model/auth_permission.ts';
import {LeaveRequestStatus} from '@/api/model/hr.types.ts';

export interface LeaveRequest {
  id: string;
  employee: Employee;
  leave_type: LeaveType;
  start_date: DateTime;
  end_date: DateTime;
  days: number;
  status?: LeaveRequestStatus;
  reason?: string;
  approved_by?: User;
  approved_at?: DateTime;
  auth_permission?: AuthPermission;
  created_at?: DateTime;
  created_by?: User;
}
