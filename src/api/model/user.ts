import { ID } from "@/api/model/common.ts";
import {DateTime} from "surrealdb";

export interface User extends ID {
  clock_in_at?: string
  clock_out_at?: string
  login_method?: 'form' | 'pin'
  first_name: string
  last_name: string
  login: string
  password: string
  user_role?: UserRole
  user_shift?: UserShift
  roles?: string[]
  role?: UserRole

  deleted_at?: DateTime
}

export interface UserRole {
  id: string
  name: string
  roles: string[]
}

export interface UserShift {
  id: string
  name: string
  start_time: string
  end_time: string
  ends_next_day?: boolean
}