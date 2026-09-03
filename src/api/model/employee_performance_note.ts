import {DateTime} from 'surrealdb';
import {Employee} from '@/api/model/employee.ts';
import {User} from '@/api/model/user.ts';
import {PerformanceNoteType} from '@/api/model/hr.types.ts';

export interface EmployeePerformanceNote {
  id: string;
  employee: Employee;
  type: PerformanceNoteType;
  title: string;
  content: string;
  severity?: string;
  created_by?: User;
  created_at?: DateTime;
  visible_to_employee?: boolean;
}
