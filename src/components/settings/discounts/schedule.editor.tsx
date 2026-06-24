import { useTranslation } from 'react-i18next'
import { Input } from '@/components/common/input/input.tsx'
import { Button } from '@/components/common/input/button.tsx'
import { DatePicker } from '@/components/common/antd/datepicker.tsx'
import type { DiscountSchedule } from '@/api/model/discount.ts'
import { DAY_KEYS } from '@/lib/discount-engine/i18n-options.ts'
import { scheduleDateToValue, valueToScheduleDate } from '@/lib/discount-engine/schedule-dates.ts'

interface Props {
  value: DiscountSchedule[]
  onChange: (schedules: DiscountSchedule[]) => void
}

const emptySchedule = (): DiscountSchedule => ({
  days_of_week: [],
  months: [],
  start_time: '',
  end_time: '',
})

export const DiscountScheduleEditor = ({ value, onChange }: Props) => {
  const { t } = useTranslation('admin')
  const schedules = value?.length ? value : [emptySchedule()]

  const update = (index: number, patch: Partial<DiscountSchedule>) => {
    const next = schedules.map((s, i) => (i === index ? { ...s, ...patch } : s))
    onChange(next)
  }

  const add = () => onChange([...schedules, emptySchedule()])
  const remove = (index: number) => onChange(schedules.filter((_, i) => i !== index))

  const toggleDay = (scheduleIndex: number, dayIndex: number) => {
    const schedule = schedules[scheduleIndex]
    const days = new Set(schedule.days_of_week || [])
    if (days.has(dayIndex)) {
      days.delete(dayIndex)
    } else {
      days.add(dayIndex)
    }
    update(scheduleIndex, { days_of_week: [...days].sort((a, b) => a - b) })
  }

  const isDaySelected = (schedule: DiscountSchedule, dayIndex: number) =>
    (schedule.days_of_week || []).includes(dayIndex)

  return (
    <div className="flex flex-col gap-4">
      {schedules.map((schedule, idx) => (
        <div key={idx} className="border rounded-lg p-3 flex flex-col gap-3">
          <div>
            <label className="block text-sm font-medium mb-2">
              {t('discountEngine.fields.daysOfWeek')}
            </label>
            <div className="input-group flex-wrap w-full">
              {DAY_KEYS.map((dayKey, dayIndex) => (
                <Button
                  key={dayKey}
                  size="sm"
                  type="button"
                  variant={isDaySelected(schedule, dayIndex) ? 'success' : 'neutral'}
                  className="flex-1 min-w-[3rem]"
                  onClick={() => toggleDay(idx, dayIndex)}
                >
                  {t(`discountEngine.days.${dayKey}`)}
                </Button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Input
              label={t('discountEngine.fields.startTime')}
              type="time"
              value={schedule.start_time || ''}
              onChange={e => update(idx, { start_time: e.target.value })}
              placeholder={t('discountEngine.placeholders.startTime')}
            />
            <Input
              label={t('discountEngine.fields.endTime')}
              type="time"
              value={schedule.end_time || ''}
              onChange={e => update(idx, { end_time: e.target.value })}
              placeholder={t('discountEngine.placeholders.endTime')}
            />
            <DatePicker
              label={t('discountEngine.fields.startDate')}
              value={scheduleDateToValue(schedule.start_date)}
              onChange={v => update(idx, { start_date: valueToScheduleDate(v) })}
              isClearable
            />
            <DatePicker
              label={t('discountEngine.fields.endDate')}
              value={scheduleDateToValue(schedule.end_date)}
              onChange={v => update(idx, { end_date: valueToScheduleDate(v) })}
              isClearable
            />
          </div>

          <Button type="button" variant="danger" size="sm" onClick={() => remove(idx)}>
            {t('discountEngine.fields.removeScheduleWindow')}
          </Button>
        </div>
      ))}
      <Button type="button" variant="primary" onClick={add}>
        {t('discountEngine.fields.addScheduleWindow')}
      </Button>
    </div>
  )
}
