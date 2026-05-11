import { ID, Name, Priority } from "@/api/model/common.ts";
import {DateTime} from "surrealdb";

export enum DiscountType {
  Fixed = 'Fixed',
  Percent = 'Percent',
}
export interface Discount extends ID, Name, Priority {
  min_rate?: number
  max_rate?: number
  max_cap?: number

  type: string

  deleted_at?: DateTime
}
