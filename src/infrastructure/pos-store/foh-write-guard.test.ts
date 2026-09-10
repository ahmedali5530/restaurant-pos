/**
 * Architecture guard (ADR 0001): FOH code must never write SurrealDB directly.
 * Every cashier mutation goes PosStore (Dexie) → outbox → gateway. A direct
 * `db.merge/create/delete/insert/update` in these paths hard-fails offline.
 */
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = join(__dirname, '..', '..');

const GUARDED_DIRS = [
  'components/payment',
  'components/orders',
  'components/cart',
  'components/floor',
  'components/menu',
  'components/kitchen',
];

const GUARDED_FILE_PATTERNS = [
  /^lib\/order[^/]*\.ts$/,
  /^lib\/auto-check-close\.service\.ts$/,
  /^lib\/kitchen\/workflow\.service\.ts$/,
];

/**
 * Writes that are deliberately allowed because they touch non-order tables
 * (global settings bookkeeping) — not cashier order state.
 */
const ALLOWLIST: Array<{ file: string; reason: string }> = [
  {
    file: 'lib/auto-check-close.service.ts',
    reason: 'markAutoCheckCloseCycle persists the closing-cycle marker in `settings`, not an order table',
  },
];

const DIRECT_WRITE = /\bdb\.(merge|create|delete|insert|update)\s*\(/g;

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(entry) && !/\.test\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

function guardedFiles(): string[] {
  const files: string[] = [];
  for (const dir of GUARDED_DIRS) files.push(...walk(join(ROOT, dir)));
  for (const file of walk(join(ROOT, 'lib'))) {
    const rel = relative(ROOT, file).replace(/\\/g, '/');
    if (GUARDED_FILE_PATTERNS.some((pattern) => pattern.test(rel))) files.push(file);
  }
  return [...new Set(files)];
}

describe('FOH write guard', () => {
  it('has no direct SurrealDB writes outside the PosStore path', () => {
    const violations: string[] = [];
    for (const file of guardedFiles()) {
      const rel = relative(ROOT, file).replace(/\\/g, '/');
      if (ALLOWLIST.some((entry) => entry.file === rel)) continue;
      const source = readFileSync(file, 'utf8');
      const lines = source.split('\n');
      lines.forEach((line, index) => {
        if (DIRECT_WRITE.test(line)) violations.push(`${rel}:${index + 1}: ${line.trim()}`);
        DIRECT_WRITE.lastIndex = 0;
      });
    }
    expect(violations, `Direct Surreal writes in FOH code:\n${violations.join('\n')}`).toEqual([]);
  });

  it('allowlisted files still exist (prune stale entries)', () => {
    for (const entry of ALLOWLIST) {
      expect(() => statSync(join(ROOT, entry.file)), entry.reason).not.toThrow();
    }
  });
});
