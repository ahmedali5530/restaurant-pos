import { describe, expect, it } from 'vitest';
import { IntegrationQueueEngine } from '@/integrations/queue/queue-engine.ts';
import { IntegrationQueueJob, IntegrationQueueStatus, QueueStore } from '@/integrations/queue/types.ts';

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

describe('IntegrationQueueEngine', () => {
  it('enqueues and processes successful jobs', async () => {
    const engine = new IntegrationQueueEngine(new InMemoryQueueStore(), {
      jitter: false,
    });
    const job = await engine.enqueue({
      providerId: 'provider:test',
      action: 'sync',
      payload: {},
      priority: 0,
      maxRetries: 2,
    });

    expect(job.status).toBe('Pending');
    const processed = await engine.processNext(async () => {});
    expect(processed?.status).toBe('Completed');
  });

  it('moves exhausted retries to dead letter', async () => {
    const engine = new IntegrationQueueEngine(new InMemoryQueueStore(), {
      jitter: false,
      maxRetries: 2,
      baseDelayMs: 0,
      maxDelayMs: 0,
    });

    await engine.enqueue({
      providerId: 'provider:test',
      action: 'sync',
      payload: {},
      priority: 0,
      maxRetries: 2,
    });

    const first = await engine.processNext(async () => {
      throw new Error('boom');
    });
    expect(first?.status).toBe('Waiting');

    const second = await engine.processNext(async () => {
      throw new Error('boom');
    });
    expect(second?.status).toBe('DeadLetter');
  });
});
