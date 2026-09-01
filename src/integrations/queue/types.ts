export type IntegrationQueueStatus =
  | 'Pending'
  | 'Running'
  | 'Waiting'
  | 'Completed'
  | 'Failed'
  | 'Cancelled'
  | 'DeadLetter';

export interface IntegrationQueueJob {
  id: string;
  providerId: string;
  action: string;
  payload: Record<string, unknown>;
  status: IntegrationQueueStatus;
  priority: number;
  attempts: number;
  maxRetries: number;
  nextRunAt?: string;
  dedupeKey?: string;
  partitionKey?: string;
  createdAt: string;
  updatedAt: string;
  lastError?: string;
}

export interface RetryPolicy {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
  jitter: boolean;
}

export interface QueueStore {
  save(job: IntegrationQueueJob): Promise<void>;
  update(job: IntegrationQueueJob): Promise<void>;
  get(jobId: string): Promise<IntegrationQueueJob | undefined>;
  listByStatus(statuses: IntegrationQueueStatus[]): Promise<IntegrationQueueJob[]>;
  findByDedupeKey(dedupeKey: string): Promise<IntegrationQueueJob | undefined>;
}
