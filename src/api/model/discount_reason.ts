import { ID, Name } from "@/api/model/common.ts";
import { DateTime } from "surrealdb";

export interface DiscountReason extends ID, Name {
  code: string
  is_active: boolean
  requires_approval: boolean
  deleted_at?: DateTime
}
