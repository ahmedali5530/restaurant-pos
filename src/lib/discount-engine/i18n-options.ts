import type { TFunction } from 'i18next'

export const translatedSelectOptions = (
  keys: string[],
  t: TFunction,
  prefix: string
) => keys.map(value => ({
  value,
  label: t(`${prefix}.${value}`, { defaultValue: value }),
}))

export const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const

export const DAY_INDEX_BY_KEY: Record<string, number> = {
  sun: 0,
  mon: 1,
  tue: 2,
  wed: 3,
  thu: 4,
  fri: 5,
  sat: 6,
}

export const DAY_KEY_BY_INDEX: Record<number, string> = {
  0: 'sun',
  1: 'mon',
  2: 'tue',
  3: 'wed',
  4: 'thu',
  5: 'fri',
  6: 'sat',
}
