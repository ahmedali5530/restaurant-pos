import {ID, KeyValue} from "@/api/model/common.ts";
import {User} from "@/api/model/user.ts";
import {Shift} from "@/api/model/shift.ts";
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
  drawer_float?: number
  expenses: number
  expenses_data: object[]
  batch_totals?: KeyValue[]
  notes?: string
  opened_by?: User
  opening_balance: number
  payments_data?: KeyValue[]
  previous_day_balance?: number
  shift_recap?: KeyValue
  status?: string
  terminal_cash?: KeyValue[]
  variance_reason?: string | null
  /** Which shift this closing belongs to — a day can have one per shift. */
  shift?: Shift | null
}