import { ID, Name, Priority } from "@/api/model/common.ts";
import { Discount } from "@/api/model/discount.ts";
import { Tax } from "@/api/model/tax.ts";
import {DateTime} from "surrealdb";

import type { GatewayId } from "@/lib/payment/gateway-catalog.ts";

export type PaymentGatewayProvider = GatewayId;
export type PaymentGatewayMode = "sandbox" | "live";

export interface PaymentGatewayConfig {
  public_key?: string
  secret_key?: string
  webhook_secret?: string
  client_id?: string
  client_secret?: string
  merchant_id?: string
  integrity_salt?: string
}

export interface PaymentTypeGatewayConfig extends ID, PaymentGatewayConfig {}

export interface PaymentType extends ID, Name, Priority{
  discounts?: Discount[]
  has_discount: boolean
  type: string
  tax?: Tax
  gateway?: PaymentGatewayProvider
  gateway_mode?: PaymentGatewayMode
  gateway_config?: PaymentTypeGatewayConfig | string

  deleted_at?: DateTime
}

export const PAYMENT_TYPE_FETCHES = [
  'discounts', 'tax'
];