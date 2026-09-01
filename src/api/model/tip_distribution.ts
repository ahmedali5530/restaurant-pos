import { ID } from "@/api/model/common.ts";
import { Shift } from "@/api/model/shift.ts";
import { User } from "@/api/model/user.ts";
import { DateTime } from "surrealdb";

export interface TipDistributionUserShare {
  id?: string
  tip_distribution?: TipDistribution
  user: User | string
  weight: number
  amount: number
}

export interface TipDistribution extends ID {
  shift?: Shift
  from_at: DateTime
  to_at: DateTime
  total_tips: number
  users: TipDistributionUserShare[]
  created_at?: DateTime
  created_by?: User
}
