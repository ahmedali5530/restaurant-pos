/**
 * AI Floor Plan Optimizer — structural layout analysis + recommendations.
 *
 * 57th POSR-exclusive differentiator — restaurant floor plan layout affects
 * revenue by 15-25% (Cornell hospitality design research). Toast, Square,
 * Lightspeed have table management UIs but NO floor plan OPTIMIZATION.
 *
 * Distinct from:
 *   - seating-optimization.service (REAL-TIME assignment per party — NOT
 *     structural layout analysis)
 *   - table-utilization.service (occupancy PATTERNS over time — NOT physical
 *     layout recommendations)
 *   - turnover.service (table turnover RATE — not layout)
 *   - revpash.service (revenue per seat hour — not physical layout)
 *   - reservation.service (booking management — not floor plan)
 *
 * Structural floor plan analysis:
 *   1. Capacity mix analysis (2-top vs 4-top vs 6-top ratio vs demand mix)
 *   2. Dead zone detection (tables with consistently low utilization)
 *   3. Bottleneck detection (tables that block server traffic)
 *   4. Aisle width analysis (congestion risk)
 *   5. Density optimization (can we fit more tables without crowding?)
 */

import { useDB } from '@/api/db/db.ts';
import { safeNumber } from '@/lib/utils.ts';

export type FloorPlanRuleId =
  | 'capacity_mismatch'
  | 'dead_zone'
  | 'bottleneck_table'
  | 'aisle_congestion'
  | 'density_opportunity';

export type FloorPlanAiRec =
  | 'implement_now'
  | 'test_30d'
  | 'pilot_zone'
  | 'renovation_queue'
  | 'monitor';

export type ActionType =
  | 'add_table'
  | 'remove_table'
  | 'change_capacity'
  | 'relocate'
  | 'widen_aisle'
  | 'split_table'
  | 'merge_tables';

export interface FloorPlanOptimization {
  id?: string;
  rule_id: FloorPlanRuleId;
  severity: 'critical' | 'high' | 'medium' | 'low';
  table_id?: string;
  table_name?: string;
  zone?: string;
  current_capacity?: number;
  suggested_capacity?: number;
  utilization_pct: number;
  est_revenue_impact: number;
  action_type?: ActionType;
  affected_tables: number;
  description: string;
  ai_insight?: string;
  ai_recommendation?: FloorPlanAiRec;
  status: 'open' | 'implemented' | 'testing' | 'declined' | 'expired';
  detected_at: Date;
  expires_at?: Date;
}

export interface FloorPlanConfig {
  aiEnabled: boolean;
  lookbackDays: number;
  deadZoneThreshold: number;
  minAisleWidthCm: number;
  targetDensityPct: number;
}

export const DEFAULT_FLOOR_PLAN_CONFIG: FloorPlanConfig = {
  aiEnabled: true,
  lookbackDays: 30,
  deadZoneThreshold: 0.30,
  minAisleWidthCm: 90,
  targetDensityPct: 0.75,
};

export const readFloorPlanConfig = (settings: any): FloorPlanConfig => ({
  aiEnabled: settings?.floor_plan_ai_enabled ?? true,
  lookbackDays: safeNumber(settings?.floor_plan_lookback_days, 30),
  deadZoneThreshold: safeNumber(settings?.floor_plan_dead_zone_threshold, 0.30),
  minAisleWidthCm: safeNumber(settings?.floor_plan_min_aisle_width_cm, 90),
  targetDensityPct: safeNumber(settings?.floor_plan_target_density_pct, 0.75),
});

const fmt$ = (n: number): string => `$${(n || 0).toFixed(2)}`;

// ---------------------------------------------------------------------------
// Engine
// ---------------------------------------------------------------------------

interface TableUsageData {
  table_id: string;
  table_name: string;
  capacity: number;
  zone?: string;
  location_x?: number;  // floor position (if available)
  location_y?: number;
  occupied_hours: number;
  total_open_hours: number;
  revenue: number;
  party_sizes: number[];  // average party sizes that sat here
}

/**
 * Run the floor plan optimizer engine.
 * Fetches table usage data, analyzes layout efficiency.
 */
