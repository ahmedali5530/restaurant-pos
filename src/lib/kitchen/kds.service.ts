/**
 * KDS Enhancement service — aging colors, expeditor aggregation, station stats.
 *
 * Research finding: Toast KDS costs $69+/mo per station. Square KDS is gated
 * to the higher tier. Lightspeed KDS Pro is an add-on. The features operators
 * actually want (per forum scraping) are:
 *   1. Color-coded aging (green < 5 min, yellow 5-10, red > 10 min) — top request
 *   2. Bump-bar keyboard navigation (no touch — hands wet/gloved)
 *   3. Expeditor view (all stations combined into one board)
 *   4. Per-station stats (avg prep time, throughput, bottleneck detection)
 *   5. Auto-recall of accidentally bumped orders (5-second undo window)
 *
 * This service provides the pure-logic helpers; the UI consumes them via
 * the useKdsConfig and useKdsStats hooks.
 *
 * Pricing research conclusion: POSR offers KDS enhancement free — saves
 * operators $69+/mo/station × N stations.
 */

import { KitchenOrderBatch } from '@/api/model/kitchen.ts';
import { OrderItemKitchen, OrderItemKitchenStatus } from '@/api/model/order_item_kitchen.ts';
import { Order } from '@/api/model/order.ts';
import { nowInAppTimezone, toLuxonDateTime } from '@/lib/datetime.ts';

// ---------------------------------------------------------------------------
// Aging thresholds (configurable via settings.kds_*  — see migration)
// ---------------------------------------------------------------------------

export type AgingLevel = 'fresh' | 'aging' | 'critical' | 'expired';

export interface AgingThresholds {
  freshMinutes: number;      // 0..fresh → green
  agingMinutes: number;       // fresh..aging → yellow
  criticalMinutes: number;   // aging..critical → red
  // beyond critical → flashing red (expired)
}

export const DEFAULT_AGING: AgingThresholds = {
  freshMinutes: 5,
  agingMinutes: 10,
  criticalMinutes: 15,
};

export const AGING_COLORS: Record<AgingLevel, { bg: string; border: string; text: string; label: string }> = {
  fresh:    { bg: 'bg-emerald-50',  border: 'border-emerald-400',  text: 'text-emerald-800',  label: 'Fresh' },
  aging:    { bg: 'bg-amber-50',    border: 'border-amber-400',    text: 'text-amber-800',    label: 'Aging' },
  critical: { bg: 'bg-rose-50',     border: 'border-rose-500',     text: 'text-rose-800',     label: 'Critical' },
  expired:  { bg: 'bg-red-100',     border: 'border-red-600 animate-pulse', text: 'text-red-900', label: 'Expired' },
};

// ---------------------------------------------------------------------------
// Age computation
// ---------------------------------------------------------------------------

const batchStart = (batch: KitchenOrderBatch): Date | null => {
  const ts = batch.items[0]?.activated_at ?? batch.items[0]?.created_at ?? batch.createdAt;
  if (!ts) return null;
  try {
    return toLuxonDateTime(ts).toJSDate();
  } catch {
    return null;
  }
};

/** Minutes since the batch was activated/created. */
export const getBatchAgeMinutes = (batch: KitchenOrderBatch): number => {
  const start = batchStart(batch);
  if (!start) return 0;
  const now = nowInAppTimezone().toJSDate();
  return Math.max(0, (now.getTime() - start.getTime()) / 60_000);
};

export const getAgingLevel = (
  batch: KitchenOrderBatch,
  thresholds: AgingThresholds = DEFAULT_AGING
): AgingLevel => {
  const mins = getBatchAgeMinutes(batch);
  if (mins < thresholds.freshMinutes) return 'fresh';
  if (mins < thresholds.agingMinutes) return 'aging';
  if (mins < thresholds.criticalMinutes) return 'critical';
  return 'expired';
};

// ---------------------------------------------------------------------------
// Bump-bar keyboard navigation
// ---------------------------------------------------------------------------

export type BumpAction = 'next' | 'prev' | 'bump' | 'recall' | 'recall-all' | 'recall-last' | 'expeditor' | 'refresh' | 'sound';

export interface BumpKeyMap {
  next: string;        // ArrowRight
  prev: string;        // ArrowLeft
  bump: string;        // Enter or Space
  recall: string;      // Backspace
  recallLast: string;  // 'r'
  expeditor: string;   // 'e'
  refresh: string;     // 'F5' or 'r' alt
  sound: string;       // 'm' (mute toggle)
}

export const DEFAULT_KEYMAP: BumpKeyMap = {
  next: 'ArrowRight',
  prev: 'ArrowLeft',
  bump: 'Enter',
  recall: 'Backspace',
  recallLast: 'r',
  expeditor: 'e',
  refresh: 'F5',
  sound: 'm',
};

