import {DateTime} from 'surrealdb';

export interface Department {
  id: string;
  code: string;
  name: string;
  description?: string;
  is_active?: boolean;
  deleted_at?: DateTime;
}
