import {DateTime} from 'surrealdb';
import {User} from '@/api/model/user.ts';

export interface LaborAuditLog {
  id: string;
  entity_type: string;
  entity_id: string;
  action: string;
  before?: unknown;
  after?: unknown;
  changed_by?: User;
  changed_at?: DateTime;
}
