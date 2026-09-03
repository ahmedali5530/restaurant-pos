import { AccountingRemoteAdapter, EntityMapping, SyncFailure, SyncMode, SyncRun, SyncRunStatus } from '@/integrations/accounting/external/types.ts';
import { EntityMappingRepository } from '@/integrations/accounting/external/entity-mapping-repository.ts';
import { categorizeExternalError, formatSyncFailure, isRetriableExternalError } from '@/integrations/accounting/external/errors.ts';
import { nowSurrealDateTime } from '@/lib/datetime.ts';

export type SyncOrchDbClient = {
  query: <R extends unknown[] = any[]>(sql: string, parameters?: Record<string, unknown>) => Promise<R>;
  create: (thing: string, data: Record<string, unknown>) => Promise<unknown>;
  merge: (thing: string, data: Record<string, unknown>) => Promise<unknown>;
};

export class SyncOrchestrator {
  constructor(
    private readonly db: SyncOrchDbClient,
    private readonly mappingRepo: EntityMappingRepository,
    private readonly adapter: AccountingRemoteAdapter,
    private readonly providerId: string
  ) {}

  async startSyncRun(tenantId: string, mode: SyncMode): Promise<SyncRun> {
    const run: Omit<SyncRun, 'id'> = {
      providerId: this.providerId,
      tenantId,
      mode,
      status: 'running',
      startedAt: nowSurrealDateTime(),
    };

    const result = await this.db.create('integration_sync_run', {
      provider_id: run.providerId,
      tenant_id: run.tenantId,
      mode: run.mode,
      status: run.status,
      started_at: run.startedAt,
    });

    const id = (result as any)?.id ?? (result as any)?.[0]?.id;
    return { ...run, id: String(id) };
  }

  async completeSyncRun(runId: string, cursor?: string): Promise<void> {
    await this.db.merge(runId, {
      status: 'completed' as SyncRunStatus,
      cursor: cursor ?? null,
      finished_at: nowSurrealDateTime(),
    });
  }

  async failSyncRun(runId: string, error: string): Promise<void> {
    await this.db.merge(runId, {
      status: 'failed' as SyncRunStatus,
      error,
      finished_at: nowSurrealDateTime(),
    });
  }

  async recordFailure(failure: Omit<SyncFailure, 'id' | 'createdAt'>): Promise<void> {
    await this.db.create('integration_sync_failure', {
      provider_id: failure.providerId,
      tenant_id: failure.tenantId,
      entity_type: failure.entityType,
      posr_id: failure.posrId,
      action: failure.action,
      error: failure.error,
      error_category: failure.errorCategory,
      retriable: failure.retriable,
      retry_count: failure.retryCount,
      created_at: nowSurrealDateTime(),
    });
  }

