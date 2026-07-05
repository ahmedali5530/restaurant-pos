import { Tables } from '@/api/db/tables.ts'
import type { ScheduleTemplate } from '@/api/model/schedule_template.ts'
import type { WorkSchedule } from '@/api/model/work_schedule.ts'
import type { DbClient } from '@/lib/labor-engine/types.ts'
import {
  createScheduledShift,
  type GenerateFromTemplateParams,
} from '@/lib/labor-engine/scheduling/schedule.service.ts'
import { getAppTimezone, toLuxonDateTime } from '@/lib/datetime.ts'
import { DateTime as LuxonDateTime } from 'luxon'

const parseTimeOnDate = (date: LuxonDateTime, time: string): LuxonDateTime => {
  const [hourPart, minutePart = '0'] = time.split(':')
  const hour = Number.parseInt(hourPart, 10)
  const minute = Number.parseInt(minutePart, 10)
  return date.set({ hour, minute, second: 0, millisecond: 0 })
}

export const generateShiftsFromTemplate = async (
  db: DbClient,
  params: GenerateFromTemplateParams
): Promise<{ created: number; skipped: number; conflicts: string[] }> => {
  const [templateRows] = await db.query<[ScheduleTemplate[]]>(
    `SELECT * FROM ${Tables.schedule_templates} WHERE id = $id LIMIT 1`,
    { id: params.templateId }
  )
  const template = templateRows?.[0]
  if (!template) {
    throw new Error('Schedule template not found')
  }

  const [scheduleRows] = await db.query<[WorkSchedule[]]>(
    `SELECT * FROM ${Tables.work_schedules} WHERE id = $id LIMIT 1`,
    { id: params.workScheduleId }
  )
  const schedule = scheduleRows?.[0]
  if (!schedule) {
    throw new Error('Work schedule not found')
  }
  if (schedule.status === 'published') {
    throw new Error('Cannot generate shifts on a published schedule')
  }

  const timezone = getAppTimezone()
  const periodStart = toLuxonDateTime(schedule.period_start).setZone(timezone).startOf('day')
  const periodEnd = toLuxonDateTime(schedule.period_end).setZone(timezone).startOf('day')
  const daysOfWeek = new Set(template.days_of_week ?? [])

  let created = 0
  let skipped = 0
  const conflicts: string[] = []

  let cursor = periodStart
  while (cursor <= periodEnd) {
    if (daysOfWeek.has(cursor.weekday)) {
      const shiftStart = parseTimeOnDate(cursor, template.start_time)
      let shiftEnd = parseTimeOnDate(cursor, template.end_time)
      if (shiftEnd <= shiftStart) {
        shiftEnd = shiftEnd.plus({ days: 1 })
      }

      for (const employeeId of params.employeeIds) {
        const result = await createScheduledShift(db, {
          workScheduleId: params.workScheduleId,
          employeeId,
          startAt: shiftStart.toJSDate(),
          endAt: shiftEnd.toJSDate(),
          shiftTemplateId: template.shift_template?.id
            ? String(template.shift_template.id)
            : undefined,
          departmentId: template.department?.id
            ? String(template.department.id)
            : undefined,
          positionId: template.position?.id
            ? String(template.position.id)
            : undefined,
          costCenterId: template.cost_center?.id
            ? String(template.cost_center.id)
            : undefined,
          skipConflictCheck: params.skipConflictCheck,
        })

        if (result.shift?.id) {
          created += 1
        } else {
          skipped += 1
          const message = result.conflicts.map(c => c.message).join('; ')
          if (message) {
            conflicts.push(`${cursor.toFormat('yyyy-MM-dd')} — ${message}`)
          }
        }
      }
    }
    cursor = cursor.plus({ days: 1 })
  }

  return { created, skipped, conflicts }
}
