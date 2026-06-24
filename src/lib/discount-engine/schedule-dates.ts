import { parseDate } from '@internationalized/date'
import type { DateValue } from 'react-aria-components'

export const scheduleDateToValue = (iso?: string): DateValue | null => {
  if (!iso) return null
  const datePart = iso.slice(0, 10)
  try {
    return parseDate(datePart)
  } catch {
    return null
  }
}

export const valueToScheduleDate = (value: DateValue | null | undefined): string | undefined => {
  if (!value) return undefined
  const month = String(value.month).padStart(2, '0')
  const day = String(value.day).padStart(2, '0')
  return `${value.year}-${month}-${day}`
}
