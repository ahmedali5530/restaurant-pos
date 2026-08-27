#!/usr/bin/env node
/**
 * Backfill order_discount rows from legacy order.discount fields.
 * Usage: node scripts/backfill-order-discounts.mjs
 */
import { connect } from 'surrealdb'

const url = process.env.SURREAL_URL || 'ws://127.0.0.1:8000/rpc'
const namespace = process.env.SURREAL_NS || 'posr'
const database = process.env.SURREAL_DB || 'posr'
const user = process.env.SURREAL_USER
const pass = process.env.SURREAL_PASS

const db = await connect(url, { namespace, database, authentication: { username: user, password: pass } })

const [orders] = await db.query(
  `SELECT * FROM order WHERE discount_amount > 0 AND discount != NONE FETCH discount`
)

let created = 0
for (const order of orders || []) {
  const [existing] = await db.query(
    `SELECT count() AS c FROM order_discount WHERE order = $oid GROUP ALL`,
    { oid: order.id }
  )
  if ((existing?.[0]?.c || 0) > 0) continue

  const d = order.discount
  if (!d) continue

  await db.create('order_discount', {
    order: order.id,
    discount: d.id,
    name: d.name || 'Discount',
    scope: 'cart',
    value_type: d.value_type || (d.type === 'Percent' ? 'percent' : 'fixed_amount'),
    applied_amount: order.discount_amount,
    applied_rate: order.discount_rate ?? null,
    base_amount: order.discount_amount,
    tax_treatment: d.tax_treatment || 'tax_before_discount',
    application_type: 'manual',
    line_allocations: [],
    order_items: [],
  })
  created++
}

console.log(`Backfilled ${created} order_discount row(s).`)
await db.close()
