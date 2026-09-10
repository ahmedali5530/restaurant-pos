import type { Discount } from '@/api/model/discount.ts'
import type { OrderDiscount } from '@/api/model/order_discount.ts'
import type { AppliedDiscountLine } from '@/lib/discount-engine/types.ts'
import type { useDB } from '@/api/db/db.ts'
import type { User } from '@/api/model/user.ts'
import { posStore } from "@/infrastructure/pos-store/pos-store.ts";
import { toTargetId } from '@/lib/discount-engine/target-ids.ts'

export type DbClient = ReturnType<typeof useDB>

const dedupeAppliedLines = (lines: AppliedDiscountLine[]): AppliedDiscountLine[] => {
  const seen = new Set<string>()
  return lines.filter(line => {
    const key = `${toTargetId(line.discountId)}:${(line.lineAllocations || []).map(l => toTargetId(l.orderItemId)).join(',')}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

/**
 * Replace the order_discount junction set for an order (local-first).
 *
 * Rows are written to Dexie with deterministic ids and drained to Surreal via a
 * single `REPLACE_ORDER_RELATION` op that also refreshes the order denorm
 * fields (`discount_amount`, `discount_rate`, `discount`). History lives in the
 * tracking/log table — do not soft-delete with removed_at.
 */
export const persistOrderDiscounts = async (
  _db: DbClient,
  orderId: string,
  lines: AppliedDiscountLine[],
  user?: User,
  _existingIds?: string[],
  seed?: { order: any; items?: any[] },
): Promise<OrderDiscount[]> => {
  const key = String(orderId).includes(':') ? String(orderId) : `order:${orderId}`
  const uniqueLines = dedupeAppliedLines(lines)
  const rows = buildOrderDiscountRows(key, uniqueLines, user)
  const total = uniqueLines.reduce((s, l) => s + l.appliedAmount, 0)
  const primaryRate = uniqueLines[0]?.appliedRate ?? 0

  await posStore.replaceOrderRelation(
    key,
    'order_discounts',
    rows,
    {
      discount_amount: total,
      discount_rate: primaryRate,
      discount: uniqueLines[0]?.discountId ? toTargetId(uniqueLines[0].discountId) : null,
    },
    seed,
  )

  return rows as unknown as OrderDiscount[]
}

const idPart = (id: string): string => {
  const raw = id.includes(':') ? id.slice(id.indexOf(':') + 1) : id
  return raw.replace(/^[⟨`]|[⟩`]$/g, '')
}

/** Deterministic junction rows for an order's applied discount lines. */
export const buildOrderDiscountRows = (
  orderKey: string,
  lines: AppliedDiscountLine[],
  user?: User,
): Array<Record<string, any>> => {
  const now = new Date().toISOString()
  return lines.map((line, index) => {
    const discountId = toTargetId(line.discountId) || line.discountId
    const itemIds = (line.lineAllocations ?? []).map(l => toTargetId(l.orderItemId) || l.orderItemId)
    return {
      id: `order_discount:${idPart(orderKey)}_${idPart(String(discountId))}_${index}`,
      order: orderKey,
      discount: String(discountId),
      name: line.name,
      scope: line.scope,
      value_type: line.valueType,
      applied_amount: line.appliedAmount,
      applied_rate: line.appliedRate ?? null,
      base_amount: line.appliedAmount,
      tax_treatment: line.taxTreatment,
      application_type: line.applicationType,
      reason: line.reasonId ? String(line.reasonId) : null,
      reason_text: line.reasonText || null,
      applied_by: user?.id ? String(user.id) : null,
      order_items: itemIds.map(String),
      line_allocations: (line.lineAllocations ?? []).map(l => ({
        order_item: String(toTargetId(l.orderItemId) || l.orderItemId),
        amount: l.amount,
      })),
      created_at: now,
    }
  })
}

/** Active junction rows for an order, read from the local PosStore. */
export const loadActiveOrderDiscounts = async (
  _db: DbClient,
  orderId: string
): Promise<OrderDiscount[]> => {
  const key = String(orderId).includes(':') ? String(orderId) : `order:${orderId}`
  const { discounts } = await posStore.getOrderChildren(key)
  return discounts.filter(row => !row.removed_at) as OrderDiscount[]
}

/**
 * @deprecated denorm fields are written by `persistOrderDiscounts` in the same
 * REPLACE_ORDER_RELATION op. Kept as a no-op for callers that still chain it.
 */
export const syncOrderDiscountDenorm = async (
  _db: DbClient,
  _orderId: string,
  _lines: AppliedDiscountLine[],
): Promise<void> => {}

export const loadActiveDiscountRules = async (_db?: DbClient): Promise<Discount[]> => {
  return (await posStore.getActiveDiscountRules()) as Discount[]
}
