import { describe, expect, it } from 'vitest';
import { nowSurrealDateTime, toJsDate } from '@/lib/datetime.ts';
import { IntegrationManager } from '@/integrations/core/integration-manager.ts';
import { ProviderRegistry } from '@/integrations/registry/provider-registry.ts';
import { IntegrationEventBus } from '@/integrations/events/event-bus.ts';
import { IntegrationQueueEngine } from '@/integrations/queue/queue-engine.ts';
import { QueueStore, IntegrationQueueJob, IntegrationQueueStatus } from '@/integrations/queue/types.ts';
import { SchedulerEngine } from '@/integrations/scheduler/scheduler-engine.ts';
import { HealthMonitor } from '@/integrations/health/health-monitor.ts';
import { IntegrationAuditLogger } from '@/integrations/audit/audit-logger.ts';
import { IntegrationProvider } from '@/integrations/core/provider.ts';
import { ProviderCatalog } from '@/integrations/registry/provider-catalog.ts';

class InMemoryQueueStore implements QueueStore {
  private readonly jobs = new Map<string, IntegrationQueueJob>();
  async save(job: IntegrationQueueJob) {
    this.jobs.set(job.id, job);
  }
  async update(job: IntegrationQueueJob) {
    this.jobs.set(job.id, job);
  }
  async get(jobId: string) {
    return this.jobs.get(jobId);
  }
  async listByStatus(statuses: IntegrationQueueStatus[]) {
    return Array.from(this.jobs.values()).filter((job) => statuses.includes(job.status));
  }
  async findByDedupeKey(dedupeKey: string) {
    return Array.from(this.jobs.values()).find((job) => job.dedupeKey === dedupeKey);
  }
}

class NoopAuditLogger extends IntegrationAuditLogger {
  async log() {}
}

const provider: IntegrationProvider = {
  async initialize() {},
  async shutdown() {},
  getManifest() {
    return {
      id: 'provider:test',
      name: 'test',
      displayName: 'Test',
      category: 'custom',
      version: '1.0.0',
      providerVersion: '1.0.0',
      minimumFrameworkVersion: '1.0.0',
      supportedFeatures: ['sync'],
      supportedEvents: ['OrderCreated'],
      offlineSupport: true,
      requiresInternet: false,
      requiresAuthentication: false,
      supportsQueue: true,
      supportsRetry: true,
      supportsWebhooks: false,
      supportsCertificates: false,
      supportsBackgroundJobs: false,
      configurationSchema: { fields: [] },
    };
  },
  getConfigurationSchema() {
    return { fields: [] };
  },
  getCapabilities() {
    return ['execute', 'health'];
  },
  supports() {
    return true;
  },
  async validate() {
    return { valid: true };
  },
  async execute() {
    return {
      success: true,
      status: 'completed',
      providerId: 'provider:test',
    };
  },
  async healthCheck() {
    return {
      providerId: 'provider:test',
      status: 'connected',
      authenticationStatus: 'valid',
      pendingJobs: 0,
      failedJobs: 0,
      version: '1.0.0',
      updatedAt: toJsDate(nowSurrealDateTime()).toISOString(),
    };
  },
};

describe('IntegrationManager', () => {
  const createManager = () =>
    new IntegrationManager(
      new ProviderRegistry('1.0.0'),
      new IntegrationEventBus(),
      new IntegrationQueueEngine(new InMemoryQueueStore()),
      new SchedulerEngine(),
      new HealthMonitor(),
      new NoopAuditLogger()
    );

  it('installs providers and executes queued requests', async () => {
    const manager = createManager();
    await manager.installProviders([provider]);
    await manager.execute('provider:test', { action: 'sync' });
    const result = await manager.processQueue();
    expect(result?.status).toBe('Completed');
  });

  it('boots only enabled providers from catalog and blocks disabled execution', async () => {
    const manager = createManager();

    const providerTwo: IntegrationProvider = {
      ...provider,
      getManifest() {
        return {
          ...provider.getManifest(),
          id: 'provider:two',
          name: 'two',
          displayName: 'Two',
        };
      },
    };

    const catalog = new ProviderCatalog({
      'provider:test': () => provider,
      'provider:two': () => providerTwo,
    });

    await manager.bootstrapFromCatalog(catalog, ['provider:test']);
    expect(manager.isProviderEnabled('provider:test')).toBe(true);
    expect(manager.isProviderEnabled('provider:two')).toBe(false);

    await expect(manager.execute('provider:two', { action: 'sync' })).rejects.toThrow('disabled');

    await manager.setProviderEnabled('provider:two', true);
    expect(manager.isProviderEnabled('provider:two')).toBe(true);
  });
});
