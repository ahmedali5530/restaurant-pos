import { RetryPolicy } from '@/integrations/queue/types.ts';

export class RetryEngine {
  constructor(private readonly policy: RetryPolicy) {}

  canRetry(attempt: number) {
    return attempt < this.policy.maxRetries;
  }

  getDelayMs(attempt: number) {
    const exponentialDelay = Math.min(
      this.policy.maxDelayMs,
      this.policy.baseDelayMs * Math.pow(2, Math.max(0, attempt - 1))
    );
    if (!this.policy.jitter) return exponentialDelay;
    const jitter = Math.floor(Math.random() * Math.max(1, Math.floor(exponentialDelay * 0.1)));
    return exponentialDelay + jitter;
  }
}
