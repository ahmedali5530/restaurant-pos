import type { Employee } from '@/api/model/employee.ts'
import type { ScheduledShift } from '@/api/model/scheduled_shift.ts'
import type { ScheduleConflict } from '@/lib/labor-engine/types.ts'
import { toJsDate } from '@/lib/datetime.ts'
import type { DateInput } from '@/lib/datetime.ts'

const MIN_REST_HOURS = 8
const MAX_DAILY_HOURS = 16

const overlaps = (aStart: number, aEnd: number, bStart: number, bEnd: number): boolean => {
  return aStart < bEnd && aEnd > bStart
}

export const detectConflicts = (
  employee: Employee,
  start: DateInput,
  end: DateInput,
  existingShifts: ScheduledShift[] = []
): ScheduleConflict[] => {
  const conflicts: ScheduleConflict[] = []
  const newStart = toJsDate(start).getTime()
  const newEnd = toJsDate(end).getTime()

  if (newEnd <= newStart) {
    conflicts.push({
      type: 'overlap',
      message: 'Shift end must be after shift start',
    })
    return conflicts
  }

  const newDurationHours = (newEnd - newStart) / (1000 * 60 * 60)
  if (newDurationHours > MAX_DAILY_HOURS) {
    conflicts.push({
      type: 'max_hours_exceeded',
      message: `Shift exceeds maximum daily hours (${MAX_DAILY_HOURS}h)`,
    })
  }

  const sameDayShifts = existingShifts.filter(s => {
    const sStart = toJsDate(s.start_at).getTime()
    const sEnd = toJsDate(s.end_at).getTime()
    const sameDay =
      toJsDate(s.start_at).toDateString() === toJsDate(start).toDateString()
    return sameDay || overlaps(newStart, newEnd, sStart, sEnd)
  })

  let dailyTotal = newDurationHours
  for (const shift of sameDayShifts) {
    const sStart = toJsDate(shift.start_at).getTime()
    const sEnd = toJsDate(shift.end_at).getTime()

    if (overlaps(newStart, newEnd, sStart, sEnd)) {
      conflicts.push({
        type: 'overlap',
        message: 'Shift overlaps with an existing scheduled shift',
        conflictingShiftId: shift.id,
      })
    }

    dailyTotal += (sEnd - sStart) / (1000 * 60 * 60)
  }

  if (dailyTotal > MAX_DAILY_HOURS) {
    conflicts.push({
      type: 'max_hours_exceeded',
      message: `Combined daily hours (${dailyTotal.toFixed(1)}h) exceed limit`,
    })
  }

  for (const shift of existingShifts) {
    const sStart = toJsDate(shift.start_at).getTime()
    const sEnd = toJsDate(shift.end_at).getTime()

    const restBefore = (newStart - sEnd) / (1000 * 60 * 60)
    const restAfter = (sStart - newEnd) / (1000 * 60 * 60)

    if (
      (restBefore > 0 && restBefore < MIN_REST_HOURS) ||
      (restAfter > 0 && restAfter < MIN_REST_HOURS)
    ) {
      conflicts.push({
        type: 'insufficient_rest',
        message: `Less than ${MIN_REST_HOURS}h rest between shifts`,
        conflictingShiftId: shift.id,
      })
    }
  }

  void employee

  return conflicts
}
