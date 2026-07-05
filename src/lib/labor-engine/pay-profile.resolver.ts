import type { Employee } from '@/api/model/employee.ts'
import type { EmployeePayProfile } from '@/api/model/employee_pay_profile.ts'
import type { DateInput } from '@/lib/datetime.ts'
import { toJsDate, toLuxonDateTime } from '@/lib/datetime.ts'

const isProfileEffective = (
  profile: EmployeePayProfile,
  target: Date
): boolean => {
  const from = toJsDate(profile.effective_from)
  if (target < from) return false

  if (profile.effective_to) {
    const to = toJsDate(profile.effective_to)
    if (target > to) return false
  }

  return true
}

/**
 * Pick the pay profile effective on the given date.
 * When multiple profiles match, the one with the latest effective_from wins.
 */
export const resolveEffectivePayProfile = (
  employee: Employee,
  date: DateInput,
  profiles: EmployeePayProfile[]
): EmployeePayProfile | undefined => {
  const target = toJsDate(date)
  const employeeId = employee.id?.toString()

  const matching = profiles
    .filter(p => {
      const profileEmployeeId =
        typeof p.employee === 'object' && p.employee?.id
          ? p.employee.id.toString()
          : String(p.employee)
      return profileEmployeeId === employeeId && isProfileEffective(p, target)
    })
    .sort((a, b) => {
      const aFrom = toLuxonDateTime(a.effective_from).toMillis()
      const bFrom = toLuxonDateTime(b.effective_from).toMillis()
      return bFrom - aFrom
    })

  return matching[0]
}
