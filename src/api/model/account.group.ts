import type {RecordId} from "surrealdb";
import type {AccountHeadType, NormalBalance} from "./account";

export interface AccountGroup {
  id: RecordId | string;
  code: string;
  name: string;
  head_type: AccountHeadType;
  normal_balance: NormalBalance;
  notes?: string;
  is_active: boolean;
  created_at?: Date;
  updated_at?: Date;
}
