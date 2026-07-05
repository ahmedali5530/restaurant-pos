import {DateTime} from 'surrealdb';
import {LaborPolicyConfig, LaborPolicyType} from '@/api/model/hr.types.ts';

export interface LaborPolicy {
  id: string;
  code: string;
  name: string;
  policy_type: LaborPolicyType;
  config?: LaborPolicyConfig;
  is_active?: boolean;
  deleted_at?: DateTime;
}
