import {User} from "@/api/model/user.ts";
import { DateTime } from "surrealdb";
import {Employee} from "@/api/model/employee.ts";
import {Shift} from "@/api/model/shift.ts";
import {ScheduledShift} from "@/api/model/scheduled_shift.ts";
import {ApprovalStatus, AttendanceStatus, TimeEntrySource} from "@/api/model/hr.types.ts";

export interface TimeEntry {
  id: string
  clock_in: DateTime
  clock_out?: DateTime
  duration_seconds?: number
  user: User
  platform?: string
  employee?: Employee
  scheduled_shift?: ScheduledShift
  shift_template?: Shift
  attendance_status?: AttendanceStatus
  approval_status?: ApprovalStatus
  approved_by?: User
  approved_at?: DateTime
  source?: TimeEntrySource
  notes?: string
  late_minutes?: number
  early_leave_minutes?: number
  original_time_entry?: string
}