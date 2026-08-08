import { describe, expect, it, vi } from 'vitest';
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
import {
  entityChangedEventId,
  redactEntitySnapshot,
} from '@/integrations/events/payloads/entity-changed.ts';
import { publishEntityChanged } from '@/integrations/events/publish/entity.ts';
import { setIntegrationEventManager } from '@/integrations/events/runtime.ts';

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

const baseManifest = {
  id: 'provider:test',
  name: 'test',
  displayName: 'Test',
  category: 'custom' as const,
  version: '1.0.0',
  providerVersion: '1.0.0',
  minimumFrameworkVersion: '1.0.0',
  supportedFeatures: ['events'],
  supportedEvents: ['EntityChanged'] as string[],
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

const createProvider = (
  overrides: Partial<ReturnType<IntegrationProvider['getManifest']>> = {},
  handleEvent?: IntegrationProvider['handleEvent']
): IntegrationProvider => ({
  async initialize() {},
  async shutdown() {},
  getManifest() {
    return { ...baseManifest, ...overrides };
  },
  getConfigurationSchema() {
    return { fields: [] };
  },
  getCapabilities() {
    return ['events', 'health'];
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
      providerId: overrides.id ?? 'provider:test',
    };
  },
  handleEvent,
  async healthCheck() {
    return {
      providerId: overrides.id ?? 'provider:test',
      status: 'connected',
      authenticationStatus: 'valid',
      pendingJobs: 0,
      failedJobs: 0,
      version: '1.0.0',
      updatedAt: toJsDate(nowSurrealDateTime()).toISOString(),
    };
  },
});

const createManager = () =>
  new IntegrationManager(
    new ProviderRegistry('1.0.0'),
    new IntegrationEventBus(),
    new IntegrationQueueEngine(new InMemoryQueueStore()),
    new SchedulerEngine(),
    new HealthMonitor(),
    new NoopAuditLogger()
  );

describe('EntityChanged + IntegrationManager.publish', () => {
  it('redacts secret keys in snapshots', () => {
    const redacted = redactEntitySnapshot({
      name: 'Alice',
      password: 'secret',
      nested: { api_key: 'k', ok: 1 },
    });
    expect(redacted.password).toBe('[redacted]');
    expect(redacted.nested.api_key).toBe('[redacted]');
    expect(redacted.nested.ok).toBe(1);
    expect(redacted.name).toBe('Alice');
  });

  it('builds stable entity event ids', () => {
    expect(entityChangedEventId('menu_item', 'menu_item:1', 'update', 'v1')).toBe(
      'EntityChanged:menu_item:menu_item:1:update:v1'
    );
  });

  it('fans out only to enabled providers with matching supportedEvents', async () => {
    const handled: string[] = [];
    const entityListener = createProvider(
      { id: 'provider:logger', supportedEvents: ['EntityChanged'] },
      async (event) => {
        handled.push(`logger:${event.name}`);
      }
    );
    const starListener = createProvider(
      { id: 'provider:star', supportedEvents: ['*'] },
      async (event) => {
        handled.push(`star:${event.name}`);
      }
    );
    const saleOnly = createProvider(
      { id: 'provider:sales', supportedEvents: ['SaleCompleted'] },
      async (event) => {
        handled.push(`sales:${event.name}`);
      }
    );

    const manager = createManager();
    await manager.installProviders([entityListener, starListener, saleOnly]);

    await manager.publish({
      id: 'e1',
      name: 'EntityChanged',
      source: 'test',
      occurredAt: new Date().toISOString(),
      payload: { table: 'dish' },
    });

    expect(handled).toContain('logger:EntityChanged');
    expect(handled).toContain('star:EntityChanged');
    expect(handled).not.toContain('sales:EntityChanged');
  });

  it('isolates provider failures', async () => {
    const ok = vi.fn();
    const bad = createProvider(
      { id: 'provider:bad', supportedEvents: ['*'] },
      async () => {
        throw new Error('boom');
      }
    );
    const good = createProvider(
      { id: 'provider:good', supportedEvents: ['*'] },
      async () => {
        ok();
      }
    );

    const manager = createManager();
    await manager.installProviders([bad, good]);

    await expect(
      manager.publish({
        id: 'e2',
        name: 'EntityChanged',
        source: 'test',
        occurredAt: new Date().toISOString(),
        payload: {},
      })
    ).resolves.toBeUndefined();

    expect(ok).toHaveBeenCalled();
  });

  it('safePublish entity helper uses global manager', async () => {
    const handleEvent = vi.fn();
    const logger = createProvider(
      { id: 'provider:logger', supportedEvents: ['EntityChanged'] },
      handleEvent
    );
    const manager = createManager();
    await manager.installProviders([logger]);
    setIntegrationEventManager(manager);

    await publishEntityChanged(undefined, {
      domain: 'manage',
      table: 'menu_item',
      entityId: 'menu_item:abc',
      action: 'create',
      source: 'test',
      after: { password: 'x', name: 'Soup' },
    });

    expect(handleEvent).toHaveBeenCalled();
    const event = handleEvent.mock.calls[0][0];
    expect(event.name).toBe('EntityChanged');
    expect(event.payload.after.password).toBe('[redacted]');
    expect(event.payload.after.name).toBe('Soup');

    setIntegrationEventManager(null);
  });
});
