import { describe, expect, it } from 'vitest';
import { RetryEngine } from '@/integrations/queue/retry-engine.ts';

describe('RetryEngine', () => {
  it('calculates exponential backoff without jitter', () => {
    const engine = new RetryEngine({
      maxRetries: 5,
      baseDelayMs: 100,
      maxDelayMs: 5000,
      jitter: false,
    });

    expect(engine.getDelayMs(1)).toBe(100);
    expect(engine.getDelayMs(2)).toBe(200);
    expect(engine.getDelayMs(3)).toBe(400);
  });

  it('enforces retry limits', () => {
    const engine = new RetryEngine({
      maxRetries: 2,
      baseDelayMs: 100,
      maxDelayMs: 5000,
      jitter: false,
    });

    expect(engine.canRetry(0)).toBe(true);
    expect(engine.canRetry(1)).toBe(true);
    expect(engine.canRetry(2)).toBe(false);
  });
});
