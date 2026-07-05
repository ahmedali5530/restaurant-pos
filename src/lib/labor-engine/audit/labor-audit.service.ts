import { Tables } from '@/api/db/tables.ts'
import type { LaborAuditLog } from '@/api/model/labor_audit_log.ts'
import type { User } from '@/api/model/user.ts'
import type { DbClient } from '@/lib/labor-engine/types.ts'
import { LABOR_AUDIT_ENABLED } from '@/lib/labor-engine/constants.ts'
import { toUserRecordId } from '@/lib/labor-engine/record-id.ts'
import { nowSurrealDateTime } from '@/lib/datetime.ts'

const unwrapRecord = <T>(result: unknown): T => {
  return (Array.isArray(result) ? result[0] : result) as T
}

export interface LogLaborChangeParams {
  entityType: string
  entityId: string
  action: string
  before?: unknown
  after?: unknown
  changedBy?: User
}

export const logLaborChange = async (
  db: DbClient,
  params: LogLaborChangeParams
): Promise<LaborAuditLog | null> => {
  if (!LABOR_AUDIT_ENABLED) {
    return null
  }

  const inserted = await db.create(Tables.labor_audit_logs, {
    entity_type: params.entityType,
    entity_id: params.entityId,
    action: params.action,
    before: params.before ?? null,
    after: params.after ?? null,
    changed_by: toUserRecordId(params.changedBy),
    changed_at: nowSurrealDateTime(),
  })

  return unwrapRecord<LaborAuditLog>(inserted)
}