  /**
   * Run initial full sync — import all master data from the external system.
   */
  async runInitialSync(tenantId: string): Promise<{ runId: string; imported: number; configUpserts?: { saleItemId?: string; defaultCustomerId?: string } }> {
    const run = await this.startSyncRun(tenantId, 'full');
    let imported = 0;
    let configUpserts: { saleItemId?: string; defaultCustomerId?: string } | undefined;

    try {
      const masterData = await this.adapter.importMasterData({ tenantId });
      configUpserts = {
        saleItemId: masterData.saleItemId,
        defaultCustomerId: masterData.defaultCustomerId,
      };

      const mappings: Omit<EntityMapping, 'id' | 'updatedAt'>[] = [];

      masterData.accounts.forEach((a) => {
        mappings.push({
          providerId: this.providerId,
          tenantId,
          entityType: 'account',
          posrId: a.id,
          externalId: a.id,
          externalPayload: { name: a.name, code: a.code, type: a.type },
        });
      });

      masterData.customers.forEach((c) => {
        mappings.push({
          providerId: this.providerId,
          tenantId,
          entityType: 'customer',
          posrId: c.id,
          externalId: c.id,
          externalPayload: { name: c.name, email: c.email },
        });
      });

      masterData.vendors.forEach((v) => {
        mappings.push({
          providerId: this.providerId,
          tenantId,
          entityType: 'vendor',
          posrId: v.id,
          externalId: v.id,
          externalPayload: { name: v.name, email: v.email },
        });
      });

      masterData.taxCodes.forEach((t) => {
        mappings.push({
          providerId: this.providerId,
          tenantId,
          entityType: 'tax_code',
          posrId: t.id,
          externalId: t.id,
          externalPayload: { name: t.name, rate: t.rate },
        });
      });

      masterData.paymentMethods.forEach((p) => {
        mappings.push({
          providerId: this.providerId,
          tenantId,
          entityType: 'payment_method',
          posrId: p.id,
          externalId: p.id,
          externalPayload: { name: p.name },
        });
      });

      masterData.items?.forEach((item) => {
        mappings.push({
          providerId: this.providerId,
          tenantId,
          entityType: 'item',
          posrId: item.id,
          externalId: item.id,
          externalPayload: { name: item.name, type: item.type },
        });
      });

      if (masterData.classes) {
        masterData.classes.forEach((c) => {
          mappings.push({
            providerId: this.providerId,
            tenantId,
            entityType: 'class',
            posrId: c.id,
            externalId: c.id,
            externalPayload: { name: c.name },
          });
        });
      }

      if (masterData.departments) {
        masterData.departments.forEach((d) => {
          mappings.push({
            providerId: this.providerId,
            tenantId,
            entityType: 'department',
            posrId: d.id,
            externalId: d.id,
            externalPayload: { name: d.name },
          });
        });
      }

      await this.mappingRepo.saveAll(mappings);
      imported = mappings.length;

      await this.completeSyncRun(String(run.id));
    } catch (err: any) {
      await this.failSyncRun(String(run.id), err?.message ?? 'Initial sync failed');
      throw err;
    }

    return { runId: String(run.id), imported, configUpserts };
  }

  /**
   * Run incremental sync using CDC cursor.
   */
  async runIncrementalSync(tenantId: string, cursor: string): Promise<{ runId: string; newCursor: string; processed: number }> {
    const run = await this.startSyncRun(tenantId, 'incremental');
    let processed = 0;

    try {
      const changes = await this.adapter.fetchChanges({ tenantId, cursor });

      for (const entity of changes.entities) {
        try {
          // For now, just mark the change — actual re-sync happens on next outbound
          processed++;
        } catch (syncErr: any) {
          await this.recordFailure({
            providerId: this.providerId,
            tenantId,
            entityType: entity.entityType,
            posrId: entity.externalId,
            action: 'incrementalSync',
            error: syncErr?.message ?? 'Sync error',
            errorCategory: categorizeExternalError(syncErr),
            retriable: isRetriableExternalError(categorizeExternalError(syncErr)),
            retryCount: 0,
          });
        }
      }

      await this.completeSyncRun(String(run.id), changes.newCursor);
      return { runId: String(run.id), newCursor: changes.newCursor, processed };
    } catch (err: any) {
      await this.failSyncRun(String(run.id), err?.message ?? 'Incremental sync failed');
      throw err;
    }
  }

  /**
   * Retry failed records.
   */
  async retryFailed(tenantId: string): Promise<{ retried: number; failed: number }> {
    const [rows] = await this.db.query<Array<{ id: string } & SyncFailure>>(
      `SELECT * FROM integration_sync_failure
       WHERE provider_id = $providerId AND tenant_id = $tenantId
         AND retriable = true
       ORDER BY created_at ASC
       LIMIT 100`,
      { providerId: this.providerId, tenantId }
    );

    let retried = 0;
    let failed = 0;

    for (const row of rows ?? []) {
      try {
        // Re-enqueue for retry — the provider's execute method handles this
        await this.db.merge(row.id, {
          retry_count: (row.retry_count ?? 0) + 1,
          retriable: false, // Mark non-retriable until re-evaluated on next run
        });
        retried++;
      } catch {
        failed++;
      }
    }

    return { retried, failed };
  }

  /**
   * Get pending failure count for health display.
   */
  async getFailureCount(tenantId: string): Promise<number> {
    const [rows] = await this.db.query<Array<{ count: number }>>(
      `SELECT count() FROM integration_sync_failure
       WHERE provider_id = $providerId AND tenant_id = $tenantId
         AND retriable = true
       GROUP ALL`,
      { providerId: this.providerId, tenantId }
    );
    return (rows as any)?.count ?? 0;
  }
}
