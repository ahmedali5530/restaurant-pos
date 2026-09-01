import { entityAfterWrite } from '@/integrations/events/publish/entity.ts';
import type {
  EntityChangeDomain,
} from '@/integrations/events/payloads/entity-changed.ts';
import type { ManagerLike } from '@/integrations/events/publish/safe.ts';

/**
 * After a successful form create/update of master data.
 */
export const emitEntityCrudSave = async (params: {
  domain: EntityChangeDomain;
  table: string;
  /** Existing id when updating; new record id or table for creates. */
  entityId: string;
  isUpdate: boolean;
  after?: any;
  source?: string;
  label?: string;
  changedBy?: string;
  manager?: ManagerLike;
}): Promise<void> => {
  await entityAfterWrite({
    manager: params.manager,
    domain: params.domain,
    table: params.table,
    entityId: String(params.entityId),
    action: params.isUpdate ? 'update' : 'create',
    after: params.after,
    source: params.source ?? 'entity-form',
    label: params.label,
    changedBy: params.changedBy,
  });
};

/**
 * After status/activate style merges.
 */
export const emitEntityStatusChange = async (params: {
  domain: EntityChangeDomain;
  table: string;
  entityId: string;
  after?: any;
  source?: string;
  label?: string;
  manager?: ManagerLike;
}): Promise<void> => {
  await entityAfterWrite({
    manager: params.manager,
    domain: params.domain,
    table: params.table,
    entityId: String(params.entityId),
    action: 'status_change',
    after: params.after,
    source: params.source ?? 'entity-form',
    label: params.label,
  });
};
