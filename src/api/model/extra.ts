import { ID, Name } from "@/api/model/common.ts";
import { PaymentType } from "@/api/model/payment_type.ts";
import { OrderType } from "@/api/model/order_type.ts";
import { Table } from "@/api/model/table.ts";

export interface Extra extends ID, Name {
  value: number
  payment_types?: PaymentType[]
  order_types?: OrderType[]
  tables?: Table[]
  delivery?: boolean
  apply_to_all?: boolean
}
