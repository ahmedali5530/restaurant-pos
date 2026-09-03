import { ID } from "@/api/model/common.ts";
import { PaymentType } from "@/api/model/payment_type.ts";

export interface OrderPayment extends ID {
  amount: number
  comments?: string
  payable?: number
  payment_type?: PaymentType
}
