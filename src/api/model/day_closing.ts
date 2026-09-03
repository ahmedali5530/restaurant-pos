import {ID, KeyValue} from "@/api/model/common.ts";
import {User} from "@/api/model/user.ts";
import { DateTime } from "surrealdb";

export interface DayClosing extends ID {
  cash_added: number
  cash_withdraw: number
  closed_at?: DateTime
  closed_by?: User
  closing_balance: number
  created_at: DateTime
  date_from: DateTime|null
  date_to: DateTime|null
  denominations: KeyValue[]
  expenses: number
  expenses_data: object[]
  notes?: string
  opened_by?: User
  opening_balance: number
  payments_data?: KeyValue[]
  status?: string
  terminal_cash?: KeyValue[]
}