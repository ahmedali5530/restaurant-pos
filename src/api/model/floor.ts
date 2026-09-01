import { ID, Name, Priority } from "@/api/model/common.ts";
import {DateTime} from "surrealdb";

export interface Floor extends ID, Name, Priority {
  background?: string
  color?: string

  deleted_at?: DateTime
}
