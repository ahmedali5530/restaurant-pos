import {DateTime} from 'surrealdb';
import {User} from '@/api/model/user.ts';
import {Department} from '@/api/model/department.ts';
import {Position} from '@/api/model/position.ts';
import {CostCenter} from '@/api/model/cost_center.ts';
import {EmergencyContact, EmploymentStatus, EmploymentType} from '@/api/model/hr.types.ts';

export interface Employee {
  id: string;
  employee_number: string;
  user?: User;
  first_name: string;
  last_name: string;
  department?: Department;
  position?: Position;
  cost_center?: CostCenter;
  manager?: Employee;
  employment_status?: EmploymentStatus;
  employment_type?: EmploymentType;
  hire_date?: DateTime;
  termination_date?: DateTime;
  rehire_date?: DateTime;
  is_rehire?: boolean;
  emergency_contact?: EmergencyContact;
  notes?: string;
  deleted_at?: DateTime;
}

export interface EmployeeAssignmentHistory {
  id: string;
  employee: Employee;
  department?: Department;
  position?: Position;
  cost_center?: CostCenter;
  manager?: Employee;
  effective_from: DateTime;
  effective_to?: DateTime;
  changed_by?: User;
  created_at?: DateTime;
  reason?: string;
}