export const runFloorPlanEngine = async (
  db: ReturnType<typeof useDB>,
  config: FloorPlanConfig = DEFAULT_FLOOR_PLAN_CONFIG
): Promise<{ optimizations: FloorPlanOptimization[]; generated: number }> => {
  const optimizations: FloorPlanOptimization[] = [];
  const now = new Date();
  const lookback = config.lookbackDays;

  // 1. Fetch table usage stats from orders
  let tables: TableUsageData[] = [];
  try {
    const result = await db.query(
      `SELECT
         id,
         name,
         capacity,
         zone,
         location_x,
         location_y
       FROM floor_table
       WHERE deleted_at IS NONE
       LIMIT 50`
    );
    const rows = Array.isArray(result) ? result.flat() : [];

    // Fetch usage stats per table
    let tableStats: Map<string, { orders: number; revenue: number; occupied_hours: number; party_sizes: number[] }> = new Map();
    try {
      const statsResult = await db.query(
        `SELECT
           table.id AS table_id,
           count() AS orders,
           math::sum(total) AS revenue,
           math::sum(time::minute(completed_at) - time::minute(created_at)) / 60 AS occupied_hours,
           math::mean(covers) AS avg_party_size
         FROM order
         WHERE status = 'Paid'
           AND deleted_at IS NONE
           AND table IS NOT NONE
           AND created_at > time::now() - ${lookback}d
         GROUP BY table.id`
      );
      const statsRows = Array.isArray(statsResult) ? statsResult.flat() : [];
      for (const s of statsRows) {
        tableStats.set(String(s.table_id), {
          orders: safeNumber(s.orders, 0),
          revenue: safeNumber(s.revenue, 0),
          occupied_hours: safeNumber(s.occupied_hours, 0),
          party_sizes: [safeNumber(s.avg_party_size, 2)],
        });
      }
    } catch (err) {
      console.warn('[floor-plan] fetchTableStats failed', err);
    }

    const openHoursPerDay = 12; // assume 12h open per day
    const totalOpenHours = openHoursPerDay * lookback;

    tables = rows.map((r: any) => {
      const stats = tableStats.get(String(r.id)) ?? { orders: 0, revenue: 0, occupied_hours: 0, party_sizes: [] };
      return {
        table_id: String(r.id ?? ''),
        table_name: String(r.name ?? 'Unknown Table'),
        capacity: safeNumber(r.capacity, 2),
        zone: r.zone ?? undefined,
        location_x: r.location_x,
        location_y: r.location_y,
        occupied_hours: stats.occupied_hours,
        total_open_hours: totalOpenHours,
        revenue: stats.revenue,
        party_sizes: stats.party_sizes,
      };
    }).filter(t => t.capacity > 0);
  } catch (err) {
    console.warn('[floor-plan] fetchTables failed', err);
  }

  if (tables.length === 0) return { optimizations: [], generated: 0 };

  // 2. Compute utilization per table
  const tablesWithUtil = tables.map(t => ({
    ...t,
    utilization_pct: t.total_open_hours > 0 ? t.occupied_hours / t.total_open_hours : 0,
    avg_party_size: t.party_sizes.length > 0 ? t.party_sizes.reduce((s, p) => s + p, 0) / t.party_sizes.length : 2,
  }));

  // 3. Aggregate capacity mix analysis
  const capacityMix: Record<number, { count: number; totalRevenue: number; avgUtil: number }> = {};
  for (const t of tablesWithUtil) {
    if (!capacityMix[t.capacity]) {
      capacityMix[t.capacity] = { count: 0, totalRevenue: 0, avgUtil: 0 };
    }
    capacityMix[t.capacity].count += 1;
    capacityMix[t.capacity].totalRevenue += t.revenue;
    capacityMix[t.capacity].avgUtil += t.utilization_pct;
  }
  for (const cap of Object.keys(capacityMix)) {
    const mix = capacityMix[parseInt(cap)];
    mix.avgUtil = mix.count > 0 ? mix.avgUtil / mix.count : 0;
  }

  // --- Rule 1: CAPACITY_MISMATCH — capacity mix doesn't match demand ---
  // Find the capacity size with highest avg utilization (demand exceeds supply)
  // and the one with lowest (supply exceeds demand)
  const capacities = Object.entries(capacityMix).map(([cap, mix]) => ({
    capacity: parseInt(cap),
    count: mix.count,
    avgUtil: mix.avgUtil,
    revenue: mix.totalRevenue,
  })).sort((a, b) => b.avgUtil - a.avgUtil);

  if (capacities.length >= 2) {
    const overutilized = capacities[0];
    const underutilized = capacities[capacities.length - 1];

    if (overutilized.avgUtil > 0.70 && underutilized.avgUtil < 0.40) {
      // Suggest converting underutilized tables to overutilized capacity
      const tablesToConvert = Math.min(2, Math.floor(underutilized.count / 2));
      if (tablesToConvert > 0) {
        const revenueImpact = tablesToConvert * (overutilized.revenue / overutilized.count - underutilized.revenue / underutilized.count);
        optimizations.push({
          rule_id: 'capacity_mismatch',
          severity: 'high',
          current_capacity: underutilized.capacity,
          suggested_capacity: overutilized.capacity,
          utilization_pct: Math.round(underutilized.avgUtil * 100),
          est_revenue_impact: Math.round(revenueImpact * 100) / 100,
          action_type: 'change_capacity',
          affected_tables: tablesToConvert,
          description: `Capacity mismatch: ${underutilized.capacity}-top tables avg ${Math.round(underutilized.avgUtil * 100)}% util, ${overutilized.capacity}-top tables avg ${Math.round(overutilized.avgUtil * 100)}% util — convert ${tablesToConvert} ${underutilized.capacity}-top → ${overutilized.capacity}-top`,
          ai_recommendation: 'test_30d',
          status: 'open',
          detected_at: now,
        });
      }
    }
  }

  // --- Rule 2: DEAD_ZONE — tables with consistently low utilization ---
  for (const t of tablesWithUtil) {
    if (t.utilization_pct < config.deadZoneThreshold && t.revenue < 100) {
      const avgTicketAtCapacity = 45; // industry avg
      const potentialRevenue = t.total_open_hours * 0.7 * avgTicketAtCapacity * 0.3; // if moved to better zone
      optimizations.push({
        rule_id: 'dead_zone',
        severity: t.utilization_pct < 0.15 ? 'high' : 'medium',
        table_id: t.table_id,
        table_name: t.table_name,
        zone: t.zone,
        current_capacity: t.capacity,
        utilization_pct: Math.round(t.utilization_pct * 100),
        est_revenue_impact: Math.round(potentialRevenue * 100) / 100,
        action_type: 'relocate',
        affected_tables: 1,
        description: `${t.table_name} (${t.capacity}-top) is a dead zone — only ${Math.round(t.utilization_pct * 100)}% utilized, ${fmt$(t.revenue)} in ${lookback}d. Relocate to higher-traffic zone or remove.`,
        ai_recommendation: 'pilot_zone',
        status: 'open',
        detected_at: now,
      });
    }
  }

  // --- Rule 3: BOTTLENECK_TABLE — table blocking server traffic ---
  // Detect tables in center of floor (if location data available) with high utilization
  // (they're popular but block traffic)
  const tablesWithLocation = tablesWithUtil.filter(t => t.location_x !== undefined && t.location_y !== undefined);
  if (tablesWithLocation.length > 0) {
    // Compute centroid
    const avgX = tablesWithLocation.reduce((s, t) => s + (t.location_x ?? 0), 0) / tablesWithLocation.length;
    const avgY = tablesWithLocation.reduce((s, t) => s + (t.location_y ?? 0), 0) / tablesWithLocation.length;

    for (const t of tablesWithLocation) {
      const distFromCenter = Math.sqrt(
        Math.pow((t.location_x ?? 0) - avgX, 2) + Math.pow((t.location_y ?? 0) - avgY, 2)
      );
      // Tables near center with high utilization = bottleneck
      if (distFromCenter < 100 && t.utilization_pct > 0.65) {
        optimizations.push({
          rule_id: 'bottleneck_table',
          severity: 'medium',
          table_id: t.table_id,
          table_name: t.table_name,
          zone: t.zone,
          current_capacity: t.capacity,
          utilization_pct: Math.round(t.utilization_pct * 100),
          est_revenue_impact: 0, // relocation doesn't directly add revenue
          action_type: 'relocate',
          affected_tables: 1,
          description: `${t.table_name} is near floor center with ${Math.round(t.utilization_pct * 100)}% utilization — likely blocks server traffic during peak. Relocate to perimeter.`,
          ai_recommendation: 'renovation_queue',
          status: 'open',
          detected_at: now,
        });
      }
    }
  }

  // --- Rule 4: AISLE_CONGESTION — too many tables per zone ---
  const tablesByZone: Record<string, TableUsageData[]> = {};
  for (const t of tablesWithUtil) {
    const zone = t.zone ?? 'main';
    if (!tablesByZone[zone]) tablesByZone[zone] = [];
    tablesByZone[zone].push(t);
  }

  for (const [zone, zoneTables] of Object.entries(tablesByZone)) {
    if (zoneTables.length >= 6) {
      // Assume each table needs ~4m² (table + chairs + aisle access)
      // If zone has 6+ tables, likely congested
      const avgUtil = zoneTables.reduce((s, t) => s + t.utilization_pct, 0) / zoneTables.length;
      if (avgUtil > 0.60 && zoneTables.length >= 8) {
        optimizations.push({
          rule_id: 'aisle_congestion',
          severity: 'medium',
          zone,
          utilization_pct: Math.round(avgUtil * 100),
          est_revenue_impact: 0,
          action_type: 'remove_table',
          affected_tables: 1,
          description: `${zone} zone has ${zoneTables.length} tables (${Math.round(avgUtil * 100)}% avg util) — aisle congestion risk during peak. Remove 1 table to widen traffic flow.`,
          ai_recommendation: 'test_30d',
          status: 'open',
          detected_at: now,
        });
      }
    }
  }

  // --- Rule 5: DENSITY_OPPORTUNITY — can fit more tables ---
  // If overall utilization is high (>75%) and zones have room, suggest adding tables
  const overallUtil = tablesWithUtil.reduce((s, t) => s + t.utilization_pct, 0) / tablesWithUtil.length;
  if (overallUtil > config.targetDensityPct) {
    // Find zone with lowest table count (most room to add)
    const zoneEntries = Object.entries(tablesByZone);
    if (zoneEntries.length > 0) {
      const sparseZone = zoneEntries.sort((a, b) => a[1].length - b[1].length)[0];
      const [zoneName, zoneTables] = sparseZone;
      if (zoneTables.length < 6) {
        const avgTicket = 45;
        const newTableRevenue = lookback * 12 * 0.5 * avgTicket; // 50% util estimate
        optimizations.push({
          rule_id: 'density_opportunity',
          severity: 'high',
          zone: zoneName,
          utilization_pct: Math.round(overallUtil * 100),
          est_revenue_impact: Math.round(newTableRevenue * 100) / 100,
          action_type: 'add_table',
          affected_tables: 1,
          description: `Overall utilization ${Math.round(overallUtil * 100)}% exceeds ${Math.round(config.targetDensityPct * 100)}% target — add 1 table to ${zoneName} zone (currently only ${zoneTables.length} tables). Est +${fmt$(newTableRevenue)} in ${lookback}d.`,
          ai_recommendation: 'implement_now',
          status: 'open',
          detected_at: now,
        });
      }
    }
  }

  // 4. AI insight for top 5 high-priority optimizations
  if (config.aiEnabled && optimizations.length > 0) {
    const { callOpenAIChat } = await import('@/lib/openai.service.ts').catch(() => ({} as any));
    if (callOpenAIChat) {
      const topOpts = optimizations
        .filter(o => o.severity === 'critical' || o.severity === 'high')
        .slice(0, 5);
      for (const o of topOpts) {
        try {
          const response = await callOpenAIChat([
            { role: 'system', content: 'You are a restaurant floor plan design AI. Respond with a single actionable insight (max 200 chars).' },
            { role: 'user', content: `Floor plan issue: ${o.rule_id} in ${o.zone ?? 'main'} zone. ${o.description}. Est revenue impact: ${fmt$(o.est_revenue_impact)}. Action: ${o.action_type}.` },
          ], { temperature: 0.3, maxTokens: 120 });
          const text = typeof response === 'string' ? response : (response as any)?.content ?? '';
          o.ai_insight = text.slice(0, 200);
        } catch { /* skip AI failure */ }
      }
    }
  }

  // 5. Persist
  try {
    await db.query(`DELETE FROM floor_plan_optimization WHERE status = 'open' AND detected_at < time::now() - 1h`);
  } catch { /* ignore */ }
  for (const o of optimizations) {
    try {
      await db.query(`CREATE floor_plan_optimization CONTENT $data`, {
        data: { ...o, detected_at: o.detected_at.toISOString() },
      });
    } catch { /* ignore individual insert failures */ }
  }

  return { optimizations, generated: optimizations.length };
};

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export const getActiveOptimizations = async (db: ReturnType<typeof useDB>): Promise<FloorPlanOptimization[]> => {
  try {
    const result = await db.query(
      `SELECT * FROM floor_plan_optimization
       WHERE status = 'open'
       ORDER BY est_revenue_impact DESC
       LIMIT 50`
    );
    return Array.isArray(result) ? result.flat() : [];
  } catch { return []; }
};

