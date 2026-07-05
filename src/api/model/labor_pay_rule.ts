import {DateTime} from 'surrealdb';
import {LaborPayRuleConditions, LaborPayRuleEffect, StackingMode} from '@/api/model/hr.types.ts';

export interface LaborPayRule {
  id: string;
  name: string;
  code: string;
  priority?: number;
  is_active?: boolean;
  deleted_at?: DateTime;
  conditions?: LaborPayRuleConditions;
  effects?: LaborPayRuleEffect[];
  stacking_mode?: StackingMode;
  exclusive?: boolean;
}
