import { beforeEach, describe, expect, it } from 'vitest';
import {
  conflictAutoRetryTestApi,
  resetConflictAutoRetryForTests,
} from './conflict-auto-retry.ts';

describe('conflict auto-retry cooldown', () => {
  beforeEach(() => {
    resetConflictAutoRetryForTests();
  });

  it('allows the first attempt immediately', () => {
    expect(conflictAutoRetryTestApi.eligible('op-1', 1_000)).toBe(true);
  });

  it('blocks until cooldown elapses, then allows again', () => {
    const t0 = 10_000;
    conflictAutoRetryTestApi.note('op-1', t0);
    expect(conflictAutoRetryTestApi.eligible('op-1', t0 + 1_000)).toBe(false);
    expect(
      conflictAutoRetryTestApi.eligible(
        'op-1',
        t0 + conflictAutoRetryTestApi.cooldownsMs[0]!,
      ),
    ).toBe(true);
  });

  it('stops after max auto attempts', () => {
    const t0 = 0;
    for (let i = 0; i < conflictAutoRetryTestApi.maxAttempts; i += 1) {
      expect(conflictAutoRetryTestApi.eligible('op-1', t0 + i * 1_000_000)).toBe(true);
      conflictAutoRetryTestApi.note('op-1', t0 + i * 1_000_000);
    }
    expect(
      conflictAutoRetryTestApi.eligible('op-1', t0 + conflictAutoRetryTestApi.maxAttempts * 1_000_000),
    ).toBe(false);
  });

  it('clear resets eligibility for Sync all / manual retry', () => {
    conflictAutoRetryTestApi.note('op-1', 0);
    conflictAutoRetryTestApi.clear('op-1');
    expect(conflictAutoRetryTestApi.eligible('op-1', 1)).toBe(true);
  });
});
