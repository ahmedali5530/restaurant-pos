import { ID, Name } from "@/api/model/common.ts";
import {DateTime} from "surrealdb";

export interface UserRole extends ID, Name {
  roles: string[]

  deleted_at?: DateTime
}
