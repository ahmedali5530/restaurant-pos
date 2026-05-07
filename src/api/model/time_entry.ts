import {User} from "@/api/model/user.ts";
import { DateTime } from "surrealdb";

export interface TimeEntry {
  id: string
  clock_in: DateTime
  clock_out?: DateTime
  duration_seconds?: number
  user: User
  platform?: string
}