import { describe, it, expect } from 'vitest'
import { roundCurrency, allocateProportionally } from '@/lib/discount-engine/rounding.ts'
import { computeDiscountAmount, computeScopedDiscount } from '@/lib/discount-engine/calculator.ts'
import { resolveDiscountConflicts } from '@/lib/discount-engine/resolver.ts'
import { isDiscountScheduleActive, matchesFloor, matchesCustomer } from '@/lib/discount-engine/eligibility.ts'
import type { Discount } from '@/api/model/discount.ts'
import type { DiscountCandidate } from '@/lib/discount-engine/types.ts'
import { evaluateDiscounts } from '@/lib/discount-engine/evaluator.ts'
import { buildDiscountCache } from '@/lib/discount-engine/cache.ts'
import { orderItemToEvaluable } from '@/lib/discount-engine/context.ts'
import { MenuItemType } from '@/api/model/cart_item.ts'
import { PERFORMANCE_BENCHMARK_MS, PERFORMANCE_BENCHMARK_RULES, PERFORMANCE_BENCHMARK_ITEMS } from '@/lib/discount-engine/constants.ts'

const baseDiscount = (overrides: Partial<Discount> = {}): Discount => ({
  id: 'discount:1',
  name: 'Test',
  priority: 1,
  type: 'Percent',
  value_type: 'percent',
  value: 10,
  min_rate: 10,
  max_rate: 10,
  scope: 'cart',
  application_mode: 'automatic',
  stackable: true,
  is_active: true,
  ...overrides,
})

describe('rounding', () => {
  it('rounds half-up to 2 decimals', () => {
    expect(roundCurrency(10.125)).toBe(10.13)
    expect(roundCurrency(10.124)).toBe(10.12)
  })

  it('allocates proportionally with exact sum', () => {
    const result = allocateProportionally(10, [
      { id: 'a', weight: 1 },
      { id: 'b', weight: 2 },
    ])
    const sum = result.reduce((s, r) => s + r.amount, 0)
    expect(sum).toBe(10)
  })
})

describe('calculator', () => {
  it('computes percent discount with cap', () => {
    const d = baseDiscount({ max_cap: 5 })
    const { appliedAmount } = computeDiscountAmount({ discount: d, baseAmount: 100 })
    expect(appliedAmount).toBe(5)
  })

  it('computes fixed amount discount', () => {
    const d = baseDiscount({ type: 'Fixed', value_type: 'fixed_amount', value: 15, min_rate: 15, max_rate: 15 })
    const { appliedAmount } = computeScopedDiscount(d, [{ id: '1', lineTotal: 50, quantity: 1 }])
    expect(appliedAmount).toBe(15)
  })

  it('category scope only discounts matching category lines', () => {
    const d = baseDiscount({
      scope: 'category',
      targets: { category_ids: ['category:pizza', 'category:pasta'] },
    })
    const items = [
      { id: 'line:1', lineTotal: 20, quantity: 1, itemId: 'dish:1', categoryIds: ['category:pizza'] },
      { id: 'line:2', lineTotal: 30, quantity: 1, itemId: 'dish:2', categoryIds: ['category:salad'] },
    ]
    const { appliedAmount } = computeScopedDiscount(d, items)
    expect(appliedAmount).toBe(2)
  })

  it('bxgy free item uses full line total for modifier-priced items', () => {
    const d = baseDiscount({
      category: 'buy_x_get_y',
      conditions: {
        buy_quantity: 2,
        get_quantity: 1,
        buy_targets: { item_ids: ['dish:burger'] },
        get_targets: { item_ids: ['dish:burger'] },
        get_value_type: 'free',
        get_value: 100,
      },
    })
    const items = [
      { id: 'line:1', lineTotal: 15, quantity: 1, itemId: 'dish:burger', categoryIds: [] },
      { id: 'line:2', lineTotal: 15, quantity: 1, itemId: 'dish:burger', categoryIds: [] },
    ]
    const { appliedAmount } = computeScopedDiscount(d, items)
    expect(appliedAmount).toBe(15)
  })

  it('bxgy returns zero when line total is zero', () => {
    const d = baseDiscount({
      category: 'buy_x_get_y',
      conditions: {
        buy_quantity: 1,
        get_quantity: 1,
        buy_targets: { item_ids: ['dish:burger'] },
        get_targets: { item_ids: ['dish:burger'] },
        get_value_type: 'free',
        get_value: 100,
      },
    })
    const items = [
      { id: 'line:1', lineTotal: 0, quantity: 1, itemId: 'dish:burger', categoryIds: [] },
      { id: 'line:2', lineTotal: 0, quantity: 1, itemId: 'dish:burger', categoryIds: [] },
    ]
    const { appliedAmount } = computeScopedDiscount(d, items)
    expect(appliedAmount).toBe(0)
  })

  it('bxgy manual item selection ignores category target mismatch', () => {
    const d = baseDiscount({
      category: 'buy_x_get_y',
      conditions: {
        buy_quantity: 2,
        get_quantity: 1,
        buy_targets: { category_ids: ['category:burgers'] },
        get_targets: { category_ids: ['category:burgers'] },
        get_value_type: 'free',
        get_value: 100,
      },
    })
    const items = [
      { id: 'line:1', lineTotal: 10, quantity: 1, itemId: 'menu_item:a', categoryIds: ['category:other'] },
      { id: 'line:2', lineTotal: 12, quantity: 1, itemId: 'menu_item:b', categoryIds: ['category:other'] },
      { id: 'line:3', lineTotal: 15, quantity: 1, itemId: 'menu_item:c', categoryIds: ['category:other'] },
    ]
    const { appliedAmount } = computeScopedDiscount(d, items, {
      targetItemIds: ['line:1', 'line:2', 'line:3'],
    })
    expect(appliedAmount).toBe(10)
  })

  it('orderItemToEvaluable includes menu category_id on order lines', () => {
    const evaluable = orderItemToEvaluable({
      id: 'order_item:1',
      price: 10,
      quantity: 1,
      category_id: 'category:burgers',
      item: { id: 'menu_item:1', price: 10, categories: [{ id: 'category:other', name: 'Other' }] } as any,
      modifiers: [],
      position: 0,
    } as any)
    expect(evaluable.categoryIds).toEqual(expect.arrayContaining(['category:other', 'category:burgers']))
  })
})

