import { ID } from "@/api/model/common.ts";
import { PaymentType } from "@/api/model/payment_type.ts";
import { Shift } from "@/api/model/shift.ts";
import { DateTime } from "surrealdb";

export interface TerminalCash {
  terminal_id: string;
  terminal_name: string;
  cash_amount: number;
}

export type TerminalDenomination = {
  notes: Record<string, number>;
  coins: Record<string, number>;
};

export interface PaymentSummary {
  payment_type: PaymentType;
  amount: number;
}

/** Non-cash tender system total vs card-machine / batch amount. */
export interface BatchTotal {
  payment_type_id: string;
  payment_type_name: string;
  system_amount: number;
  batch_amount: number;
}

export interface Expense {
  id: string;
  description: string;
  amount: number;
  category?: string;
}

/** Snapshot of shift sales activity stored on the closing. */
export interface ShiftRecap {
  discounts: number;
  tax: number;
  service_charge: number;
  tips: number;
  voids: number;
  refunds: number;
  paid_orders: number;
}

export interface OpenCheckRow {
  id: string;
  invoice_number?: number | string | null;
  table_name?: string;
  status: string;
  total: number;
}

export interface Closing extends ID {
  date_from: Date;
  date_to: Date;
  previous_day_balance?: number;
  cash_added: number;
  cash_withdrawn: number;
  /** Cash left in the drawer for the next shift (counted − drop). */
  drawer_float?: number;
  closing_balance: number;
  denominations?: Record<string, TerminalDenomination>
  terminal_cash?: TerminalCash[];
  payments_data: PaymentSummary[];
  batch_totals?: BatchTotal[];
  shift_recap?: ShiftRecap;
  variance_reason?: string | null;
  expenses: number;
  expenses_data: Expense[];
  total_cash?: number;
  total_other_payments?: number;
  net_amount?: number;
  notes?: string;
  created_by?: string;
  created_at: DateTime;
  closed_at?: DateTime;
  closed_by?: unknown;
  status: 'draft' | 'completed';
  /** Which shift this closing belongs to — lets multiple shifts in one
   *  closing-cycle window each keep their own record instead of sharing one. */
  shift?: Shift | null;
}
