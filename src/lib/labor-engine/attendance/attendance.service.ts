import { Tables } from '@/api/db/tables.ts'
import type { TimeEntry } from '@/api/model/time_entry.ts'
import type { TimeEntryBreak } from '@/api/model/time_entry_break.ts'
import type { User } from '@/api/model/user.ts'
import type { DbClient } from '@/lib/labor-engine/types.ts'
import { logLaborChange } from '@/lib/labor-engine/audit/labor-audit.service.ts'
import { toEntityRecordId, toUserRecordId } from '@/lib/labor-engine/record-id.ts'
import { nowSurrealDateTime, toSurrealDateTime } from '@/lib/datetime.ts'
import type { DateInput } from '@/lib/datetime.ts'

const unwrapRecord = <T>(result: unknown): T => {
  return (Array.isArray(result) ? result[0] : result) as T
}

export interface ClockInParams {
  user: User
  employeeId: string
  platform?: string
  scheduledShiftId?: string
  shiftTemplateId?: string
  clockInAt?: DateInput
  notes?: string
}

export interface ClockOutParams {
  timeEntryId: string
  clockOutAt?: DateInput
  user?: User
}

export interface BreakParams {
  timeEntryId: string
  breakType: 'paid' | 'unpaid'
  startAt?: DateInput
  user?: User
}

export interface EndBreakParams {
  breakId: string
  endAt?: DateInput
  user?: User
}

export interface ManualEntryParams {
  user: User
  employeeId: string
  clockIn: DateInput
  clockOut: DateInput
  notes?: string
  scheduledShiftId?: string
}

export interface ApproveEntryParams {
  timeEntryId: string
  approvedBy: User
  notes?: string
  source?: string
}

export const clockIn = async (
  db: DbClient,
  params: ClockInParams
): Promise<TimeEntry> => {
  const clockInAt = toSurrealDateTime(params.clockInAt ?? nowSurrealDateTime())

  const inserted = await db.create(Tables.time_entries, {
    clock_in: clockInAt,
    user: toUserRecordId(params.user),
    employee: toEntityRecordId(params.employeeId),
    platform: params.platform ?? null,
    scheduled_shift: toEntityRecordId(params.scheduledShiftId) ?? null,
    shift_template: toEntityRecordId(params.shiftTemplateId) ?? null,
    source: 'clock',
    approval_status: 'pending',
    attendance_status: 'present',
    notes: params.notes ?? null,
  })

  const record = unwrapRecord<TimeEntry>(inserted)

  await logLaborChange(db, {
    entityType: 'time_entry',
    entityId: record.id,
    action: 'clock_in',
    after: record,
    changedBy: params.user,
  })

  return record
}

export const clockOut = async (
  db: DbClient,
  params: ClockOutParams
): Promise<TimeEntry> => {
  const clockOutAt = toSurrealDateTime(params.clockOutAt ?? nowSurrealDateTime())

  const existing = await db.query<[TimeEntry[]]>(
    `SELECT * FROM ${Tables.time_entries} WHERE id = $id LIMIT 1`,
    { id: params.timeEntryId }
  )
  const before = existing?.[0]?.[0]

  const startMs = before?.clock_in
    ? new Date(String(before.clock_in)).getTime()
    : Date.now()
  const endMs = new Date(String(clockOutAt)).getTime()
  const durationSeconds = Math.max(0, Math.floor((endMs - startMs) / 1000))

  const merged = await db.merge(params.timeEntryId, {
    clock_out: clockOutAt,
    duration_seconds: durationSeconds,
  })

  const record = unwrapRecord<TimeEntry>(merged)

  await logLaborChange(db, {
    entityType: 'time_entry',
    entityId: record.id,
    action: 'clock_out',
    before,
    after: record,
    changedBy: params.user,
  })

  return record
}

export const startBreak = async (
  db: DbClient,
  params: BreakParams
): Promise<TimeEntryBreak> => {
  const startAt = toSurrealDateTime(params.startAt ?? nowSurrealDateTime())

  const inserted = await db.create(Tables.time_entry_breaks, {
    time_entry: toEntityRecordId(params.timeEntryId),
    break_type: params.breakType,
    start_at: startAt,
  })

  const record = unwrapRecord<TimeEntryBreak>(inserted)

  await logLaborChange(db, {
    entityType: 'time_entry_break',
    entityId: record.id,
    action: 'start_break',
    after: record,
    changedBy: params.user,
  })

  return record
}

export const endBreak = async (
  db: DbClient,
  params: EndBreakParams
): Promise<TimeEntryBreak> => {
  const endAt = toSurrealDateTime(params.endAt ?? nowSurrealDateTime())

  const existing = await db.query<[TimeEntryBreak[]]>(
    `SELECT * FROM ${Tables.time_entry_breaks} WHERE id = $id LIMIT 1`,
    { id: params.breakId }
  )
  const before = existing?.[0]?.[0]

  const startMs = before?.start_at
    ? new Date(String(before.start_at)).getTime()
    : Date.now()
  const endMs = new Date(String(endAt)).getTime()
  const durationSeconds = Math.max(0, Math.floor((endMs - startMs) / 1000))

  const merged = await db.merge(params.breakId, {
    end_at: endAt,
    duration_seconds: durationSeconds,
  })

  const record = unwrapRecord<TimeEntryBreak>(merged)

  await logLaborChange(db, {
    entityType: 'time_entry_break',
    entityId: record.id,
    action: 'end_break',
    before,
    after: record,
    changedBy: params.user,
  })

  return record
}

export const createManualEntry = async (
  db: DbClient,
  params: ManualEntryParams
): Promise<TimeEntry> => {
  const clockInAt = toSurrealDateTime(params.clockIn)
  const clockOutAt = toSurrealDateTime(params.clockOut)
  const startMs = new Date(String(clockInAt)).getTime()
  const endMs = new Date(String(clockOutAt)).getTime()
  const durationSeconds = Math.max(0, Math.floor((endMs - startMs) / 1000))

  const inserted = await db.create(Tables.time_entries, {
    clock_in: clockInAt,
    clock_out: clockOutAt,
    duration_seconds: durationSeconds,
    user: toUserRecordId(params.user),
    employee: toEntityRecordId(params.employeeId),
    scheduled_shift: toEntityRecordId(params.scheduledShiftId) ?? null,
    source: 'manual',
    approval_status: 'pending',
    attendance_status: 'manual',
    notes: params.notes ?? null,
  })

  const record = unwrapRecord<TimeEntry>(inserted)

  await logLaborChange(db, {
    entityType: 'time_entry',
    entityId: record.id,
    action: 'create_manual_entry',
    after: record,
    changedBy: params.user,
  })

  return record
}

export const approveEntry = async (
  db: DbClient,
  params: ApproveEntryParams
): Promise<TimeEntry> => {
  const existing = await db.query<[TimeEntry[]]>(
    `SELECT * FROM ${Tables.time_entries} WHERE id = $id LIMIT 1`,
    { id: params.timeEntryId }
  )
  const before = existing?.[0]?.[0]

  const merged = await db.merge(params.timeEntryId, {
    approval_status: 'approved',
    attendance_status: 'approved',
    approved_by: toUserRecordId(params.approvedBy),
    approved_at: nowSurrealDateTime(),
    notes: params.notes ?? before?.notes ?? null,
    source: params.source
  })

  const record = unwrapRecord<TimeEntry>(merged)

  await logLaborChange(db, {
    entityType: 'time_entry',
    entityId: record.id.toString(),
    action: 'approve_entry',
    before,
    after: record,
    changedBy: params.approvedBy,
  })

  return record
}