/** Resolve a KeyboardEvent to a BumpAction. Returns null if no match. */
export const resolveBumpKey = (
  e: KeyboardEvent,
  keymap: BumpKeyMap = DEFAULT_KEYMAP
): BumpAction | null => {
  // Don't intercept when user is typing in an input/textarea
  const target = e.target as HTMLElement | null;
  if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
    return null;
  }
  const key = e.key;
  if (key === keymap.next) return 'next';
  if (key === keymap.prev) return 'prev';
  if (key === keymap.bump || key === ' ') return 'bump';
  if (key === keymap.recall) return 'recall';
  if (key.toLowerCase() === keymap.recallLast.toLowerCase()) return 'recall-last';
  if (key.toLowerCase() === keymap.expeditor.toLowerCase()) return 'expeditor';
  if (key.toLowerCase() === keymap.sound.toLowerCase()) return 'sound';
  if (key === keymap.refresh || key === 'F5') {
    e.preventDefault();
    return 'refresh';
  }
  return null;
};

// ---------------------------------------------------------------------------
// Expeditor view — merge all stations into one board
// ---------------------------------------------------------------------------

export interface ExpeditorTicket {
  orderId: string;
  orderNumber: string;
  tableName: string;
  orderType: string;
  createdAt: Date;
  ageMinutes: number;
  agingLevel: AgingLevel;
  stations: {
    kitchenId: string;
    kitchenName: string;
    items: OrderItemKitchen[];
    allReady: boolean;
  }[];
  allReady: boolean;
  covers?: number;
}

/** Convert a list of KitchenOrder (per-station boards) into one expeditor list. */
export const buildExpeditorView = (
  kitchenOrders: { order: Order; batches: KitchenOrderBatch[] }[],
  thresholds: AgingThresholds = DEFAULT_AGING
): ExpeditorTicket[] => {
  const byOrder = new Map<string, ExpeditorTicket>();

  for (const ko of kitchenOrders) {
    const orderId = ko.order.id?.toString() ?? '';
    if (!orderId) continue;
    const firstBatch = ko.batches[0];
    const ageMinutes = firstBatch ? getBatchAgeMinutes(firstBatch) : 0;
    const agingLevel = firstBatch ? getAgingLevel(firstBatch, thresholds) : 'fresh';

    let ticket = byOrder.get(orderId);
    if (!ticket) {
      ticket = {
        orderId,
        orderNumber: ko.order.invoice_number?.toString() ?? ko.order.auto_id?.toString() ?? orderId,
        tableName: ko.order.table?.name ?? `Table ${ko.order.table?.number ?? '?'}`,
        orderType: ko.order.order_type?.name ?? 'Dine-in',
        createdAt: firstBatch ? (batchStart(firstBatch) ?? new Date()) : new Date(),
        ageMinutes,
        agingLevel,
        stations: [],
        allReady: false,
        covers: ko.order.covers,
      };
      byOrder.set(orderId, ticket);
    }
    // Merge batches into the station list
    for (const batch of ko.batches) {
      const kitchenId = batch.items[0]?.kitchen?.id?.toString() ?? 'unknown';
      const kitchenName = batch.items[0]?.kitchen?.name ?? 'Unassigned';
      const items = batch.items.filter(i => i.status !== OrderItemKitchenStatus.Cancelled);
      const allReady = items.length > 0 && items.every(i =>
        i.status === OrderItemKitchenStatus.Completed || i.is_terminal
      );
      const existing = ticket.stations.find(s => s.kitchenId === kitchenId);
      if (existing) {
        existing.items.push(...items);
        existing.allReady = existing.allReady && allReady;
      } else {
        ticket.stations.push({ kitchenId, kitchenName, items, allReady });
      }
    }
  }

  const tickets = Array.from(byOrder.values());
  // Recompute allReady + aging
  for (const t of tickets) {
    t.allReady = t.stations.length > 0 && t.stations.every(s => s.allReady);
  }
  // Sort: ready first, then by age descending (oldest first)
  tickets.sort((a, b) => {
    if (a.allReady !== b.allReady) return a.allReady ? -1 : 1;
    return b.ageMinutes - a.ageMinutes;
  });
  return tickets;
};

// ---------------------------------------------------------------------------
// Station statistics — bottleneck detection, throughput
// ---------------------------------------------------------------------------

export interface KdsStationStats {
  kitchenId: string;
  kitchenName: string;
  activeCount: number;
  completedToday: number;
  recalledToday: number;
  avgPrepMinutes: number;
  longestActiveMinutes: number;
  bottleneckScore: number;  // 0..100 — higher = more bottlenecked
}

