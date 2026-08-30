/**
 * AI Customer Lifetime Value Trajectory service — direction + velocity of CLV change.
 *
 * 19th POSR-exclusive differentiator — Toast, Square, Lightspeed have
 * point-in-time CLV (snapshot) but NO trend analysis. Restaurants don't know
 * which customers are GROWING vs DECLINING in value until they've already
 * churned. POSR computes CLV trajectory (direction + velocity) + AI
 * intervention recommendations.
 *
 * Distinct from:
 *   - clv.service (computes current CLV snapshot)
 *   - churn.service (predicts AT-RISK customers before they leave)
 *   - winback.service (targets customers who ALREADY LEFT)
 * This service predicts the DIRECTION + VELOCITY of CLV change for active
 * customers — surfaces declining customers BEFORE they become at-risk.
 *
 * Algorithm:
 *   1. For each customer, compute CLV in 3 windows: 0-30d, 31-60d, 61-90d
 *   2. Linear regression slope = velocity ($/month change)
 *   3. Trajectory classification:
 *      - 'accelerating': slope > +20%/month (growing fast)
 *      - 'growing': slope > 0 (positive trend)
 *      - 'stable': |slope| < 10% (steady)
 *      - 'declining': slope < 0 (slipping)
 *      - 'churning': slope < -30%/month (about to leave)
 *   4. Projected CLV (next 90d) = current_clv + (slope × 3)
 *   5. AI intervention: nurture | upsell | retain | investigate | reward
 */

import { useDB } from '@/api/db/db.ts';
import { safeNumber } from '@/lib/utils.ts';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type TrajectoryType = 'accelerating' | 'growing' | 'stable' | 'declining' | 'churning';
export type CLVIntervention = 'nurture' | 'upsell' | 'retain' | 'investigate' | 'reward';

export interface CLVTrajectory {
  id?: string;
  customer?: string;
  customer_name: string;
  current_clv: number;
  clv_30d: number;
  clv_31_60d: number;
  clv_61_90d: number;
  slope_per_month: number;
  trajectory: TrajectoryType;
  projected_clv_90d: number;
  projected_change_pct: number;
  visit_frequency_change_pct: number;
  avg_check_change_pct: number;
  data_points: number;
  ai_insight?: string;
  ai_intervention?: CLVIntervention;
  action_taken: string;
  analyzed_at: Date;
  branch_id?: string;
}

export interface CLVTrajectoryConfig {
  aiEnabled: boolean;
  minOrders: number;
  acceleratingThreshold: number;
  churningThreshold: number;
  stableThreshold: number;
  maxResults: number;
}

export const DEFAULT_CLVTRAJ_CONFIG: CLVTrajectoryConfig = {
  aiEnabled: true,
  minOrders: 3,
  acceleratingThreshold: 0.20,
  churningThreshold: -0.30,
  stableThreshold: 0.10,
  maxResults: 50,
};

