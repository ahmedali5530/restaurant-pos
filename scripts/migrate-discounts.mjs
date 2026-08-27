#!/usr/bin/env node
/**
 * One-time migration: populate new discount engine fields on existing discount rows.
 * Run after applying migrations/2026_06_24.surql
 *
 * Usage: node scripts/migrate-discounts.mjs
 */
import { createRemoteEngines, connect } from 'surrealdb'

const url = process.env.SURREAL_URL || 'ws://127.0.0.1:8000/rpc'
const namespace = process.env.SURREAL_NS || 'posr'
const database = process.env.SURREAL_DB || 'posr'
const user = process.env.SURREAL_USER
const pass = process.env.SURREAL_PASS

const db = await connect(url, { namespace, database, authentication: { username: user, password: pass } })

const [rows] = await db.query(
  `SELECT * FROM discount WHERE deleted_at = none`
)

for (const row of rows || []) {
  const valueType = row.type === 'Percent' ? 'percent' : row.type === 'Fixed' ? 'fixed_amount' : (row.value_type || 'percent')
  const minVal = row.min_value ?? row.min_rate ?? 0
  const maxVal = row.max_value ?? row.max_rate ?? minVal

  await db.merge(row.id, {
    category: row.category || 'manual',
    scope: row.scope || 'cart',
    value_type: valueType,
    value: row.value ?? minVal,
    min_value: minVal,
    max_value: maxVal,
    application_mode: row.application_mode || 'manual',
    schedules: row.schedules || [],
    targets: row.targets || {},
    stacking_mode: row.stacking_mode || 'allow',
    exclusive: row.exclusive ?? false,
    stackable: row.stackable ?? true,
    tax_treatment: row.tax_treatment || 'tax_before_discount',
    requires_reason: row.requires_reason ?? false,
    requires_approval: row.requires_approval ?? false,
    stackable_with_coupon: row.stackable_with_coupon ?? true,
    is_active: row.is_active ?? true,
  })
  console.log(`Migrated discount: ${row.name}`)
}

console.log(`Done. Migrated ${(rows || []).length} discount(s).`)
await db.close()
