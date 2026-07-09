import { nanoid } from 'nanoid';
import { nowSurrealDateTime, toJsDate, toSurrealDateTime } from '@/lib/datetime.ts';
import { IntegrationQueueJob, QueueStore, RetryPolicy } from '@/integrations/queue/types.ts';
import { RetryEngine } from '@/integrations/queue/retry-engine.ts';

type QueueExecutor = (job: IntegrationQueueJob) => Promise<void>;

const nowIsoString = () => toJsDate(nowSurrealDateTime()).toISOString();

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
      if (duplicate && duplicate.status !== 'Cancelled' && duplicate.status !== 'DeadLetter') {
        return duplicate;
      }
    }

    const now = nowIsoString();
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
    job.updatedAt = nowIsoString();
    await this.store.update(job);

    try {
      await executor(job);
      job.status = 'Completed';
      job.lastError = undefined;
      job.updatedAt = nowIsoString();
      await this.store.update(job);
      return job;
    } catch (error) {
      job.attempts += 1;
      job.lastError = error instanceof Error ? error.message : String(error);
      job.updatedAt = nowIsoString();
      if (this.retryEngine.canRetry(job.attempts) && job.attempts <= job.maxRetries) {
        job.status = 'Waiting';
        const delayMs = this.retryEngine.getDelayMs(job.attempts);
        job.nextRunAt =
          delayMs > 0
            ? toJsDate(toSurrealDateTime(Date.now() + delayMs)).toISOString()
            : undefined;
      } else {
        job.status = 'DeadLetter';
      }
      await this.store.update(job);
      return job;
    }
  }

  async listActiveJobs() {
    return this.store.listByStatus(['Pending', 'Running', 'Waiting']);
  }
}
