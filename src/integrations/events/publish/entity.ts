import { createPosEvent } from '@/integrations/events/pos-event-adapter.ts';
import {
  EntityChangeAction,
  EntityChangeDomain,
  EntityChangedPayload,
  entityChangedEventId,
  redactEntitySnapshot,
} from '@/integrations/events/payloads/entity-changed.ts';
import { ManagerLike, safePublish } from '@/integrations/events/publish/safe.ts';

export type EntityAfterWriteInput = {
  domain: EntityChangeDomain;
  table: string;
  entityId: string;
  action: EntityChangeAction;
  before?: any | null;
  after?: any | null;
  changedBy?: string;
  source: string;
  correlationId?: string;
  label?: string;
  /** Stable version for idempotency; defaults to timestamp. */
  versionKey?: string;
  manager?: ManagerLike;
};

export const publishEntityChanged = async (
  manager: ManagerLike,
  payload: EntityChangedPayload,
  versionKey?: string
): Promise<void> => {
  await safePublish(
    manager,
    async (m) => {
      const sanitized: EntityChangedPayload = {
        ...payload,
        entityId: String(payload.entityId),
        table: String(payload.table),
        before:
          payload.before === undefined
            ? undefined
            : redactEntitySnapshot(payload.before),
        after:
          payload.after === undefined
            ? undefined
            : redactEntitySnapshot(payload.after),
      };
      await m.publish(
        createPosEvent(
          'EntityChanged',
          sanitized,
          payload.source || 'domain',
          entityChangedEventId(
            sanitized.table,
            sanitized.entityId,
            sanitized.action,
            versionKey
          )
        )
      );
    },
    'EntityChanged'
  );
};

/** Preferred helper after successful create/update/delete. */
export const entityAfterWrite = async (
  input: EntityAfterWriteInput
): Promise<void> => {
  const {
    manager,
    versionKey,
    domain,
    table,
    entityId,
    action,
    before,
    after,
    changedBy,
    source,
    correlationId,
    label,
  } = input;

  if (!entityId) {
    return;
  }

  await publishEntityChanged(
    manager,
    {
      domain,
      table,
      entityId: String(entityId),
      action,
      before,
      after,
      changedBy: changedBy ? String(changedBy) : undefined,
      source,
      correlationId,
      label,
    },
    versionKey
  );
};
