import { ID, Name, Priority } from "@/api/model/common.ts";
import {DateTime} from "surrealdb";

export interface Category extends ID, Name, Priority{
  background?: string
  color?: string
  parent?: Category
  show_in_menu?: boolean
  deleted_at?: DateTime
}
