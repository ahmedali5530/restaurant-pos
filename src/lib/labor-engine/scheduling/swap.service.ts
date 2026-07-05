import { Tables } from '@/api/db/tables.ts'
import type { ShiftSwapRequest } from '@/api/model/shift_swap_request.ts'
import type { User } from '@/api/model/user.ts'
import type { DbClient } from '@/lib/labor-engine/types.ts'
import { logLaborChange } from '@/lib/labor-engine/audit/labor-audit.service.ts'
import { toEntityRecordId, toUserRecordId } from '@/lib/labor-engine/record-id.ts'
import { nowSurrealDateTime } from '@/lib/datetime.ts'

const unwrapRecord = <T>(result: unknown): T => {
  return (Array.isArray(result) ? result[0] : result) as T
}

export interface RequestSwapParams {
  scheduledShiftId: string
  requestingEmployeeId: string
  targetEmployeeId?: string
  proposedShiftId?: string
}

export interface ApproveSwapParams {
  swapRequestId: string
  approvedBy: User
}

export interface RejectSwapParams {
  swapRequestId: string
  rejectedBy: User
}

export const requestSwap = async (
  db: DbClient,
  params: RequestSwapParams
): Promise<ShiftSwapRequest> => {
  const inserted = await db.create(Tables.shift_swap_requests, {
    scheduled_shift: toEntityRecordId(params.scheduledShiftId),
    requesting_employee: toEntityRecordId(params.requestingEmployeeId),
    target_employee: toEntityRecordId(params.targetEmployeeId) ?? null,
    proposed_shift: toEntityRecordId(params.proposedShiftId) ?? null,
    status: 'pending',
  })

  const record = unwrapRecord<ShiftSwapRequest>(inserted)

  await logLaborChange(db, {
    entityType: 'shift_swap_request',
    entityId: record.id,
    action: 'request_swap',
    after: record,
  })

  return record
}

export const approveSwap = async (
  db: DbClient,
  params: ApproveSwapParams
): Promise<ShiftSwapRequest> => {
  const existing = await db.query<[ShiftSwapRequest[]]>(
    `SELECT * FROM ${Tables.shift_swap_requests}
     WHERE id = $id
     FETCH scheduled_shift, target_employee, proposed_shift
     LIMIT 1`,
    { id: params.swapRequestId }
  )
  const before = existing?.[0]?.[0]
  if (!before) {
    throw new Error('Swap request not found')
  }

  const merged = await db.merge(params.swapRequestId, {
    status: 'approved',
    approved_by: toUserRecordId(params.approvedBy),
    approved_at: nowSurrealDateTime(),
  })

  const record = unwrapRecord<ShiftSwapRequest>(merged)

  if (before.target_employee && before.scheduled_shift) {
    const shiftId =
      typeof before.scheduled_shift === 'object'
        ? before.scheduled_shift.id
        : String(before.scheduled_shift)
    const targetId =
      typeof before.target_employee === 'object'
        ? before.target_employee.id
        : String(before.target_employee)

    await db.merge(shiftId, { employee: toEntityRecordId(targetId) })
  }

  if (before.proposed_shift && before.requesting_employee) {
    const proposedId =
      typeof before.proposed_shift === 'object'
        ? before.proposed_shift.id
        : String(before.proposed_shift)
    const requesterId =
      typeof before.requesting_employee === 'object'
        ? before.requesting_employee.id
        : String(before.requesting_employee)

    await db.merge(proposedId, { employee: toEntityRecordId(requesterId) })
  }

  await logLaborChange(db, {
    entityType: 'shift_swap_request',
    entityId: record.id,
    action: 'approve_swap',
    before,
    after: record,
    changedBy: params.approvedBy,
  })

  return record
}

export const rejectSwap = async (
  db: DbClient,
  params: RejectSwapParams
): Promise<ShiftSwapRequest> => {
  const existing = await db.query<[ShiftSwapRequest[]]>(
    `SELECT * FROM ${Tables.shift_swap_requests} WHERE id = $id LIMIT 1`,
    { id: params.swapRequestId }
  )
  const before = existing?.[0]?.[0]

  const merged = await db.merge(params.swapRequestId, {
    status: 'rejected',
    approved_by: toUserRecordId(params.rejectedBy),
    approved_at: nowSurrealDateTime(),
  })

  const record = unwrapRecord<ShiftSwapRequest>(merged)

  await logLaborChange(db, {
    entityType: 'shift_swap_request',
    entityId: record.id,
    action: 'reject_swap',
    before,
    after: record,
    changedBy: params.rejectedBy,
  })

  return record
}
