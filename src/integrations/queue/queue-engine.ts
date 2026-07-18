import { nanoid } from 'nanoid';
import { IntegrationQueueJob, QueueStore, RetryPolicy } from '@/integrations/queue/types.ts';
import { RetryEngine } from '@/integrations/queue/retry-engine.ts';

type QueueExecutor = (job: IntegrationQueueJob) => Promise<void>;

export class IntegrationQueueEngine {
  private readonly retryEngine: RetryEngine;

  constructor(
    private readonly store: QueueStore,
    policy?: Partial<RetryPolicy>
  ) {
    this.retryEngine = new RetryEngine({
      maxRetries: policy?.maxRetries ?? 5,
      baseDelayMs: policy?.baseDelayMs ?? 1000,
      maxDelayMs: policy?.maxDelayMs ?? 60_000,
      jitter: policy?.jitter ?? true,
    });
  }

  async enqueue(input: Omit<IntegrationQueueJob, 'id' | 'createdAt' | 'updatedAt' | 'status' | 'attempts'>) {
    if (input.dedupeKey) {
      const duplicate = await this.store.findByDedupeKey(input.dedupeKey);
      // Only reuse in-flight jobs — Completed/Failed/DeadLetter must not block a new enqueue.
      if (
        duplicate &&
        (duplicate.status === 'Pending' || duplicate.status === 'Running' || duplicate.status === 'Waiting')
      ) {
        return duplicate;
      }
    }

    const now = new Date().toISOString();
    const job: IntegrationQueueJob = {
      ...input,
      id: `integration_job:${nanoid()}`,
      status: 'Pending',
      attempts: 0,
      createdAt: now,
      updatedAt: now,
    };
    await this.store.save(job);
    return job;
  }

  async processNext(executor: QueueExecutor) {
    const ready = await this.store.listByStatus(['Pending', 'Waiting']);
    const now = Date.now();
    const candidates = ready
      .filter((job) => !job.nextRunAt || new Date(job.nextRunAt).getTime() <= now)
      .sort((a, b) => b.priority - a.priority || a.createdAt.localeCompare(b.createdAt));
    const job = candidates[0];
    if (!job) return null;

    job.status = 'Running';
    job.updatedAt = new Date().toISOString();
    await this.store.update(job);

    try {
      await executor(job);
      job.status = 'Completed';
      job.lastError = undefined;
      job.updatedAt = new Date().toISOString();
      await this.store.update(job);
      return job;
    } catch (error) {
      job.attempts += 1;
      job.lastError = error instanceof Error ? error.message : String(error);
      job.updatedAt = new Date().toISOString();
      if (this.retryEngine.canRetry(job.attempts) && job.attempts <= job.maxRetries) {
        job.status = 'Waiting';
        const delayMs = this.retryEngine.getDelayMs(job.attempts);
        job.nextRunAt =
          delayMs > 0 ? new Date(Date.now() + delayMs).toISOString() : undefined;
      } else {
        job.status = 'DeadLetter';
      }
      await this.store.update(job);
      return job;
    }
  }

  async listActiveJobs() {
    // Include DeadLetter so failed fiscal retries remain visible after offline buffering.
    const jobs = await this.store.listByStatus(['Pending', 'Running', 'Waiting', 'DeadLetter']);
    return jobs.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
}
