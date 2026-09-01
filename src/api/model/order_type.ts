import { ID, Name, Priority } from "@/api/model/common.ts";
import {DateTime} from "surrealdb";

export interface OrderType extends ID, Name, Priority {
  allow_service_charges?: boolean

  deleted_at?: DateTime
}
