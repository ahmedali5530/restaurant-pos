import { nanoid } from 'nanoid';
import { posStore } from '@/infrastructure/pos-store/pos-store.ts';
import {
  applyRemoteEvent,
  projectSnapshotOrder,
  projectSnapshotRecords,
} from '@/infrastructure/pos-store/projection.ts';
import type { NumberSeries, PendingNumberReservation, SyncPhase } from '@/infrastructure/pos-store/types.ts';
import { Tables } from '@/api/db/tables.ts';
import { getBusinessDayUnixRange } from '@/lib/datetime.ts';
import {
  fetchSnapshotPage,
  handshake,
  pullEvents,
  pushOperations,
  reserveNumbers,
} from './gateway-client.ts';
import { setSyncStatus } from './sync-status.ts';
import {
  clearConflictAutoRetry,
  conflictAutoRetryEligible,
  noteConflictAutoRetry,
} from './conflict-auto-retry.ts';

const DAY_SCOPED_NUMBER_SERIES = new Set<NumberSeries>(['invoice', 'receipt']);

const SNAPSHOT_TABLES = [
  Tables.order_types,
  Tables.categories,
  Tables.dishes,
  Tables.modifier_groups,
  Tables.modifiers,
  Tables.dish_modifier_groups,
  Tables.floors,
  Tables.tables,
  Tables.kitchens,
  Tables.workflows,
  Tables.workflow_stages,
  Tables.payment_types,
  Tables.taxes,
  Tables.menus,
  Tables.menu_menu_items,
  Tables.settings,
  Tables.users,
  Tables.extras,
  Tables.discounts,
  Tables.discount_reasons,
  Tables.coupons,
  Tables.customers,
  'coupon_redemption',
  Tables.printers,
  Tables.orders,
  Tables.order_items,
  Tables.order_items_kitchen,
  'order_void',
  'order_refund',
  'order_print',
] as const;

/** Snapshot tables that are not plain catalog rows. */
const OPERATIONAL_TABLES = new Set<string>([
  'order',
  'order_item',
  'order_item_kitchen',
  'customer',
  'coupon_redemption',
  'order_void',
  'order_refund',
  'order_print',
]);

/**
 * Reserved int ranges per series. Invoice numbers are minted on the gateway at
 * CREATE; only `auto_id` still uses a local reserved block. There is no string
 * fallback — when the auto_id pool is exhausted offline, split/merge must wait.
 */
const NUMBER_BLOCK_SIZE = 200;
const NUMBER_REFILL_THRESHOLD = NUMBER_BLOCK_SIZE / 2;
const NUMBER_SERIES: NumberSeries[] = ['auto_id'];

let syncInFlight: Promise<void> | null = null;
/** Set when synchronize() is requested while a run is already in flight. */
let syncAgain = false;
/** Set by synchronize({ force: true }) — the next push ignores backoff. */
let forceNextPush = false;

async function hydrateSnapshot(terminalId: string): Promise<void> {
  setSyncStatus({ phase: 'hydrating' });
  let resumeToken: string | null = (await posStore.getSyncCursor()).snapshotResumeToken ?? null;
  let complete = false;
  let highWatermark = 0;
  let pages = 0;
  const maxPages = 5_000;

  while (!complete) {
    if (pages >= maxPages) {
      throw new Error('Snapshot hydration exceeded page limit');
    }
    const previousToken = resumeToken;
    const page = await fetchSnapshotPage({ terminalId, resumeToken, limit: 200 });
    pages += 1;
    highWatermark = page.highWatermark;
    if (page.page.kind === 'records' && page.page.table && page.page.records) {
      const table = page.page.table;
      if (table === 'order') {
        for (const record of page.page.records) {
          await projectSnapshotOrder(record);
        }
      } else if (OPERATIONAL_TABLES.has(table)) {
        await projectSnapshotRecords(table, page.page.records);
      } else {
        await posStore.upsertCatalogRecords(table, page.page.records);
        // Floor tables also feed the live lock store.
        if (table === 'floor_table') await projectSnapshotRecords(table, page.page.records);
      }
    }
    // The trailing events page (event_id <= highWatermark) predates the record
    // pages we just read, so replaying it could roll state back (e.g. a CREATE
    // event re-opening an order that is already Paid). Records are the truth
    // at snapshot time; the cursor jumps to the watermark and pull continues.
    resumeToken = page.resumeToken;
    complete = page.complete;
    if (!complete && resumeToken === previousToken) {
      throw new Error('Snapshot pagination stalled (resume token did not advance)');
    }
    await posStore.setSyncCursor({
      snapshotResumeToken: resumeToken,
      highWatermark,
      hydrated: complete,
      cursor: complete ? highWatermark : (await posStore.getSyncCursor()).cursor,
    });
  }
}

