import {toRecordId} from "@/lib/utils.ts";
import {toast} from "sonner";
import i18n from '@/lib/i18n.ts';
import { entityAfterWrite } from '@/integrations/events/publish/entity.ts';
import type { EntityChangeDomain } from '@/integrations/events/payloads/entity-changed.ts';
import type { ManagerLike } from '@/integrations/events/publish/safe.ts';

type DeleteQuery = {
  query: string;
  params?: Record<string, any>;
};

interface ExecuteDeleteOptions {
  db: any;
  id: string;
  entityLabel: string;
  usageChecks?: DeleteQuery[];
  cleanupQueries?: DeleteQuery[];
  onAfter?: () => void | Promise<void>;
  /** When set, emits EntityChanged for integration logger. */
  table?: string;
  domain?: EntityChangeDomain;
  manager?: ManagerLike;
  changedBy?: string;
}

const toCount = (value: any): number => {
  if (typeof value?.count === "number") {
    return value.count;
  }
  if (typeof value?.["count()"] === "number") {
    return value["count()"];
  }
  return 0;
};

const hasResults = (queryResult: any): boolean => {
  if (!Array.isArray(queryResult) || queryResult.length === 0) {
    return false;
  }

  const first = queryResult[0];
  if (Array.isArray(first)) {
    const total = first.reduce((sum: number, row: any) => sum + toCount(row), 0);
    return total > 0;
  }

  return toCount(first) > 0;
};

const tableFromRecordId = (id: string, fallback?: string) => {
  const raw = String(id);
  const colon = raw.indexOf(':');
  if (colon > 0) {
    return raw.slice(0, colon);
  }
  return fallback;
};

export const executeSettingsDelete = async ({
  db,
  id,
  entityLabel,
  usageChecks = [],
  cleanupQueries = [],
  onAfter,
  table,
  domain = 'manage',
  manager,
  changedBy,
}: ExecuteDeleteOptions): Promise<"deleted" | "deactivated"> => {
  const idRecord = toRecordId(id);
  const baseParams = {id, idRecord};
  const resolvedTable = table ?? tableFromRecordId(String(id));

  const emitEntity = async (action: 'delete' | 'deactivate') => {
    if (!resolvedTable) return;
    await entityAfterWrite({
      manager,
      domain,
      table: resolvedTable,
      entityId: String(id),
      action,
      label: entityLabel,
      source: 'settings-delete',
      changedBy,
    });
  };

  try {
    let inUse = false;
    for (const check of usageChecks) {
      const result = await db.query(check.query, {
        ...baseParams,
        ...(check.params ?? {})
      });
      if (hasResults(result)) {
        inUse = true;
        break;
      }
    }

    if (inUse) {
      await db.merge(id, {deleted_at: new Date()});
      toast.info(i18n.t('toast:settingsDelete.deactivated', { entity: entityLabel }));
      await emitEntity('deactivate');
      if (onAfter) {
        await onAfter();
      }
      return "deactivated";
    }

    for (const cleanup of cleanupQueries) {
      await db.query(cleanup.query, {
        ...baseParams,
        ...(cleanup.params ?? {})
      });
    }

    await db.delete(id);
    toast.success(i18n.t('toast:settingsDelete.deleted', { entity: entityLabel }));
    await emitEntity('delete');
    if (onAfter) {
      await onAfter();
    }
    return "deleted";
  } catch (error: any) {
    toast.error(error?.message ?? i18n.t('toast:settingsDelete.failed', { entity: entityLabel }));
    throw error;
  }
};
