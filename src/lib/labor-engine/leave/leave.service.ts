import { Tables } from '@/api/db/tables.ts'
import type { LeaveBalance } from '@/api/model/leave_balance.ts'
import type { LeaveRequest } from '@/api/model/leave_request.ts'
import type { User } from '@/api/model/user.ts'
import type { DbClient } from '@/lib/labor-engine/types.ts'
import { logLaborChange } from '@/lib/labor-engine/audit/labor-audit.service.ts'
import { toEntityRecordId, toUserRecordId } from '@/lib/labor-engine/record-id.ts'
import {
  computeAccrual,
  computeRemainingBalance,
} from '@/lib/labor-engine/leave/balance.calculations.ts'
import { nowSurrealDateTime, toLuxonDateTime, toSurrealDateTime } from '@/lib/datetime.ts'
import type { DateInput } from '@/lib/datetime.ts'

const unwrapRecord = <T>(result: unknown): T => {
  return (Array.isArray(result) ? result[0] : result) as T
}

export interface CreateLeaveRequestParams {
  employeeId: string
  leaveTypeId: string
  startDate: DateInput
  endDate: DateInput
  days: number
  reason?: string
  createdBy?: User
}

export interface ApproveLeaveParams {
  requestId: string
  approvedBy: User
}

export interface RejectLeaveParams {
  requestId: string
  rejectedBy: User
}

export interface UpdateBalanceParams {
  employeeId: string
  leaveTypeId: string
  year: number
  accrued?: number
  used?: number
  pending?: number
  carriedOver?: number
}

const countDaysInclusive = (start: DateInput, end: DateInput): number => {
  const s = toLuxonDateTime(start).startOf('day')
  const e = toLuxonDateTime(end).startOf('day')
  return Math.max(1, Math.ceil(e.diff(s, 'days').days) + 1)
}

export const createRequest = async (
  db: DbClient,
  params: CreateLeaveRequestParams
): Promise<LeaveRequest> => {
  const days = params.days > 0 ? params.days : countDaysInclusive(params.startDate, params.endDate)

  const inserted = await db.create(Tables.leave_requests, {
    employee: toEntityRecordId(params.employeeId),
    leave_type: toEntityRecordId(params.leaveTypeId),
    start_date: toSurrealDateTime(params.startDate),
    end_date: toSurrealDateTime(params.endDate),
    days,
    status: 'pending',
    reason: params.reason ?? null,
    created_at: nowSurrealDateTime(),
    created_by: toUserRecordId(params.createdBy),
  })

  const record = unwrapRecord<LeaveRequest>(inserted)

  const year = toLuxonDateTime(params.startDate).year
  const balance = await loadBalance(db, params.employeeId, params.leaveTypeId, year)

  await updateBalance(db, {
    employeeId: params.employeeId,
    leaveTypeId: params.leaveTypeId,
    year,
    accrued: balance?.accrued,
    used: balance?.used,
    pending: (balance?.pending ?? 0) + days,
    carriedOver: balance?.carried_over,
  })

  await logLaborChange(db, {
    entityType: 'leave_request',
    entityId: record.id,
    action: 'create_leave_request',
    after: record,
    changedBy: params.createdBy,
  })

  return record
}

export const approveRequest = async (
  db: DbClient,
  params: ApproveLeaveParams
): Promise<LeaveRequest> => {
  const existing = await db.query<[LeaveRequest[]]>(
    `SELECT * FROM ${Tables.leave_requests} WHERE id = $id FETCH leave_type LIMIT 1`,
    { id: params.requestId }
  )
  const before = existing?.[0]?.[0]
  if (!before) throw new Error('Leave request not found')

  const merged = await db.merge(params.requestId, {
    status: 'approved',
    approved_by: toUserRecordId(params.approvedBy),
    approved_at: nowSurrealDateTime(),
  })

  const record = unwrapRecord<LeaveRequest>(merged)
  const year = toLuxonDateTime(before.start_date).year
  const leaveTypeId =
    typeof before.leave_type === 'object'
      ? before.leave_type.id
      : String(before.leave_type)
  const employeeId =
    typeof before.employee === 'object'
      ? before.employee.id
      : String(before.employee)

  const balance = await loadBalance(db, employeeId, leaveTypeId, year)
  const pending = Math.max(0, (balance?.pending ?? 0) - (before.days ?? 0))
  const used = (balance?.used ?? 0) + (before.days ?? 0)

  await updateBalance(db, {
    employeeId,
    leaveTypeId,
    year,
    accrued: balance?.accrued,
    used,
    pending,
    carriedOver: balance?.carried_over,
  })

  await logLaborChange(db, {
    entityType: 'leave_request',
    entityId: record.id,
    action: 'approve_leave_request',
    before,
    after: record,
    changedBy: params.approvedBy,
  })

  return record
}