export const computeStationStats = (
  kitchenId: string,
  kitchenName: string,
  activeBatches: KitchenOrderBatch[],
  completedToday: { completed_at?: Date | string; started_at?: Date | string }[],
  recalledToday: number,
  thresholds: AgingThresholds = DEFAULT_AGING
): KdsStationStats => {
  const activeCount = activeBatches.length;
  const completedCount = completedToday.length;

  // Average prep time from completed items
  const prepTimes: number[] = [];
  for (const c of completedToday) {
    const start = c.started_at ? toLuxonDateTime(c.started_at).toJSDate() : null;
    const end = c.completed_at ? toLuxonDateTime(c.completed_at).toJSDate() : null;
    if (start && end) {
      prepTimes.push((end.getTime() - start.getTime()) / 60_000);
    }
  }
  const avgPrepMinutes = prepTimes.length > 0
    ? prepTimes.reduce((s, t) => s + t, 0) / prepTimes.length
    : 0;

  // Longest active
  let longestActiveMinutes = 0;
  for (const b of activeBatches) {
    const age = getBatchAgeMinutes(b);
    if (age > longestActiveMinutes) longestActiveMinutes = age;
  }

  // Bottleneck score: weighted combination of:
  //   - active load (cap at 10 → 40%)
  //   - longest active beyond critical (40%)
  //   - average prep time beyond aging (20%)
  const loadScore = Math.min(1, activeCount / 10) * 40;
  const overdueScore = Math.min(1, Math.max(0, (longestActiveMinutes - thresholds.criticalMinutes) / thresholds.criticalMinutes)) * 40;
  const slowPrepScore = Math.min(1, Math.max(0, (avgPrepMinutes - thresholds.agingMinutes) / thresholds.agingMinutes)) * 20;
  const bottleneckScore = Math.round(loadScore + overdueScore + slowPrepScore);

  return {
    kitchenId,
    kitchenName,
    activeCount,
    completedToday: completedCount,
    recalledToday,
    avgPrepMinutes,
    longestActiveMinutes,
    bottleneckScore,
  };
};

// ---------------------------------------------------------------------------
// Recall undo window — recently bumped orders can be recalled
// ---------------------------------------------------------------------------

export interface RecallCandidate {
  orderId: string;
  orderNumber: string;
  tableName: string;
  kitchenId: string;
  bumpedAt: Date;
  ageSeconds: number;
}

export const getRecallCandidates = (
  recentlyBumped: { orderId: string; orderNumber: string; tableName: string; kitchenId: string; bumpedAt: Date }[],
  undoWindowSeconds = 30
): RecallCandidate[] => {
  const now = Date.now();
  return recentlyBumped
    .map(r => ({
      ...r,
      ageSeconds: Math.floor((now - r.bumpedAt.getTime()) / 1000),
    }))
    .filter(r => r.ageSeconds <= undoWindowSeconds)
    .sort((a, b) => a.ageSeconds - b.ageSeconds);
};

// ---------------------------------------------------------------------------
// KDS config — read from settings (with sensible defaults)
// ---------------------------------------------------------------------------

export interface KdsConfig {
  agingThresholds: AgingThresholds;
  soundEnabled: boolean;
  bumpBarEnabled: boolean;
  expeditorMode: boolean;
  autoBumpWhenAllReady: boolean;
  recallUndoWindowSeconds: number;
  showStationNames: boolean;
  compactMode: boolean;
}

export const DEFAULT_KDS_CONFIG: KdsConfig = {
  agingThresholds: DEFAULT_AGING,
  soundEnabled: true,
  bumpBarEnabled: true,
  expeditorMode: false,
  autoBumpWhenAllReady: false,
  recallUndoWindowSeconds: 30,
  showStationNames: true,
  compactMode: false,
};

/** Read KDS config from settings (added via migration 2026_08_28_kds). */
export const readKdsConfig = (settings: any): KdsConfig => {
  if (!settings) return DEFAULT_KDS_CONFIG;
  return {
    agingThresholds: {
      freshMinutes: settings.kds_fresh_minutes ?? DEFAULT_AGING.freshMinutes,
      agingMinutes: settings.kds_aging_minutes ?? DEFAULT_AGING.agingMinutes,
      criticalMinutes: settings.kds_critical_minutes ?? DEFAULT_AGING.criticalMinutes,
    },
    soundEnabled: settings.kds_sound_enabled ?? true,
    bumpBarEnabled: settings.kds_bumpbar_enabled ?? true,
    expeditorMode: settings.kds_expeditor_mode ?? false,
    autoBumpWhenAllReady: settings.kds_auto_bump ?? false,
    recallUndoWindowSeconds: settings.kds_recall_window_seconds ?? 30,
    showStationNames: settings.kds_show_station_names ?? true,
    compactMode: settings.kds_compact_mode ?? false,
  };
};