/**
 * Project one gateway event into Dexie. Events this terminal produced are
 * already applied locally (Dexie-first) and are skipped so a delayed echo can
 * never roll back newer local state.
 */
async function applyPullEvent(event: any, terminalId: string): Promise<boolean> {
  if (!event) return false;
  if (String(event.terminal_id ?? event.terminalId ?? '') === terminalId) return false;
  await applyRemoteEvent(event);
  return true;
}

function notifyRemoteChange(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('posr-posstore-write'));
    window.dispatchEvent(new CustomEvent('posr-operational-orders-updated'));
  }
}

export class TerminalSyncService {
  async initialize(online: boolean): Promise<void> {
    await posStore.initialize();
    if (!online) {
      setSyncStatus({ phase: 'offline' });
      return;
    }
    setSyncStatus({ phase: 'initializing' });
    const identity = await posStore.getTerminalIdentity();
    await handshake({ terminalId: identity.terminalId });
    const cursor = await posStore.getSyncCursor();
    if (!cursor.hydrated) {
      await hydrateSnapshot(identity.terminalId);
      await posStore.reconcileOrderItemLinks();
    }
    await this.synchronize();
  }

  /**
   * Settings → Reload cache. Online-only: refuse before touching Dexie so an
   * offline wipe cannot leave the terminal empty with no warm path.
   */
  async rehydrateFromServer(): Promise<void> {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      const err = new Error('OFFLINE');
      (err as Error & { code?: string }).code = 'OFFLINE';
      throw err;
    }
    setSyncStatus({ phase: 'hydrating', lastError: null });
    await posStore.clearLocalData();
    const identity = await posStore.getTerminalIdentity();
    await handshake({ terminalId: identity.terminalId });
    await hydrateSnapshot(identity.terminalId);
    await posStore.reconcileOrderItemLinks();
    // Refill here — synchronize() can skip runSync when another tab holds the
    // leader lock, which left terminals with an empty invoice pool after Reload cache.
    await this.refillNumbers(identity.terminalId, { required: true });
    await this.synchronize({ force: true });
  }

  /**
   * @param options.force  Ignore outbox backoff (operator pressed "Sync now").
   */
  async synchronize(options?: { force?: boolean }): Promise<void> {
    // A write during an in-flight sync must not be dropped: mark a follow-up
    // pass so we drain ops that were enqueued after getPendingOutbox().
    if (options?.force) forceNextPush = true;
    if (syncInFlight) {
      syncAgain = true;
      return syncInFlight;
    }

    const run = async () => {
      do {
        syncAgain = false;
        if (typeof navigator !== 'undefined' && navigator.locks?.request) {
          await navigator.locks.request(
            'posr-terminal-sync-leader',
            { mode: 'exclusive', ifAvailable: true },
            async (lock) => {
              if (!lock) {
                // Another tab is syncing — skip this cycle.
                return;
              }
              await this.runSync();
            },
          );
        } else {
          await this.runSync();
        }
      } while (syncAgain);
    };

    syncInFlight = run().finally(() => {
      syncInFlight = null;
    });
    return syncInFlight;
  }

  /** Re-queue a conflicted operation and push immediately. */
  async retryConflict(operationId: string): Promise<void> {
    clearConflictAutoRetry(operationId);
    await posStore.retryConflict(operationId);
    await this.refreshStatus();
    await this.synchronize({ force: true });
  }

  /**
   * Re-queue every open conflict and force-push once. Used by Sync all and by
   * the operator when auto-retry has exhausted cooldowns.
   */
  async retryAllConflicts(): Promise<number> {
    const conflicts = await posStore.getOpenConflicts();
    for (const conflict of conflicts) clearConflictAutoRetry(conflict.operationId);
    const count = await posStore.retryAllConflicts();
    await this.refreshStatus();
    if (count > 0) await this.synchronize({ force: true });
    return count;
  }

  /** Drop a conflicted operation (kept for audit) and refresh the banner. */
  async discardConflict(operationId: string): Promise<void> {
    clearConflictAutoRetry(operationId);
    await posStore.discardConflict(operationId);
    await this.refreshStatus();
  }

  private async refreshStatus(extra?: { lastSyncedAt?: string }): Promise<void> {
    const conflicts = await posStore.getOpenConflicts();
    const pending = await posStore.getPendingOutbox();
    setSyncStatus({
      phase: conflicts.length ? 'conflict' : 'idle',
      pendingCount: pending.length,
      failedCount: pending.filter((row) => row.status === 'failed').length,
      conflictCount: conflicts.length,
      ...(extra ?? {}),
    });
  }

  private async runSync(): Promise<void> {
    const identity = await posStore.getTerminalIdentity();
    setSyncStatus({ phase: 'syncing', lastError: null });
    const force = forceNextPush;
    forceNextPush = false;

    try {
      await this.refillNumbers(identity.terminalId);

      // Local orphan links + outbox data.items would re-poison Surreal after a repair.
      await posStore.reconcileOrderItemLinks();

      const backoffUntil = force ? null : await posStore.getOutboxBackoffUntil();
      const pending = backoffUntil ? [] : await posStore.getPendingOutbox();
      const operations = pending
        .map((row) => row.operation)
        .filter((op): op is NonNullable<typeof op> => !!op)
        .sort((a, b) => Number(a.sequence ?? 0) - Number(b.sequence ?? 0));

      // Push in small batches so a hung Surreal write cannot stall all 40+ ops,
      // and the toolbar can show remaining count between batches.
      const PUSH_BATCH_SIZE = 5;
      if (operations.length > 0) {
        setSyncStatus({ phase: 'syncing', pendingCount: operations.length });
        for (let offset = 0; offset < operations.length; offset += PUSH_BATCH_SIZE) {
          const batch = operations.slice(offset, offset + PUSH_BATCH_SIZE);
          let result: Awaited<ReturnType<typeof pushOperations>>;
          try {
            result = await pushOperations({
              terminalId: identity.terminalId,
              operations: batch,
            });
          } catch (error) {
            // Transport / timeout: only this batch is unconfirmed.
            const message = error instanceof Error ? error.message : String(error);
            await posStore.markOutboxPushFailed(
              batch.map((op) => op.operationId),
              message,
            );
            throw error;
          }
          if (result.assignments?.length) {
            await posStore.applyInvoiceAssignments(result.assignments);
          }
          if (result.accepted?.length) {
            for (const operationId of result.accepted) clearConflictAutoRetry(operationId);
            await posStore.markOutboxAccepted(result.accepted);
          }
          for (const conflict of result.conflicts ?? []) {
            // Stale APPLY_TIMEOUT rows from the old gateway guard must stay retryable.
            if (conflict.code === 'APPLY_TIMEOUT' || conflict.code === 'APPLY_FAILED') {
              await posStore.markOutboxPushFailed([conflict.operationId], conflict.message);
              continue;
            }
            await posStore.markOutboxConflict(
              conflict.operationId,
              conflict.code,
              conflict.message,
            );
          }
          const remaining = Math.max(0, operations.length - offset - batch.length);
          setSyncStatus({
            phase: 'syncing',
            pendingCount: remaining,
            lastError: null,
          });
        }
      }

      let cursor = (await posStore.getSyncCursor()).cursor;
      let hasMore = true;
      let applied = 0;
      while (hasMore) {
        const pulled = await pullEvents({
          terminalId: identity.terminalId,
          cursor,
        });
        for (const event of pulled.events ?? []) {
          if (await applyPullEvent(event, identity.terminalId)) applied += 1;
        }
        cursor = pulled.cursor;
        hasMore = !!pulled.hasMore;
        await posStore.setSyncCursor({
          cursor,
          highWatermark: pulled.highWatermark,
        });
      }
      if (applied > 0) notifyRemoteChange();

      // Self-heal conflicts after pull: refresh versions and re-queue eligible
      // ops so the next synchronize pass drains them without UI clicks.
      const requeued = await this.autoRequeueConflicts();
      if (requeued > 0) {
        forceNextPush = true;
        syncAgain = true;
      }

      await this.refreshStatus({ lastSyncedAt: new Date().toISOString() });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const offline =
        typeof navigator !== 'undefined' && navigator.onLine === false;
      const pending = await posStore.getPendingOutbox().catch(() => []);
      setSyncStatus({
        phase: offline ? 'offline' : 'error',
        lastError: message,
        pendingCount: pending.length,
        failedCount: pending.filter((row) => row.status === 'failed').length,
      });
      throw error;
    }
  }

  /**
   * Re-queue open conflicts whose auto-retry cooldown has elapsed. Returns how
   * many ops were moved back to pending. Exhausted ops stay for Sync all.
   */
  private async autoRequeueConflicts(): Promise<number> {
    const conflicts = await posStore.getOpenConflicts();
    if (conflicts.length === 0) return 0;

    const now = Date.now();
    const eligibleIds = [
      ...new Set(
        conflicts
          .map((row) => row.operationId)
          .filter((id) => conflictAutoRetryEligible(id, now)),
      ),
    ];
    if (eligibleIds.length === 0) return 0;

    let count = 0;
    for (const operationId of eligibleIds) {
      await posStore.retryConflict(operationId);
      noteConflictAutoRetry(operationId, now);
      count += 1;
    }
    return count;
  }

  private async refillNumbers(
    terminalId: string,
    options?: { required?: boolean },
  ): Promise<void> {
    const { day, startUnix, endUnix } = getBusinessDayUnixRange();
    let lastError: unknown;

    for (const series of NUMBER_SERIES) {
      try {
        const dayScoped = DAY_SCOPED_NUMBER_SERIES.has(series);
        if (dayScoped) {
          await posStore.discardStaleNumberReservations(series, day);
          const pending = await posStore.getPendingNumberReservation(series);
          if (pending && pending.scopeId && pending.scopeId !== day) {
            await posStore.setPendingNumberReservation(series, null);
          }
        }

        const available = await posStore.countReservedNumbers(
          series,
          dayScoped ? day : undefined,
        );
        if (available > NUMBER_REFILL_THRESHOLD) continue;

        const newPending = (): PendingNumberReservation => ({
          // nanoid works on HTTP LAN/Docker; crypto.randomUUID does not.
          reservationId: dayScoped
            ? `${terminalId}:${series}:${day}:block-${nanoid()}`
            : `${terminalId}:${series}:block-${nanoid()}`,
          count: NUMBER_BLOCK_SIZE,
          ...(dayScoped ? { scopeId: day } : {}),
        });

        const reserveAndStore = async (pending: PendingNumberReservation) => {
          const range = await reserveNumbers({
            terminalId,
            kind: series,
            count: pending.count,
            reservationId: pending.reservationId,
            ...(dayScoped
              ? { scopeId: day, dayStartUnix: startUnix, dayEndUnix: endUnix }
              : {}),
          });
          await posStore.storeNumberReservations(
            series,
            range.start,
            range.end,
            dayScoped ? day : undefined,
          );
          await posStore.setPendingNumberReservation(series, null);
        };

        let pending = await posStore.getPendingNumberReservation(series);
        if (!pending || (dayScoped && pending.scopeId && pending.scopeId !== day)) {
          pending = newPending();
          await posStore.setPendingNumberReservation(series, pending);
        }

        try {
          await reserveAndStore(pending);
        } catch (error) {
          console.error(`Number refill failed for ${series}; retrying with a new reservation`, error);
          await posStore.setPendingNumberReservation(series, null);
          const retry = newPending();
          await posStore.setPendingNumberReservation(series, retry);
          await reserveAndStore(retry);
        }
      } catch (error) {
        lastError = error;
        console.error(`Number refill gave up for ${series}`, error);
        if (options?.required) throw error;
      }
    }

    if (options?.required) {
      const autoIdLeft = await posStore.countReservedNumbers('auto_id');
      if (autoIdLeft === 0) {
        throw lastError instanceof Error
          ? lastError
          : new Error('No reserved receipt numbers after refill — check the gateway');
      }
    }
  }
}

export const terminalSyncService = new TerminalSyncService();

export function getSnapshotTableAllowlist(): readonly string[] {
  return SNAPSHOT_TABLES;
}

export type { SyncPhase };
