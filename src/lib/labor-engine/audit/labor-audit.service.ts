import { Tables } from '@/api/db/tables.ts'
import type { LaborAuditLog } from '@/api/model/labor_audit_log.ts'
import type { User } from '@/api/model/user.ts'
import type { DbClient } from '@/lib/labor-engine/types.ts'
import { LABOR_AUDIT_ENABLED } from '@/lib/labor-engine/constants.ts'
import { toUserRecordId } from '@/lib/labor-engine/record-id.ts'
import { nowSurrealDateTime } from '@/lib/datetime.ts'
import { entityAfterWrite } from '@/integrations/events/publish/entity.ts'
import type { EntityChangeAction } from '@/integrations/events/payloads/entity-changed.ts'

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

const mapLaborAction = (action: string): EntityChangeAction => {
  const lower = action.toLowerCase()
  if (lower.includes('create') || lower.includes('insert') || lower.includes('open')) {
    return 'create'
  }
  if (lower.includes('delete') || lower.includes('remove') || lower.includes('void')) {
    return 'delete'
  }
  if (lower.includes('deactivat') || lower.includes('archive')) {
    return 'deactivate'
  }
  if (lower.includes('status') || lower.includes('post') || lower.includes('close') || lower.includes('approve')) {
    return 'status_change'
  }
  return 'update'
}

export const logLaborChange = async (
  db: DbClient,
  params: LogLaborChangeParams
): Promise<LaborAuditLog | null> => {
  // Mirror outward for integration logger regardless of labor audit table flag.
  void entityAfterWrite({
    domain: 'hr',
    table: params.entityType,
    entityId: String(params.entityId),
    action: mapLaborAction(params.action),
    before: params.before,
    after: params.after,
    changedBy: params.changedBy?.id ? String(params.changedBy.id) : undefined,
    source: 'labor-engine',
    label: params.action,
  })

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
