#!/usr/bin/env node
/**
 * Seed example discount rules, reasons, and role policies.
 * Usage: node scripts/seed-discounts.mjs
 */
import { connect } from 'surrealdb'

const url = process.env.SURREAL_URL || 'ws://127.0.0.1:8000/rpc'
const namespace = process.env.SURREAL_NS || 'posr'
const database = process.env.SURREAL_DB || 'posr'
const user = process.env.SURREAL_USER
const pass = process.env.SURREAL_PASS

const db = await connect(url, { namespace, database, authentication: { username: user, password: pass } })

const reasons = [
  { name: 'Customer Complaint', code: 'customer_complaint' },
  { name: 'Service Recovery', code: 'service_recovery' },
  { name: 'Staff Meal', code: 'staff_meal' },
  { name: 'VIP Customer', code: 'vip_customer' },
  { name: 'Promotional Event', code: 'promotional_event' },
  { name: 'Damaged Product', code: 'damaged_product' },
  { name: 'Manager Decision', code: 'manager_decision', requires_approval: true },
]

for (const r of reasons) {
  try {
    await db.query(
      `CREATE discount_reason SET name = $name, code = $code, is_active = true, requires_approval = $requires_approval`,
      { ...r, requires_approval: r.requires_approval ?? false }
    )
    console.log(`Reason: ${r.name}`)
  } catch {
    console.log(`Reason exists: ${r.name}`)
  }
}

const discounts = [
  {
    name: 'Happy Hour',
    category: 'happy_hour',
    scope: 'cart',
    type: 'Percent',
    value_type: 'percent',
    value: 20,
    min_rate: 20,
    max_rate: 20,
    application_mode: 'automatic',
    schedules: [{ days_of_week: [1, 2, 3, 4, 5], start_time: '15:00', end_time: '18:00' }],
    stackable: true,
    priority: 10,
    tax_treatment: 'tax_after_discount',
    is_active: true,
  },
  {
    name: 'Manager Discount',
    category: 'manager',
    scope: 'cart',
    type: 'Percent',
    value_type: 'percent',
    value: 0,
    min_rate: 0,
    max_rate: 100,
    application_mode: 'manual',
    requires_reason: true,
    stackable: true,
    priority: 50,
    is_active: true,
  },
  {
    name: 'Staff Meal',
    category: 'staff',
    scope: 'customer',
    type: 'Percent',
    value_type: 'percent',
    value: 50,
    min_rate: 50,
    max_rate: 50,
    application_mode: 'both',
    requires_reason: true,
    targets: { customer_tags: ['staff'] },
    priority: 30,
    is_active: true,
  },
]

for (const d of discounts) {
  await db.create('discount', d)
  console.log(`Discount: ${d.name}`)
}

console.log('Seed complete.')
await db.close()