export const readCLVTrajConfig = (settings: any): CLVTrajectoryConfig => ({
  aiEnabled: settings?.clvtraj_ai_enabled ?? true,
  minOrders: safeNumber(settings?.clvtraj_min_orders, 3),
  acceleratingThreshold: safeNumber(settings?.clvtraj_accelerating_threshold, 0.20),
  churningThreshold: safeNumber(settings?.clvtraj_churning_threshold, -0.30),
  stableThreshold: safeNumber(settings?.clvtraj_stable_threshold, 0.10),
  maxResults: safeNumber(settings?.clvtraj_max_results, 50),
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const formatCurrency = (n: number): string => `$${(n || 0).toFixed(2)}`;

const classifyTrajectory = (
  slopePct: number,
  cfg: CLVTrajectoryConfig
): TrajectoryType => {
  if (slopePct > cfg.acceleratingThreshold) return 'accelerating';
  if (slopePct > cfg.stableThreshold) return 'growing';
  if (Math.abs(slopePct) <= cfg.stableThreshold) return 'stable';
  if (slopePct > cfg.churningThreshold) return 'declining';
  return 'churning';
};

// Linear regression slope using 3 data points (30d, 60d, 90d windows)
// x = month index (0=current, 1=last month, 2=two months ago)
// We want slope of CLV over time, so reverse x: 2=oldest, 0=newest
const computeSlope = (clv30d: number, clv60d: number, clv90d: number): {
  slopePerMonth: number;
  slopePct: number;
} => {
  // Each window is 30 days = 1 month
  // x: 0 = 61-90d ago (oldest), 1 = 31-60d ago, 2 = 0-30d (current)
  // y: clv90d, clv60d, clv30d
  const xs = [0, 1, 2];
  const ys = [clv90d, clv60d, clv30d];
  const n = 3;
  const sumX = xs.reduce((a, b) => a + b, 0);
  const sumY = ys.reduce((a, b) => a + b, 0);
  const sumXY = xs.reduce((s, x, i) => s + x * ys[i], 0);
  const sumXX = xs.reduce((s, x) => s + x * x, 0);
  const denom = n * sumXX - sumX * sumX;
  const slopePerMonth = denom !== 0 ? (n * sumXY - sumX * sumY) / denom : 0;
  // Slope as % of current CLV (per month)
  const avgClv = (clv30d + clv60d + clv90d) / 3;
  const slopePct = avgClv > 0 ? slopePerMonth / avgClv : 0;
  return { slopePerMonth, slopePct };
};

// ---------------------------------------------------------------------------
// Data fetching
// ---------------------------------------------------------------------------

interface CustomerWindowData {
  customerId: string;
  customerName: string;
  total30d: number; orders30d: number;
  total60d: number; orders60d: number;
  total90d: number; orders90d: number;
}

const fetchCustomerWindows = async (db: any, cfg: CLVTrajectoryConfig): Promise<CustomerWindowData[]> => {
  try {
    // Get customer totals in 3 windows
    const result = await db.query(
      `SELECT
         customer.id AS cid,
         customer.name AS cname,
         math::sum(IF created_at > time::now() - 30d THEN total ELSE 0 END) AS total30d,
         math::count(IF created_at > time::now() - 30d THEN 1 ELSE NONE END) AS orders30d,
         math::sum(IF created_at > time::now() - 60d AND created_at < time::now() - 30d THEN total ELSE 0 END) AS total60d,
         math::count(IF created_at > time::now() - 60d AND created_at < time::now() - 30d THEN 1 ELSE NONE END) AS orders60d,
         math::sum(IF created_at > time::now() - 90d AND created_at < time::now() - 60d THEN total ELSE 0 END) AS total90d,
         math::count(IF created_at > time::now() - 90d AND created_at < time::now() - 60d THEN 1 ELSE NONE END) AS orders90d
       FROM order
       WHERE status = 'Paid'
         AND deleted_at IS NONE
         AND customer IS NOT NONE
         AND created_at > time::now() - 90d
       GROUP BY customer
       FETCH customer`
    );
    const rows = Array.isArray(result) ? result.flat() : [];
    return rows
      .map((r: any) => ({
        customerId: r.cid?.toString?.() ?? '',
        customerName: r.cname ?? 'Unknown',
        total30d: safeNumber(r.total30d, 0),
        orders30d: safeNumber(r.orders30d, 0),
        total60d: safeNumber(r.total60d, 0),
        orders60d: safeNumber(r.orders60d, 0),
        total90d: safeNumber(r.total90d, 0),
        orders90d: safeNumber(r.orders90d, 0),
      }))
      .filter((c: CustomerWindowData) =>
        (c.orders30d + c.orders60d + c.orders90d) >= cfg.minOrders
      );
  } catch (err) {
    console.warn('[clvtraj] fetchCustomerWindows failed', err);
    return [];
  }
};

// ---------------------------------------------------------------------------
// AI enhancement
// ---------------------------------------------------------------------------

const enhanceWithAI = async (
  trajectories: CLVTrajectory[],
  _cfg: CLVTrajectoryConfig
): Promise<void> => {
  const { callOpenAIChat } = await import('@/lib/openai.service.ts').catch(() => ({} as any));
  if (!callOpenAIChat || trajectories.length === 0) return;

  // Only enhance non-stable trajectories (actionable)
  const actionable = trajectories.filter(t => t.trajectory !== 'stable').slice(0, 15);
  if (actionable.length === 0) return;

  const prompt = `You are a restaurant customer success strategist.
For each customer trajectory below, provide:
  - insight: max 200 chars — what's happening with this customer + why it matters
  - intervention: one of nurture | upsell | retain | investigate | reward

Intervention guidance:
  - reward: accelerating trajectory — recognize + retain high-value growth
  - upsell: growing trajectory — increase share of wallet with cross-sells
  - nurture: stable but low value — encourage more frequent visits
  - retain: declining trajectory — intervene before they churn
  - investigate: churning trajectory — find root cause, last-chance save

Trajectories (JSON):
${JSON.stringify(actionable.map(t => ({
  name: t.customer_name,
  current_clv: t.current_clv,
  clv_30d: t.clv_30d,
  clv_60d: t.clv_31_60d,
  clv_90d: t.clv_61_90d,
  slope_per_month: t.slope_per_month,
  trajectory: t.trajectory,
  projected_clv_90d: t.projected_clv_90d,
  projected_change_pct: t.projected_change_pct,
  visit_freq_change: t.visit_frequency_change_pct,
  avg_check_change: t.avg_check_change_pct,
})), null, 2)}

Respond with JSON array:
[{
  "name": "<match customer_name>",
  "insight": "<max 200 chars>",
  "intervention": "nurture" | "upsell" | "retain" | "investigate" | "reward"
}]`;

  try {
    const response = await callOpenAIChat([
      { role: 'system', content: 'You are a CLV trajectory AI. Respond only with valid JSON.' },
      { role: 'user', content: prompt },
    ], { temperature: 0.4, maxTokens: 1500 });

    const text = typeof response === 'string' ? response : (response as any)?.content ?? '';
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return;
    const parsed = JSON.parse(jsonMatch[0]) as Array<{
      name: string; insight?: string; intervention?: CLVIntervention;
    }>;
    for (const item of parsed) {
      const traj = trajectories.find(t => t.customer_name === item.name);
      if (traj) {
        if (item.insight) traj.ai_insight = item.insight.slice(0, 200);
        if (item.intervention) traj.ai_intervention = item.intervention;
      }
    }
  } catch (err) { console.warn('[clvtraj] AI failed', err); }
};

// ---------------------------------------------------------------------------
// Main entry
// ---------------------------------------------------------------------------

export const runCLVTrajectoryAnalysis = async (
  db: ReturnType<typeof useDB>,
  config: CLVTrajectoryConfig = DEFAULT_CLVTRAJ_CONFIG,
  onProgress?: (current: number, total: number) => void
): Promise<{ trajectories: CLVTrajectory[]; analyzed: number }> => {
  if (onProgress) onProgress(0, 2);

  // 1. Fetch customer window data
  const customers = await fetchCustomerWindows(db, config);
  if (onProgress) onProgress(1, 2);

  if (customers.length === 0) {
    if (onProgress) onProgress(2, 2);
    return { trajectories: [], analyzed: 0 };
  }

  // 2. Compute trajectory for each customer
  const trajectories: CLVTrajectory[] = [];
  for (const c of customers) {
    const currentCLV = c.total30d + c.total60d + c.total90d;
    const { slopePerMonth, slopePct } = computeSlope(c.total30d, c.total60d, c.total90d);
    const trajectory = classifyTrajectory(slopePct, config);

    // Projected CLV next 90d = current 90d + slope × 3 months
    const projectedCLV90d = Math.max(0, currentCLV + slopePerMonth * 3);
    const projectedChangePct = currentCLV > 0 ? ((projectedCLV90d - currentCLV) / currentCLV) * 100 : 0;

    // Visit frequency change (30d vs 60d)
    const visitFreqChange = c.orders60d > 0
      ? ((c.orders30d - c.orders60d) / c.orders60d) * 100
      : 0;

    // Avg check change (30d vs 60d)
    const avgCheck30d = c.orders30d > 0 ? c.total30d / c.orders30d : 0;
    const avgCheck60d = c.orders60d > 0 ? c.total60d / c.orders60d : 0;
    const avgCheckChange = avgCheck60d > 0 ? ((avgCheck30d - avgCheck60d) / avgCheck60d) * 100 : 0;

    trajectories.push({
      customer: c.customerId,
      customer_name: c.customerName,
      current_clv: Math.round(currentCLV * 100) / 100,
      clv_30d: Math.round(c.total30d * 100) / 100,
      clv_31_60d: Math.round(c.total60d * 100) / 100,
      clv_61_90d: Math.round(c.total90d * 100) / 100,
      slope_per_month: Math.round(slopePerMonth * 100) / 100,
      trajectory,
      projected_clv_90d: Math.round(projectedCLV90d * 100) / 100,
      projected_change_pct: Math.round(projectedChangePct * 10) / 10,
      visit_frequency_change_pct: Math.round(visitFreqChange * 10) / 10,
      avg_check_change_pct: Math.round(avgCheckChange * 10) / 10,
      data_points: c.orders30d + c.orders60d + c.orders90d,
      action_taken: 'none',
      analyzed_at: new Date(),
    });
  }

  // Sort: churning first (urgent), then declining, then accelerating (opportunity), then growing, then stable
  const trajOrder = { churning: 0, declining: 1, accelerating: 2, growing: 3, stable: 4 };
  trajectories.sort((a, b) => {
    const orderDiff = (trajOrder[a.trajectory] ?? 5) - (trajOrder[b.trajectory] ?? 5);
    if (orderDiff !== 0) return orderDiff;
    return Math.abs(b.slope_per_month) - Math.abs(a.slope_per_month);
  });

  // Cap results
  const capped = trajectories.slice(0, config.maxResults);

  // 3. AI enhancement
  if (config.aiEnabled && capped.length > 0) {
    await enhanceWithAI(capped, config);
  }

  // 4. Persist (refresh)
  try {
    await db.query(`DELETE FROM clv_trajectory WHERE analyzed_at < time::now() - 1h`);
  } catch { /* non-fatal */ }
  for (const traj of capped) {
    try {
      await db.query(`CREATE clv_trajectory CONTENT $data`, {
        data: { ...traj, analyzed_at: traj.analyzed_at.toISOString() },
      });
    } catch { /* non-fatal */ }
  }

  if (onProgress) onProgress(2, 2);
  return { trajectories: capped, analyzed: customers.length };
};

// ---------------------------------------------------------------------------
// Read + summary
// ---------------------------------------------------------------------------

export const getActiveTrajectories = async (
  db: ReturnType<typeof useDB>
): Promise<CLVTrajectory[]> => {
  try {
    const result = await db.query(
      `SELECT * FROM clv_trajectory
       WHERE action_taken = 'none'
         AND trajectory != 'stable'
       ORDER BY
         CASE trajectory WHEN 'churning' THEN 0 WHEN 'declining' THEN 1 WHEN 'accelerating' THEN 2 WHEN 'growing' THEN 3 ELSE 4 END,
         ABS(slope_per_month) DESC`
    );
    return Array.isArray(result) ? result.flat() : [];
  } catch { return []; }
};

export interface CLVTrajectorySummary {
  total: number;
  accelerating: number;
  growing: number;
  stable: number;
  declining: number;
  churning: number;
  totalProjectedChange: number;
}

export const getCLVTrajectorySummary = async (
  db: ReturnType<typeof useDB>
): Promise<CLVTrajectorySummary> => {
  try {
    const result = await db.query(
      `SELECT count() AS total,
         math::count(trajectory = 'accelerating') AS accelerating,
         math::count(trajectory = 'growing') AS growing,
         math::count(trajectory = 'stable') AS stable,
         math::count(trajectory = 'declining') AS declining,
         math::count(trajectory = 'churning') AS churning,
         math::sum(projected_clv_90d - current_clv) AS total_change
       FROM clv_trajectory GROUP ALL`
    );
    const rows = Array.isArray(result) ? result.flat() : [];
    const row = rows[0] ?? {};
    return {
      total: safeNumber(row.total, 0),
      accelerating: safeNumber(row.accelerating, 0),
      growing: safeNumber(row.growing, 0),
      stable: safeNumber(row.stable, 0),
      declining: safeNumber(row.declining, 0),
      churning: safeNumber(row.churning, 0),
      totalProjectedChange: safeNumber(row.total_change, 0),
    };
  } catch {
    return { total: 0, accelerating: 0, growing: 0, stable: 0, declining: 0, churning: 0, totalProjectedChange: 0 };
  }
};

export const updateCLVTrajectoryAction = async (
  db: ReturnType<typeof useDB>, trajectoryId: string, action: string
): Promise<void> => {
  await db.query(`UPDATE $id SET action_taken = $action`, { id: trajectoryId, action });
};
