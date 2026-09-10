/** Background auto-retry of conflicted ops: cooldown + attempt cap per operation. */
export const AUTO_RETRY_MAX_ATTEMPTS = 5;
export const AUTO_RETRY_COOLDOWNS_MS = [15_000, 30_000, 60_000, 120_000, 300_000];

const conflictAutoRetry = new Map<string, { attempts: number; nextAt: number }>();

export function conflictAutoRetryEligible(operationId: string, now = Date.now()): boolean {
  const state = conflictAutoRetry.get(operationId);
  if (!state) return true;
  if (state.attempts >= AUTO_RETRY_MAX_ATTEMPTS) return false;
  return now >= state.nextAt;
}

export function noteConflictAutoRetry(operationId: string, now = Date.now()): void {
  const prev = conflictAutoRetry.get(operationId);
  const attempts = (prev?.attempts ?? 0) + 1;
  const cooldown =
    AUTO_RETRY_COOLDOWNS_MS[Math.min(attempts - 1, AUTO_RETRY_COOLDOWNS_MS.length - 1)] ??
    300_000;
  conflictAutoRetry.set(operationId, { attempts, nextAt: now + cooldown });
}

export function clearConflictAutoRetry(operationId: string): void {
  conflictAutoRetry.delete(operationId);
}

/** Test helper — reset in-memory auto-retry state between vitest cases. */
export function resetConflictAutoRetryForTests(): void {
  conflictAutoRetry.clear();
}

/** Test helpers for cooldown / max-attempt policy. */
export const conflictAutoRetryTestApi = {
  eligible: conflictAutoRetryEligible,
  note: noteConflictAutoRetry,
  clear: clearConflictAutoRetry,
  maxAttempts: AUTO_RETRY_MAX_ATTEMPTS,
  cooldownsMs: AUTO_RETRY_COOLDOWNS_MS,
};