describe('orderItemToEvaluable', () => {
  it('includes modifier prices when base dish price is zero', () => {
    const evaluable = orderItemToEvaluable({
      id: 'order_item:1',
      price: 0,
      quantity: 1,
      item: { id: 'dish:1', price: 0, name: 'Build your own' } as any,
      modifiers: [{
        selectedModifiers: [{
          dish: { id: 'dish:mod1', price: 8, name: 'Protein' } as any,
          price: 8,
          quantity: 1,
          level: 0,
          newOrOld: MenuItemType.new,
        }],
      }] as any,
    } as any)

    expect(evaluable.lineTotal).toBe(8)
  })
})

describe('resolver', () => {
  it('highest_wins keeps largest discount', () => {
    const candidates: DiscountCandidate[] = [
      { discount: baseDiscount({ id: 'a', stacking_mode: 'highest_wins' }), appliedAmount: 5, baseAmount: 100, scope: 'cart', applicationType: 'automatic' },
      { discount: baseDiscount({ id: 'b', stacking_mode: 'highest_wins' }), appliedAmount: 12, baseAmount: 100, scope: 'cart', applicationType: 'automatic' },
    ]
    const { applied } = resolveDiscountConflicts(candidates)
    expect(applied).toHaveLength(1)
    expect(applied[0].appliedAmount).toBe(12)
  })
})

describe('eligibility', () => {
  it('matches happy hour schedule', () => {
    const d = baseDiscount({
      schedules: [{ days_of_week: [1, 2, 3, 4, 5], start_time: '15:00', end_time: '18:00' }],
    })
    const monday4pm = new Date('2026-06-22T16:00:00')
    expect(isDiscountScheduleActive(d, monday4pm)).toBe(true)
    const monday8pm = new Date('2026-06-22T20:00:00')
    expect(isDiscountScheduleActive(d, monday8pm)).toBe(false)
  })

  it('matches floor targets', () => {
    const d = baseDiscount({
      scope: 'floor',
      targets: { floor_ids: ['floor:main'] },
    })
    expect(matchesFloor(d, { floorId: 'floor:main' } as any)).toBe(true)
    expect(matchesFloor(d, { floorId: 'floor:patio' } as any)).toBe(false)
  })

  it('matches customer tags', () => {
    const d = baseDiscount({
      scope: 'customer',
      targets: { customer_tags: ['vip'] },
    })
    expect(matchesCustomer(d, { customer: { id: 'customer:1', tags: ['vip'] } } as any)).toBe(true)
    expect(matchesCustomer(d, { customer: { id: 'customer:2', tags: ['regular'] } } as any)).toBe(false)
  })
})

describe('performance', () => {
  it(`evaluates ${PERFORMANCE_BENCHMARK_RULES} rules on ${PERFORMANCE_BENCHMARK_ITEMS} items under ${PERFORMANCE_BENCHMARK_MS}ms`, () => {
    const rules: Discount[] = Array.from({ length: PERFORMANCE_BENCHMARK_RULES }, (_, i) =>
      baseDiscount({
        id: `discount:${i}`,
        name: `Rule ${i}`,
        priority: i,
        schedules: i % 7 === 0 ? [{ days_of_week: [new Date().getDay()] }] : [],
      })
    )
    buildDiscountCache(rules)

    const items = Array.from({ length: PERFORMANCE_BENCHMARK_ITEMS }, (_, i) => ({
      id: `item:${i}`,
      lineTotal: 10 + i,
      quantity: 1,
      itemId: `dish:${i % 20}`,
      categoryIds: [`cat:${i % 5}`],
    }))

    const start = performance.now()
    evaluateDiscounts({
      items,
      itemsTotal: items.reduce((s, i) => s + i.lineTotal, 0),
      now: new Date(),
      taxRate: 10,
      rules,
      existingApplications: [],
    })
    const elapsed = performance.now() - start
    expect(elapsed).toBeLessThan(PERFORMANCE_BENCHMARK_MS)
  })
})
