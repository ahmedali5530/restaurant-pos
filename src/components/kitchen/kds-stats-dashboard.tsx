/**
 * KDS Stats Dashboard — per-station throughput, bottleneck detection.
 *
 * Displays:
 *   - Active orders per station (live)
 *   - Completed today + recalled today
 *   - Average prep time per station
 *   - Longest active order (age)
 *   - Bottleneck score (0-100) — weighted combination of load, overdue, slow-prep
 *
 * Bottleneck score interpretation:
 *   0-20   healthy — keep up the pace
 *   21-50  busy — watch closely
 *   51-75  strained — consider reallocating staff
 *   76-100 critical — divert staff / pause new tickets
 *
 * Pricing: Toast KDS Analytics is part of the higher-tier add-on (~$69+/mo/station).
 * POSR offers it free.
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useDB } from '@/api/db/db.ts';
import { useTranslation } from 'react-i18next';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faBolt, faCheckCircle, faUndo, faClock, faGaugeHigh, faTriangleExclamation } from '@fortawesome/free-solid-svg-icons';
import {
  computeStationStats,
  DEFAULT_AGING,
  type KdsStationStats,
} from '@/lib/kitchen/kds.service.ts';
import { withCurrency } from '@/lib/utils.ts';
import { getAppStartOfDaySurreal } from '@/lib/datetime.ts';

const BOTTLENECK_COLOR = (score: number): string => {
  if (score <= 20) return 'text-emerald-600 bg-emerald-50 border-emerald-300';
  if (score <= 50) return 'text-amber-600 bg-amber-50 border-amber-300';
  if (score <= 75) return 'text-orange-600 bg-orange-50 border-orange-300';
  return 'text-rose-600 bg-rose-50 border-rose-400';
};

const BOTTLENECK_LABEL = (score: number): string => {
  if (score <= 20) return 'Healthy';
  if (score <= 50) return 'Busy';
  if (score <= 75) return 'Strained';
  return 'Critical';
};

export function KdsStatsDashboard() {
  const { t } = useTranslation(['kds', 'common']);
  const db = useDB();
  const [stats, setStats] = useState<KdsStationStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const todayStart = getAppStartOfDaySurreal();
      // Active batches per kitchen
      const activeResult = await db.query<any[]>(
        `SELECT
           kitchen.id AS kitchen_id,
           kitchen.name AS kitchen_name,
           order.id AS order_id,
           order.invoice_number AS order_number,
           order.table.name AS table_name,
           activated_at,
           created_at,
           started_at,
           completed_at,
           status
         FROM order_item_kitchen
         WHERE status IN ['pending', 'in_progress']
           AND deleted_at IS NONE
         FETCH kitchen, order, order.table`
      );
      const activeList = Array.isArray(activeResult) ? activeResult.flat() : [];

      // Completed today (for avg prep time + count)
      const completedResult = await db.query<any[]>(
        `SELECT kitchen.id AS kitchen_id, kitchen.name AS kitchen_name, started_at, completed_at
         FROM kds_event
         WHERE event_type = 'bumped' AND created_at > $todayStart
         FETCH kitchen`,
        { todayStart }
      );
      const completedList = Array.isArray(completedResult) ? completedResult.flat() : [];

      // Recalled today
      const recalledResult = await db.query<any[]>(
        `SELECT kitchen.id AS kitchen_id, count() AS recalled_count
         FROM kds_event
         WHERE event_type = 'recalled' AND created_at > $todayStart
         GROUP BY kitchen_id
         FETCH kitchen`
      );
      const recalledList = Array.isArray(recalledResult) ? recalledResult.flat() : [];

      // Build per-station stats
      const stationMap = new Map<string, { name: string; active: any[]; completed: any[]; recalled: number }>();
      for (const a of activeList) {
        const kid = a.kitchen_id?.toString?.() ?? 'unknown';
        const kname = a.kitchen_name ?? 'Unassigned';
        if (!stationMap.has(kid)) stationMap.set(kid, { name: kname, active: [], completed: [], recalled: 0 });
        stationMap.get(kid)!.active.push(a);
      }
      for (const c of completedList) {
        const kid = c.kitchen_id?.toString?.() ?? 'unknown';
        const kname = c.kitchen_name ?? 'Unassigned';
        if (!stationMap.has(kid)) stationMap.set(kid, { name: kname, active: [], completed: [], recalled: 0 });
        stationMap.get(kid)!.completed.push(c);
      }
      for (const r of recalledList) {
        const kid = r.kitchen_id?.toString?.() ?? 'unknown';
        if (!stationMap.has(kid)) stationMap.set(kid, { name: 'Unknown', active: [], completed: [], recalled: 0 });
        stationMap.get(kid)!.recalled = r.recalled_count ?? 0;
      }

      // Group active items into pseudo-batches by (kitchen, order)
      const computed: KdsStationStats[] = [];
      for (const [kid, data] of stationMap) {
        const batchesByOrder = new Map<string, any[]>();
        for (const a of data.active) {
          const oid = a.order_id?.toString?.() ?? 'unknown';
          if (!batchesByOrder.has(oid)) batchesByOrder.set(oid, []);
          batchesByOrder.get(oid)!.push(a);
        }
        const activeBatches = Array.from(batchesByOrder.values()).map((items, idx) => ({
          batchKey: `batch-${idx}`,
          items,
          createdAt: items[0]?.activated_at ?? items[0]?.created_at,
        })) as any;
        const stat = computeStationStats(kid, data.name, activeBatches, data.completed, data.recalled, DEFAULT_AGING);
        computed.push(stat);
      }
      // Sort by bottleneck score descending — worst first
      computed.sort((a, b) => b.bottleneckScore - a.bottleneckScore);
      setStats(computed);
    } catch (err) {
      console.error('[kds-stats] refresh failed', err);
      setError(err instanceof Error ? err.message : 'Failed to load stats');
    } finally {
      setLoading(false);
    }
  }, [db]);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 30_000); // refresh every 30s
    return () => clearInterval(interval);
  }, [refresh]);

  const totals = useMemo(() => {
    return {
      activeCount: stats.reduce((s, x) => s + x.activeCount, 0),
      completedToday: stats.reduce((s, x) => s + x.completedToday, 0),
      recalledToday: stats.reduce((s, x) => s + x.recalledToday, 0),
      avgPrep: stats.length > 0
        ? stats.reduce((s, x) => s + x.avgPrepMinutes, 0) / stats.length
        : 0,
      worstBottleneck: stats.length > 0 ? Math.max(...stats.map(x => x.bottleneckScore)) : 0,
    };
  }, [stats]);

  if (loading && stats.length === 0) {
    return (
      <div className="p-6 text-center text-neutral-400">
        <FontAwesomeIcon icon={faGaugeHigh} spin className="text-3xl mb-3" />
        <p>Loading KDS statistics…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 text-center text-rose-600">
        <FontAwesomeIcon icon={faTriangleExclamation} className="text-3xl mb-3" />
        <p>{error}</p>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4">
      {/* Top summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <SummaryCard icon={faBolt} label="Active" value={totals.activeCount} color="text-amber-600" />
        <SummaryCard icon={faCheckCircle} label="Completed today" value={totals.completedToday} color="text-emerald-600" />
        <SummaryCard icon={faUndo} label="Recalled today" value={totals.recalledToday} color="text-rose-600" />
        <SummaryCard icon={faClock} label="Avg prep (min)" value={totals.avgPrep.toFixed(1)} color="text-blue-600" />
        <SummaryCard icon={faGaugeHigh} label="Worst bottleneck" value={totals.worstBottleneck} color={BOTTLENECK_COLOR(totals.worstBottleneck).split(' ')[0]} />
      </div>

      {/* Per-station table */}
      <div className="rounded-lg border border-neutral-200 bg-white overflow-hidden">
        <div className="px-4 py-3 border-b border-neutral-200">
          <h3 className="font-medium">Per-station performance</h3>
        </div>
        <div className="overflow-x-auto max-h-96 overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 sticky top-0">
              <tr>
                <th className="text-left p-3">Station</th>
                <th className="text-right p-3">Active</th>
                <th className="text-right p-3">Completed</th>
                <th className="text-right p-3">Recalled</th>
                <th className="text-right p-3">Avg prep (min)</th>
                <th className="text-right p-3">Longest active (min)</th>
                <th className="text-center p-3">Bottleneck</th>
              </tr>
            </thead>
            <tbody>
              {stats.length === 0 ? (
                <tr><td colSpan={7} className="p-4 text-center text-neutral-400">No KDS activity yet today.</td></tr>
              ) : (
                stats.map(s => (
                  <tr key={s.kitchenId} className="border-t hover:bg-neutral-50">
                    <td className="p-3 font-medium">{s.kitchenName}</td>
                    <td className="p-3 text-right tabular-nums">{s.activeCount}</td>
                    <td className="p-3 text-right tabular-nums text-emerald-600">{s.completedToday}</td>
                    <td className="p-3 text-right tabular-nums text-rose-600">{s.recalledToday}</td>
                    <td className="p-3 text-right tabular-nums">{s.avgPrepMinutes.toFixed(1)}</td>
                    <td className="p-3 text-right tabular-nums">
                      {s.longestActiveMinutes.toFixed(0)}
                      {s.longestActiveMinutes > DEFAULT_AGING.criticalMinutes && (
                        <span className="ml-1 text-rose-600">⚠</span>
                      )}
                    </td>
                    <td className="p-3 text-center">
                      <span className={`inline-block px-2 py-1 rounded-full text-xs font-semibold border ${BOTTLENECK_COLOR(s.bottleneckScore)}`}>
                        {s.bottleneckScore} · {BOTTLENECK_LABEL(s.bottleneckScore)}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Legend */}
      <div className="text-xs text-neutral-500 flex flex-wrap gap-4">
        <span>Bottleneck score:</span>
        <span className="text-emerald-600">● 0-20 Healthy</span>
        <span className="text-amber-600">● 21-50 Busy</span>
        <span className="text-orange-600">● 51-75 Strained</span>
        <span className="text-rose-600">● 76-100 Critical</span>
      </div>
    </div>
  );
}

const SummaryCard = ({
  icon,
  label,
  value,
  color,
}: { icon: any; label: string; value: number | string; color: string }) => (
  <div className="bg-white rounded-lg border border-neutral-200 p-3">
    <div className="flex items-center gap-2 text-xs text-neutral-500 mb-1">
      <FontAwesomeIcon icon={icon} className={color} />
      <span>{label}</span>
    </div>
    <div className={`text-2xl font-bold tabular-nums ${color}`}>{value}</div>
  </div>
);

export default KdsStatsDashboard;
