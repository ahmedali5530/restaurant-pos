import { Tables } from '@/api/db/tables.ts'
import type { LaborCostEvent } from '@/api/model/labor_cost_event.ts'
import type { LaborCostEventType } from '@/api/model/hr.types.ts'
import type { DbClient } from '@/lib/labor-engine/types.ts'
import { toEntityRecordId } from '@/lib/labor-engine/record-id.ts'
import { nowSurrealDateTime, toSurrealDateTime } from '@/lib/datetime.ts'
import type { DateInput } from '@/lib/datetime.ts'

const unwrapRecord = <T>(result: unknown): T => {
  return (Array.isArray(result) ? result[0] : result) as T
}

export interface EmitLaborCostEventParams {
  eventType: LaborCostEventType
  payrollRunId?: string
  periodStart?: DateInput
  periodEnd?: DateInput
  payload?: Record<string, unknown>
}

export const emitLaborCostEvent = async (
  db: DbClient,
  params: EmitLaborCostEventParams
): Promise<LaborCostEvent> => {
  const inserted = await db.create(Tables.labor_cost_events, {
    event_type: params.eventType,
    payroll_run: toEntityRecordId(params.payrollRunId) ?? null,
    period_start: params.periodStart ? toSurrealDateTime(params.periodStart) : null,
    period_end: params.periodEnd ? toSurrealDateTime(params.periodEnd) : null,
    payload: params.payload ?? {},
    emitted_at: nowSurrealDateTime(),
  })

  return unwrapRecord<LaborCostEvent>(inserted)
}
