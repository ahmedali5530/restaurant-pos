import { Tables } from '@/api/db/tables.ts'
import type { Discount } from '@/api/model/discount.ts'
import type { OrderDiscount } from '@/api/model/order_discount.ts'
import type { AppliedDiscountLine } from '@/lib/discount-engine/types.ts'
import { nowSurrealDateTime } from '@/lib/datetime.ts'
import type { useDB } from '@/api/db/db.ts'
import type { User } from '@/api/model/user.ts'

export type DbClient = ReturnType<typeof useDB>

export const persistOrderDiscounts = async (
  db: DbClient,
  orderId: string,
  lines: AppliedDiscountLine[],
  user?: User,
  existingIds?: string[]
): Promise<OrderDiscount[]> => {
  if (existingIds?.length) {
    for (const id of existingIds) {
      await db.merge(id, {
        removed_at: nowSurrealDateTime(),
        removed_by: user?.id || null,
      })
    }
  }

  const created: OrderDiscount[] = []
  for (const line of lines) {
    const inserted = await db.create(Tables.order_discounts, {
      order: orderId,
      discount: line.discountId,
      name: line.name,
      scope: line.scope,
      value_type: line.valueType,
      applied_amount: line.appliedAmount,
      applied_rate: line.appliedRate ?? null,
      base_amount: line.appliedAmount,
      tax_treatment: line.taxTreatment,
      application_type: line.applicationType,
      reason: line.reasonId || null,
      reason_text: line.reasonText || null,
      applied_by: user?.id || null,
      order_items: line.lineAllocations?.map(l => l.orderItemId) || [],
      line_allocations: line.lineAllocations?.map(l => ({
        order_item: l.orderItemId,
        amount: l.amount,
      })) || [],
      created_at: nowSurrealDateTime(),
    })
    const record = (Array.isArray(inserted) ? inserted[0] : inserted) as unknown as OrderDiscount
    created.push(record)
  }

  return created
}

export const loadActiveOrderDiscounts = async (
  db: DbClient,
  orderId: string
): Promise<OrderDiscount[]> => {
  const result = await db.query<[OrderDiscount[]]>(
    `SELECT * FROM ${Tables.order_discounts}
     WHERE order = $orderId AND removed_at = none
     FETCH discount, reason, applied_by`,
    { orderId }
  )
  return result?.[0] ?? []
}

export const syncOrderDiscountDenorm = async (
  db: DbClient,
  orderId: string,
  lines: AppliedDiscountLine[],
): Promise<void> => {
  const total = lines.reduce((s, l) => s + l.appliedAmount, 0)
  const primaryRate = lines[0]?.appliedRate ?? 0

  await db.merge(orderId, {
    discount_amount: total,
    discount_rate: primaryRate,
    discount: lines[0]?.discountId ?? null,
  })
}

export const loadActiveDiscountRules = async (db: DbClient): Promise<Discount[]> => {
  const result = await db.query<[Discount[]]>(
    `SELECT * FROM ${Tables.discounts} WHERE deleted_at = none AND is_active != false ORDER BY priority ASC`
  )
  return result?.[0] ?? []
}
