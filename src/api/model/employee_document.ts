import {DateTime} from 'surrealdb';
import {Employee} from '@/api/model/employee.ts';
import {Document} from '@/api/model/document.ts';
import {User} from '@/api/model/user.ts';
import {DocumentCategory} from '@/api/model/hr.types.ts';

export interface EmployeeDocument {
  id: string;
  employee: Employee;
  document: Document;
  category?: DocumentCategory;
  title: string;
  expires_at?: DateTime;
  uploaded_by?: User;
  uploaded_at?: DateTime;
}
