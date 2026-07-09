import { IntegrationProvider } from '@/integrations/core/provider.ts';
import {
  IntegrationCategory,
  IntegrationEvent,
  IntegrationExecutionRequest,
  ProviderManifest,
} from '@/integrations/core/types.ts';
import { ProviderNotFoundError } from '@/integrations/core/errors.ts';
import { nowSurrealDateTime } from '@/lib/datetime.ts';
import { ProviderRegistry } from '@/integrations/registry/provider-registry.ts';
import { IntegrationEventBus } from '@/integrations/events/event-bus.ts';
import { IntegrationQueueEngine } from '@/integrations/queue/queue-engine.ts';
import { SchedulerEngine } from '@/integrations/scheduler/scheduler-engine.ts';
import { HealthMonitor } from '@/integrations/health/health-monitor.ts';
import { IntegrationAuditLogger } from '@/integrations/audit/audit-logger.ts';
import { ProviderCatalog } from '@/integrations/registry/provider-catalog.ts';

export interface AvailableProviderEntry {
  manifest: ProviderManifest;
  enabled: boolean;
}

export class IntegrationManager {
  private catalog: ProviderCatalog | null = null;
  private readonly enabledProviderIds = new Set<string>();

  constructor(
    private readonly registry: ProviderRegistry,
    private readonly eventBus: IntegrationEventBus,
    private readonly queue: IntegrationQueueEngine,
    private readonly scheduler: SchedulerEngine,
    private readonly healthMonitor: HealthMonitor,
    private readonly auditLogger: IntegrationAuditLogger
  ) {}

  async bootstrapFromCatalog(catalog: ProviderCatalog, enabledProviderIds: string[]) {
    this.catalog = catalog;
    this.enabledProviderIds.clear();

    for (const providerId of enabledProviderIds) {
      if (!catalog.isKnownProvider(providerId)) {
        continue;
      }
      await this.enableProviderInternal(providerId, false);
    }
  }

  async installProviders(providers: IntegrationProvider[]) {
    for (const provider of providers) {
      await provider.initialize();
      this.registry.register(provider);
      this.enabledProviderIds.add(provider.getManifest().id);
      await this.auditLogger.log({
        action: 'ProviderInstalled',
        providerId: provider.getManifest().id,
      });
    }
  }

  async shutdown() {
    for (const provider of this.registry.getAll()) {
      await provider.shutdown();
    }
    this.scheduler.shutdown();
  }

  isProviderEnabled(providerId: string) {
    return this.enabledProviderIds.has(providerId);
  }

  getEnabledProviderIds() {
    return Array.from(this.enabledProviderIds);
  }

  getEnabledProviders() {
    return this.registry
      .getInstalledManifests()
      .filter((manifest) => this.enabledProviderIds.has(manifest.id));
  }

  getEnabledProvidersByCategory(category: IntegrationCategory) {
    return this.getEnabledProviders().filter((provider) => provider.category === category);
  }

  async setProviderEnabled(providerId: string, enabled: boolean) {
    if (!this.catalog?.isKnownProvider(providerId)) {
      throw new ProviderNotFoundError(providerId);
    }

    if (enabled) {
      await this.enableProviderInternal(providerId, true);
      return;
    }

    await this.disableProviderInternal(providerId, true);
  }

  private async enableProviderInternal(providerId: string, emitAudit: boolean) {
    if (this.enabledProviderIds.has(providerId)) {
      return;
    }

    if (!this.catalog) {
      throw new Error('Provider catalog is not initialized');
    }

    const provider = this.catalog.createProvider(providerId);
    const validation = await provider.validate();
    if (!validation.valid) {
      const message = validation.errors?.join(', ') || 'Provider validation failed';
      throw new Error(message);
    }

    await provider.initialize();
    this.registry.register(provider);
    this.enabledProviderIds.add(providerId);

    if (emitAudit) {
      await this.auditLogger.log({
        action: 'ProviderUpdated',
        providerId,
        payload: { enabled: true },
      });
    }
  }

  private async disableProviderInternal(providerId: string, emitAudit: boolean) {
    const provider = this.registry.get(providerId);

    if (provider) {
      await provider.shutdown();
      this.registry.unregister(providerId);
    }

    this.enabledProviderIds.delete(providerId);

    if (emitAudit) {
      await this.auditLogger.log({
        action: 'ProviderUpdated',
        providerId,
        payload: { enabled: false },
      });
    }
  }

  listAvailableProviders(): AvailableProviderEntry[] {
    if (!this.catalog) {
      return this.registry.getInstalledManifests().map((manifest) => ({
        manifest,
        enabled: this.enabledProviderIds.has(manifest.id),
      }));
    }

    return this.catalog.listCatalogManifests().map((manifest) => ({
      manifest,
      enabled: this.enabledProviderIds.has(manifest.id),
    }));
  }

  async execute(providerId: string, request: IntegrationExecutionRequest) {
    if (!this.isProviderEnabled(providerId)) {
      throw new Error(`Provider "${providerId}" is disabled`);
    }

    const provider = this.registry.get(providerId);
    if (!provider) throw new ProviderNotFoundError(providerId);
    if (!provider.execute) {
      throw new Error(`Provider "${providerId}" does not support execute capability`);
    }

    const job = await this.queue.enqueue({
      providerId,
      action: request.action,
      payload: request.payload ?? {},
      priority: 0,
      maxRetries: 5,
      dedupeKey: request.idempotencyKey,
    });

    await this.auditLogger.log({
      action: 'Request',
      providerId,
      payload: { jobId: job.id, request },
    });

    return job;
  }

  async processQueue() {
    return this.queue.processNext(async (job) => {
      if (!this.isProviderEnabled(job.providerId)) {
        await this.auditLogger.log({
          action: 'Failure',
          providerId: job.providerId,
          payload: { reason: 'Provider disabled; skipped queue job', jobId: job.id },
          severity: 'warning',
        });
        return;
      }

      const provider = this.registry.get(job.providerId);
      if (!provider?.execute) throw new ProviderNotFoundError(job.providerId);
      const response = await provider.execute(
        {
          action: job.action,
          payload: job.payload,
          idempotencyKey: job.dedupeKey,
        },
        {
          providerId: job.providerId,
          now: nowSurrealDateTime(),
        }
      );

      if (!response.success) {
        throw new Error(response.error ?? 'Provider execution failed');
      }

      await this.auditLogger.log({
        action: 'Response',
        providerId: job.providerId,
        payload: { jobId: job.id, response },
      });
    });
  }

  async publish(event: IntegrationEvent) {
    await this.eventBus.publish(event);
    for (const provider of this.registry.getAll()) {
      if (!provider.handleEvent) continue;
      await provider.handleEvent(event);
    }
  }

  getInstalledProviders() {
    return this.getEnabledProviders();
  }

  async refreshHealth() {
    const providers = this.registry
      .getAll()
      .filter((provider) => this.enabledProviderIds.has(provider.getManifest().id));
    for (const provider of providers) {
      await this.healthMonitor.collect(provider);
    }
    return this.healthMonitor.list();
  }

  getHealth() {
    return this.healthMonitor.list();
  }

  async getQueueSnapshot() {
    return this.queue.listActiveJobs();
  }
}
