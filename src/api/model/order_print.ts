import { ID } from "@/api/model/common.ts";
import { DateTime, RecordId } from "surrealdb";

export type OrderPrintType = 'temp' | 'final';

export interface OrderPrint extends ID {
  order: RecordId | string;
  print_type: OrderPrintType;
  printed_by?: RecordId | string | null;
  printed_at?: DateTime;
  is_override?: boolean;
  is_duplicate?: boolean;
}
