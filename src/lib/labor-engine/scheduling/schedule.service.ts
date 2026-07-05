import { Tables } from '@/api/db/tables.ts'
import type { Employee } from '@/api/model/employee.ts'
import type { ScheduledShift } from '@/api/model/scheduled_shift.ts'
import type { WorkSchedule } from '@/api/model/work_schedule.ts'
import type { User } from '@/api/model/user.ts'
import type { DbClient, ScheduleConflict } from '@/lib/labor-engine/types.ts'
import { logLaborChange } from '@/lib/labor-engine/audit/labor-audit.service.ts'
import { toEntityRecordId, toUserRecordId } from '@/lib/labor-engine/record-id.ts'
import { detectConflicts } from '@/lib/labor-engine/scheduling/conflict.detector.ts'
import { nowSurrealDateTime, toJsDate, toSurrealDateTime } from '@/lib/datetime.ts'
import type { DateInput } from '@/lib/datetime.ts'

const unwrapRecord = <T>(result: unknown): T => {
  return (Array.isArray(result) ? result[0] : result) as T
}

export interface CreateScheduleParams {
  name: string
  periodStart: DateInput
  periodEnd: DateInput
  createdBy?: User
}

export interface PublishScheduleParams {
  scheduleId: string
  publishedBy: User
}

export interface CreateScheduledShiftParams {
  workScheduleId: string
  employeeId: string
  startAt: DateInput
  endAt: DateInput
  shiftTemplateId?: string
  departmentId?: string
  positionId?: string
  costCenterId?: string
  notes?: string
  skipConflictCheck?: boolean
}

export interface UpdateScheduleParams {
  scheduleId: string
  name: string
  periodStart: DateInput
  periodEnd: DateInput
  changedBy?: User
}

export interface UpdateScheduledShiftParams {
  shiftId: string
  workScheduleId: string
  employeeId: string
  startAt: DateInput
  endAt: DateInput
  shiftTemplateId?: string
  departmentId?: string
  positionId?: string
  costCenterId?: string
  notes?: string
  skipConflictCheck?: boolean
}

export interface GenerateFromTemplateParams {
  workScheduleId: string
  templateId: string
  employeeIds: string[]
  skipConflictCheck?: boolean
}

export const createSchedule = async (
  db: DbClient,
  params: CreateScheduleParams
): Promise<WorkSchedule> => {
  const inserted = await db.create(Tables.work_schedules, {
    name: params.name,
    period_start: toSurrealDateTime(params.periodStart),
    period_end: toSurrealDateTime(params.periodEnd),
    status: 'draft',
  })

  const record = unwrapRecord<WorkSchedule>(inserted)

  await logLaborChange(db, {
    entityType: 'work_schedule',
    entityId: record.id,
    action: 'create_schedule',
    after: record,
    changedBy: params.createdBy,
  })

  return record
}

export const updateSchedule = async (
  db: DbClient,
  params: UpdateScheduleParams
): Promise<WorkSchedule> => {
  const existing = await db.query<[WorkSchedule[]]>(
    `SELECT * FROM ${Tables.work_schedules} WHERE id = $id LIMIT 1`,
    { id: params.scheduleId }
  )
  const before = existing?.[0]?.[0]
  if (!before) {
    throw new Error('Schedule not found')
  }
  if (before.status === 'published') {
    throw new Error('Published schedules cannot be edited')
  }

  const merged = await db.merge(params.scheduleId, {
    name: params.name,
    period_start: toSurrealDateTime(params.periodStart),
    period_end: toSurrealDateTime(params.periodEnd),
  })

  const record = unwrapRecord<WorkSchedule>(merged)

  await logLaborChange(db, {
    entityType: 'work_schedule',
    entityId: record.id,
    action: 'update_schedule',
    before,
    after: record,
    changedBy: params.changedBy,
  })

  return record
}

export const deleteSchedule = async (
  db: DbClient,
  scheduleId: string,
  changedBy?: User
): Promise<void> => {
  const existing = await db.query<[WorkSchedule[]]>(
    `SELECT * FROM ${Tables.work_schedules} WHERE id = $id LIMIT 1`,
    { id: scheduleId }
  )
  const before = existing?.[0]?.[0]
  if (!before) {
    throw new Error('Schedule not found')
  }
  if (before.status === 'published') {
    throw new Error('Published schedules cannot be deleted')
  }

  await db.query(
    `UPDATE ${Tables.scheduled_shifts} SET status = 'cancelled' WHERE work_schedule = $scheduleId`,
    { scheduleId }
  )
  await db.delete(scheduleId)

  await logLaborChange(db, {
    entityType: 'work_schedule',
    entityId: scheduleId,
    action: 'delete_schedule',
    before,
    changedBy,
  })
}

