import type { Discount, DiscountSchedule } from '@/api/model/discount.ts'
import type { EvaluationContext } from '@/lib/discount-engine/types.ts'
import { toTargetId } from '@/lib/discount-engine/target-ids.ts'

const parseTimeToMinutes = (time?: string): number | undefined => {
  if (!time) return undefined
  const [hh, mm] = time.split(':').map(Number)
  if (Number.isNaN(hh) || Number.isNaN(mm)) return undefined
  return hh * 60 + mm
}

const isScheduleActive = (schedule: DiscountSchedule, now: Date): boolean => {
  const day = now.getDay()
  const month = now.getMonth() + 1
  const minutes = now.getHours() * 60 + now.getMinutes()

  if (schedule.days_of_week?.length && !schedule.days_of_week.includes(day)) {
    return false
  }
  if (schedule.months?.length && !schedule.months.includes(month)) {
    return false
  }
  if (schedule.start_date) {
    const start = new Date(schedule.start_date)
    start.setHours(0, 0, 0, 0)
    if (now < start) return false
  }
  if (schedule.end_date) {
    const end = new Date(schedule.end_date)
    end.setHours(23, 59, 59, 999)
    if (now > end) return false
  }

  const startMin = parseTimeToMinutes(schedule.start_time)
  const endMin = parseTimeToMinutes(schedule.end_time)
  if (startMin !== undefined && endMin !== undefined) {
    if (startMin <= endMin) {
      if (minutes < startMin || minutes > endMin) return false
    } else {
      // overnight window e.g. 22:00 - 02:00
      if (minutes < startMin && minutes > endMin) return false
    }
  } else {
    if (startMin !== undefined && minutes < startMin) return false
    if (endMin !== undefined && minutes > endMin) return false
  }

  return true
}

export const isDiscountScheduleActive = (discount: Discount, now: Date): boolean => {
  const schedules = discount.schedules || []
  if (schedules.length === 0) {
    return true
  }
  return schedules.some(s => isScheduleActive(s, now))
}

export const isDiscountActive = (discount: Discount): boolean => {
  if (discount.deleted_at) return false
  if (discount.is_active === false) return false
  return true
}

export const matchesApplicationMode = (
  discount: Discount,
  mode: 'automatic' | 'manual'
): boolean => {
  const appMode = discount.application_mode || 'manual'
  if (appMode === 'both') return true
  return appMode === mode
}

export const matchesOrderType = (discount: Discount, ctx: EvaluationContext): boolean => {
  const schedules = discount.schedules || []
  const orderTypeIds = schedules.flatMap(s => s.order_type_ids || [])
  if (orderTypeIds.length === 0) return true
  const ctxId = ctx.orderType?.id?.toString()
  return !!ctxId && orderTypeIds.includes(ctxId)
}

export const matchesFloor = (discount: Discount, ctx: EvaluationContext): boolean => {
  const floors = discount.applicable_floors || discount.targets?.floor_ids || []
  if (!floors.length) return true
  const floorId = ctx.floorId
  if (!floorId) return false
  return floors.some(f => toTargetId(f) === toTargetId(floorId))
}

export const matchesMinOrderAmount = (discount: Discount, itemsTotal: number): boolean => {
  if (discount.min_order_amount === undefined || discount.min_order_amount === null) {
    return true
  }
  return itemsTotal >= Number(discount.min_order_amount)
}

export const matchesCustomer = (discount: Discount, ctx: EvaluationContext): boolean => {
  const targets = discount.targets
  if (!targets) return true

  if (discount.scope === 'customer' || targets.customer_ids?.length || targets.customer_tags?.length) {
    const customer = ctx.customer
    if (!customer) return false

    if (targets.customer_ids?.length) {
      const cid = customer.id?.toString()
      if (!cid || !targets.customer_ids.some(id => toTargetId(id) === cid)) return false
    }
    if (targets.customer_tags?.length) {
      const tags = customer.tags || []
      if (!targets.customer_tags.some(t => tags.includes(t))) return false
    }
  }
  return true
}

export const isEligibleForAuto = (discount: Discount, ctx: EvaluationContext): boolean => {
  if (!isDiscountActive(discount)) return false
  if (!matchesApplicationMode(discount, 'automatic')) return false
  if (!isDiscountScheduleActive(discount, ctx.now)) return false
  if (!matchesOrderType(discount, ctx)) return false
  if (!matchesFloor(discount, ctx)) return false
  if (!matchesMinOrderAmount(discount, ctx.itemsTotal)) return false
  if (!matchesCustomer(discount, ctx)) return false
  return true
}

export const isEligibleForManual = (discount: Discount, ctx: EvaluationContext): boolean => {
  if (!isDiscountActive(discount)) return false
  if (!matchesApplicationMode(discount, 'manual')) return false
  if (!matchesFloor(discount, ctx)) return false
  if (!matchesMinOrderAmount(discount, ctx.itemsTotal)) return false
  if (!matchesCustomer(discount, ctx)) return false
  return true
}
