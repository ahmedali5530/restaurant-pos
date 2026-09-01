import { Tables } from '@/api/db/tables.ts'
import type { PayrollPeriod } from '@/api/model/payroll_period.ts'
import type { User } from '@/api/model/user.ts'
import type { PayrollPeriodType } from '@/api/model/hr.types.ts'
import type { DbClient } from '@/lib/labor-engine/types.ts'
import { logLaborChange } from '@/lib/labor-engine/audit/labor-audit.service.ts'
import { toUserRecordId } from '@/lib/labor-engine/record-id.ts'
import { nowSurrealDateTime, toSurrealDateTime } from '@/lib/datetime.ts'
import { toRecordId } from '@/lib/utils.ts'
import type { DateInput } from '@/lib/datetime.ts'

const unwrapRecord = <T>(result: unknown): T => {
  return (Array.isArray(result) ? result[0] : result) as T
}

export interface CreatePeriodParams {
  name: string
  periodType?: PayrollPeriodType
  startDate: DateInput
  endDate: DateInput
}

export interface LockPeriodParams {
  periodId: string
  lockedBy: User
}

export interface ClosePeriodParams {
  periodId: string
  closedBy?: User
}

export const createPeriod = async (
  db: DbClient,
  params: CreatePeriodParams
): Promise<PayrollPeriod> => {
  const inserted = await db.create(Tables.payroll_periods, {
    name: params.name,
    period_type: params.periodType ?? 'monthly',
    start_date: toSurrealDateTime(params.startDate),
    end_date: toSurrealDateTime(params.endDate),
    status: 'open',
  })

  const record = unwrapRecord<PayrollPeriod>(inserted)

  await logLaborChange(db, {
    entityType: 'payroll_period',
    entityId: record.id,
    action: 'create_period',
    after: record,
  })

  return record
}

export const lockPeriod = async (
  db: DbClient,
  params: LockPeriodParams
): Promise<PayrollPeriod> => {
  const existing = await db.query<[PayrollPeriod[]]>(
    `SELECT * FROM ${Tables.payroll_periods} WHERE id = $id LIMIT 1`,
    { id: toRecordId(params.periodId) }
  )
  const before = existing?.[0]?.[0]

  const merged = await db.merge(params.periodId, {
    status: 'locked',
    locked_at: nowSurrealDateTime(),
    locked_by: toUserRecordId(params.lockedBy),
  })

  const record = unwrapRecord<PayrollPeriod>(merged)

  await logLaborChange(db, {
    entityType: 'payroll_period',
    entityId: record.id,
    action: 'lock_period',
    before,
    after: record,
    changedBy: params.lockedBy,
  })

  return record
}

export const closePeriod = async (
  db: DbClient,
  params: ClosePeriodParams
): Promise<PayrollPeriod> => {
  const existing = await db.query<[PayrollPeriod[]]>(
    `SELECT * FROM ${Tables.payroll_periods} WHERE id = $id LIMIT 1`,
    { id: toRecordId(params.periodId) }
  )
  const before = existing?.[0]?.[0]

  const merged = await db.merge(params.periodId, {
    status: 'closed',
    closed_at: nowSurrealDateTime(),
  })

  const record = unwrapRecord<PayrollPeriod>(merged)

  await logLaborChange(db, {
    entityType: 'payroll_period',
    entityId: record.id,
    action: 'close_period',
    before,
    after: record,
    changedBy: params.closedBy,
  })

  return record
}