export const publishSchedule = async (
  db: DbClient,
  params: PublishScheduleParams
): Promise<WorkSchedule> => {
  const existing = await db.query<[WorkSchedule[]]>(
    `SELECT * FROM ${Tables.work_schedules} WHERE id = $id LIMIT 1`,
    { id: params.scheduleId }
  )
  const before = existing?.[0]?.[0]

  const merged = await db.merge(params.scheduleId, {
    status: 'published',
    published_at: nowSurrealDateTime(),
    published_by: toUserRecordId(params.publishedBy),
  })

  const record = unwrapRecord<WorkSchedule>(merged)

  await logLaborChange(db, {
    entityType: 'work_schedule',
    entityId: record.id,
    action: 'publish_schedule',
    before,
    after: record,
    changedBy: params.publishedBy,
  })

  return record
}

export const loadEmployeeShifts = async (
  db: DbClient,
  employeeId: string,
  rangeStart: DateInput,
  rangeEnd: DateInput
): Promise<ScheduledShift[]> => {
  const result = await db.query<[ScheduledShift[]]>(
    `SELECT * FROM ${Tables.scheduled_shifts}
     WHERE employee = $employeeId
       AND start_at < $rangeEnd
       AND end_at > $rangeStart
       AND status != 'cancelled'`,
    {
      employeeId,
      rangeStart: toSurrealDateTime(rangeStart),
      rangeEnd: toSurrealDateTime(rangeEnd),
    }
  )
  return result?.[0] ?? []
}

export const createScheduledShift = async (
  db: DbClient,
  params: CreateScheduledShiftParams
): Promise<{ shift: ScheduledShift; conflicts: ScheduleConflict[] }> => {
  const employee = { id: params.employeeId } as Employee
  const existing = await loadEmployeeShifts(
    db,
    params.employeeId,
    params.startAt,
    params.endAt
  )

  const conflicts = params.skipConflictCheck
    ? []
    : detectConflicts(employee, params.startAt, params.endAt, existing)

  const blocking = conflicts.filter(c => c.type === 'overlap')
  if (blocking.length > 0) {
    return { shift: null as unknown as ScheduledShift, conflicts }
  }

  const inserted = await db.create(Tables.scheduled_shifts, {
    work_schedule: toEntityRecordId(params.workScheduleId),
    employee: toEntityRecordId(params.employeeId),
    shift_template: toEntityRecordId(params.shiftTemplateId) ?? null,
    department: toEntityRecordId(params.departmentId) ?? null,
    position: toEntityRecordId(params.positionId) ?? null,
    cost_center: toEntityRecordId(params.costCenterId) ?? null,
    start_at: toSurrealDateTime(params.startAt),
    end_at: toSurrealDateTime(params.endAt),
    status: 'scheduled',
    notes: params.notes ?? null,
  })

  const record = unwrapRecord<ScheduledShift>(inserted)

  await logLaborChange(db, {
    entityType: 'scheduled_shift',
    entityId: record.id,
    action: 'create_scheduled_shift',
    after: record,
  })

  return { shift: record, conflicts }
}

export const updateScheduledShift = async (
  db: DbClient,
  params: UpdateScheduledShiftParams
): Promise<{ shift: ScheduledShift; conflicts: ScheduleConflict[] }> => {
  const existingShifts = await loadEmployeeShifts(
    db,
    params.employeeId,
    params.startAt,
    params.endAt
  )
  const otherShifts = existingShifts.filter(s => s.id !== params.shiftId)

  const conflicts = params.skipConflictCheck
    ? []
    : detectConflicts(
      { id: params.employeeId } as Employee,
      params.startAt,
      params.endAt,
      otherShifts
    )

  const blocking = conflicts.filter(c => c.type === 'overlap')
  if (blocking.length > 0) {
    return { shift: null as unknown as ScheduledShift, conflicts }
  }

  const merged = await db.merge(params.shiftId, {
    work_schedule: toEntityRecordId(params.workScheduleId),
    employee: toEntityRecordId(params.employeeId),
    shift_template: toEntityRecordId(params.shiftTemplateId) ?? null,
    department: toEntityRecordId(params.departmentId) ?? null,
    position: toEntityRecordId(params.positionId) ?? null,
    cost_center: toEntityRecordId(params.costCenterId) ?? null,
    start_at: toSurrealDateTime(params.startAt),
    end_at: toSurrealDateTime(params.endAt),
    notes: params.notes ?? null,
  })

  const record = unwrapRecord<ScheduledShift>(merged)

  await logLaborChange(db, {
    entityType: 'scheduled_shift',
    entityId: record.id,
    action: 'update_scheduled_shift',
    after: record,
  })

  return { shift: record, conflicts }
}

export const cancelScheduledShift = async (
  db: DbClient,
  shiftId: string
): Promise<ScheduledShift> => {
  const merged = await db.merge(shiftId, { status: 'cancelled' })
  const record = unwrapRecord<ScheduledShift>(merged)

  await logLaborChange(db, {
    entityType: 'scheduled_shift',
    entityId: record.id,
    action: 'cancel_scheduled_shift',
    after: record,
  })

  return record
}

export const shiftDurationHours = (shift: ScheduledShift): number => {
  const start = toJsDate(shift.start_at).getTime()
  const end = toJsDate(shift.end_at).getTime()
  return Math.max(0, (end - start) / (1000 * 60 * 60))
}
