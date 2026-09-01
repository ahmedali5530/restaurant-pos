import {Employee} from '@/api/model/employee.ts';
import {LeaveType} from '@/api/model/leave_type.ts';

export interface LeaveBalance {
  id: string;
  employee: Employee;
  leave_type: LeaveType;
  year: number;
  accrued?: number;
  used?: number;
  pending?: number;
  carried_over?: number;
}