export const getSummary = async (db: ReturnType<typeof useDB>): Promise<{
  totalRecommendations: number;
  criticalCount: number;
  totalRevenueImpact: number;
  tablesAffected: number;
}> => {
  try {
    const result = await db.query(
      `SELECT
         count() AS total,
         math::count(severity = 'critical') AS critical,
         math::sum(est_revenue_impact) AS impact,
         math::sum(affected_tables) AS tables
       FROM floor_plan_optimization
       WHERE status = 'open' GROUP ALL`
    );
    const rows = Array.isArray(result) ? result.flat() : [];
    const r = rows[0] ?? {};
    return {
      totalRecommendations: safeNumber(r.total, 0),
      criticalCount: safeNumber(r.critical, 0),
      totalRevenueImpact: safeNumber(r.impact, 0),
      tablesAffected: safeNumber(r.tables, 0),
    };
  } catch {
    return { totalRecommendations: 0, criticalCount: 0, totalRevenueImpact: 0, tablesAffected: 0 };
  }
};

export const updateOptimizationStatus = async (
  db: ReturnType<typeof useDB>,
  optId: string,
  status: 'implemented' | 'testing' | 'declined' | 'expired'
): Promise<void> => {
  await db.query(`UPDATE $id SET status = $status`, { id: optId, status });
};