export const rejectRequest = async (
  db: DbClient,
  params: RejectLeaveParams
): Promise<LeaveRequest> => {
  const existing = await db.query<[LeaveRequest[]]>(
    `SELECT * FROM ${Tables.leave_requests} WHERE id = $id LIMIT 1`,
    { id: params.requestId }
  )
  const before = existing?.[0]?.[0]
  if (!before) throw new Error('Leave request not found')

  const merged = await db.merge(params.requestId, {
    status: 'rejected',
    approved_by: toUserRecordId(params.rejectedBy),
    approved_at: nowSurrealDateTime(),
  })

  const record = unwrapRecord<LeaveRequest>(merged)
  const year = toLuxonDateTime(before.start_date).year
  const leaveTypeId =
    typeof before.leave_type === 'object'
      ? before.leave_type.id
      : String(before.leave_type)
  const employeeId =
    typeof before.employee === 'object'
      ? before.employee.id
      : String(before.employee)

  const balance = await loadBalance(db, employeeId, leaveTypeId, year)
  const pending = Math.max(0, (balance?.pending ?? 0) - (before.days ?? 0))

  await updateBalance(db, {
    employeeId,
    leaveTypeId,
    year,
    accrued: balance?.accrued,
    used: balance?.used,
    pending,
    carriedOver: balance?.carried_over,
  })

  await logLaborChange(db, {
    entityType: 'leave_request',
    entityId: record.id,
    action: 'reject_leave_request',
    before,
    after: record,
    changedBy: params.rejectedBy,
  })

  return record
}

const loadBalance = async (
  db: DbClient,
  employeeId: string,
  leaveTypeId: string,
  year: number
): Promise<LeaveBalance | undefined> => {
  const result = await db.query<[LeaveBalance[]]>(
    `SELECT * FROM ${Tables.leave_balances}
     WHERE employee = $employeeId AND leave_type = $leaveTypeId AND year = $year
     LIMIT 1`,
    { employeeId, leaveTypeId, year }
  )
  return result?.[0]?.[0]
}

export const updateBalance = async (
  db: DbClient,
  params: UpdateBalanceParams
): Promise<LeaveBalance> => {
  const existing = await loadBalance(
    db,
    params.employeeId,
    params.leaveTypeId,
    params.year
  )

  const accrued =
    params.accrued ??
    existing?.accrued ??
    computeAccrual({ accrualRate: 0, monthsEmployed: 0 })
  const used = params.used ?? existing?.used ?? 0
  const pending = params.pending ?? existing?.pending ?? 0
  const carriedOver = params.carriedOver ?? existing?.carried_over ?? 0

  const { remaining } = computeRemainingBalance({
    accrued,
    used,
    pending,
    carriedOver,
  })

  if (existing?.id) {
    const merged = await db.merge(existing.id, {
      accrued,
      used,
      pending,
      carried_over: carriedOver,
    })
    return unwrapRecord<LeaveBalance>(merged)
  }

  const inserted = await db.create(Tables.leave_balances, {
    employee: toEntityRecordId(params.employeeId),
    leave_type: toEntityRecordId(params.leaveTypeId),
    year: params.year,
    accrued,
    used,
    pending,
    carried_over: carriedOver,
  })

  const record = unwrapRecord<LeaveBalance>(inserted)

  await logLaborChange(db, {
    entityType: 'leave_balance',
    entityId: record.id,
    action: 'update_leave_balance',
    after: { ...record, remaining },
  })

  return record
}
