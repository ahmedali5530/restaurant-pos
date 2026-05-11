import { ID, Name, Priority } from "@/api/model/common.ts";
import {DateTime} from "surrealdb";

export interface Printer extends ID, Name, Priority{
  ip_address: string
  port: number
  prints: number
  type: string

  deleted_at?: DateTime
}
