import type {RecordId} from "surrealdb";
import type {AccountGroup} from "./account.group";

export type AccountHeadType = "asset" | "liability" | "equity" | "income" | "expense";
export type NormalBalance = "debit" | "credit";

export interface Account {
  id: RecordId | string;
  code: string;
  name: string;
  group?: AccountGroup;
  /** @deprecated legacy field; use group.head_type */
  account_type?: AccountHeadType;
  normal_balance: NormalBalance;
  parent?: Account;
  notes?: string;
  is_active: boolean;
  created_at?: Date;
  updated_at?: Date;
}
