/**
 * AI Branch Performance Comparison service — multi-location benchmarking.
 *
 * 27th POSR-exclusive differentiator — Toast Multi-Location $150+/mo, Square
 * Multi-Store in Plus. POSR offers it free — compares all branches across
 * revenue, growth, efficiency, satisfaction, labor cost + AI identifies top
 * performer, underperformer, and actionable insights.
 *
 * Distinct from:
 *   - anomaly-detection.service (detects anomalies, doesn't compare branches)
 *   - revpash.service (analyzes seat efficiency, single location)
 *   - revenue-forecast.service (forecasts revenue, doesn't compare branches)
 *
 * This service COMPARES branches against each other — finds best/worst,
 * identifies what top performers do differently + AI recommendations.
 */

import { useDB } from '@/api/db/db.ts';
import { safeNumber } from '@/lib/utils.ts';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type BranchRecommendation =
  | 'replicate_practices' | 'investigate_decline' | 'share_best_practice'
  | 'resource_reallocation' | 'maintain_position' | 'urgent_intervention';

export interface BranchComparison {
  id?: string;
  branch_id?: string;
  branch_name: string;
  total_revenue: number;
  revenue_growth_pct: number;
  avg_order_value: number;
  order_count: number;
  customer_count: number;
  avg_customer_rating: number;
  labor_cost_pct: number;
  food_cost_pct: number;
  waste_pct: number;
  turnover_rate: number;
  overall_score: number;
  rank: number;
  total_branches: number;
  percentile: number;
  ai_insight?: string;
  ai_recommendation?: BranchRecommendation;
  analyzed_at: Date;
}

export interface BranchComparisonConfig {
  aiEnabled: boolean;
  lookbackDays: number;
  prevDays: number;
}

export const DEFAULT_BRANCH_COMP_CONFIG: BranchComparisonConfig = {
  aiEnabled: true,
  lookbackDays: 30,
  prevDays: 30,
};

export const readBranchCompConfig = (settings: any): BranchComparisonConfig => ({
  aiEnabled: settings?.branch_comp_ai_enabled ?? true,
  lookbackDays: safeNumber(settings?.branch_comp_lookback_days, 30),
  prevDays: safeNumber(settings?.branch_comp_prev_days, 30),
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const formatCurrency = (n: number): string => `$${(n || 0).toFixed(2)}`;

// ---------------------------------------------------------------------------
// Data fetching
// ---------------------------------------------------------------------------

interface BranchData {
  branchId: string;
  branchName: string;
  totalRevenue: number;
  prevRevenue: number;
  orderCount: number;
  customerCount: number;
  avgRating: number;
  laborCost: number;
  foodCost: number;
  wasteCost: number;
  tableTurns: number;
  openDays: number;
}

const fetchBranchData = async (db: any, cfg: BranchComparisonConfig): Promise<BranchData[]> => {
  try {
    // Get all branches (inventory_store)
    const branchResult = await db.query(
      `SELECT id, name FROM inventory_store WHERE deleted_at IS NONE`
    );
    const branches = Array.isArray(branchResult) ? branchResult.flat() : [];
    if (branches.length === 0) return [];

    const result: BranchData[] = [];

    for (const branch of branches) {
      const branchId = branch.id?.toString?.() ?? '';
      const branchName = branch.name ?? 'Unknown Branch';

      // Current period revenue + orders
      const currentResult = await db.query(
        `SELECT
           math::sum(total) AS revenue,
           count() AS order_count,
           math::count(DISTINCT customer) AS customer_count,
           math::sum(tip_amount) AS tip_total
         FROM order
         WHERE status = 'Paid' AND deleted_at IS NONE
           AND branch_id = $bid
           AND created_at > time::now() - ${cfg.lookbackDays}d`,
        { bid: branchId }
      );
      const currentRows = Array.isArray(currentResult) ? currentResult.flat() : [];
      const curr = currentRows[0] ?? {};

      // Previous period revenue (for growth calc)
      const prevResult = await db.query(
        `SELECT math::sum(total) AS prev_revenue
         FROM order
         WHERE status = 'Paid' AND deleted_at IS NONE
           AND branch_id = $bid
           AND created_at > time::now() - ${cfg.lookbackDays + cfg.prevDays}d
           AND created_at < time::now() - ${cfg.lookbackDays}d`,
        { bid: branchId }
      );
      const prevRows = Array.isArray(prevResult) ? prevResult.flat() : [];
      const prevRev = safeNumber(prevRows[0]?.prev_revenue, 0);

      // Customer rating (from customer_review)
      const ratingResult = await db.query(
        `SELECT math::mean(rating) AS avg_rating
         FROM customer_review
         WHERE created_at > time::now() - ${cfg.lookbackDays}d
           AND order.branch_id = $bid`,
        { bid: branchId }
      );
      const ratingRows = Array.isArray(ratingResult) ? ratingResult.flat() : [];

      // Labor cost (from payroll or scheduled_shift cost)
      const laborResult = await db.query(
        `SELECT math::sum(total_cost) AS labor_cost
         FROM payroll_snapshot
         WHERE branch_id = $bid
           AND created_at > time::now() - ${cfg.lookbackDays}d`,
        { bid: branchId }
      );
      const laborRows = Array.isArray(laborResult) ? laborResult.flat() : [];

      // Food cost (from inventory ledger)
      const foodResult = await db.query(
        `SELECT math::sum(total_cost) AS food_cost
         FROM inventory_ledger
         WHERE reference_type = 'issue'
           AND created_at > time::now() - ${cfg.lookbackDays}d
           AND store = $bid`,
        { bid: branchId }
      );
      const foodRows = Array.isArray(foodResult) ? foodResult.flat() : [];

      // Waste cost
      const wasteResult = await db.query(
        `SELECT math::sum(quantity * price) AS waste_cost
         FROM inventory_item_waste_item
         WHERE created_at > time::now() - ${cfg.lookbackDays}d
           AND store = $bid`
      );
      const wasteRows = Array.isArray(wasteResult) ? wasteResult.flat() : [];

      // Table turns (orders with tables / open days)
      const turnResult = await db.query(
        `SELECT count() AS table_orders
         FROM order
         WHERE status = 'Paid' AND deleted_at IS NONE
           AND branch_id = $bid
           AND \`table\` IS NOT NONE
           AND created_at > time::now() - ${cfg.lookbackDays}d`
      );
      const turnRows = Array.isArray(turnResult) ? turnResult.flat() : [];
      const tableOrders = safeNumber(turnRows[0]?.table_orders, 0);

      result.push({
        branchId,
        branchName,
        totalRevenue: safeNumber(curr.revenue, 0),
        prevRevenue: prevRev,
        orderCount: safeNumber(curr.order_count, 0),
        customerCount: safeNumber(curr.customer_count, 0),
        avgRating: safeNumber(ratingRows[0]?.avg_rating, 0),
        laborCost: safeNumber(laborRows[0]?.labor_cost, 0),
        foodCost: safeNumber(foodRows[0]?.food_cost, 0),
        wasteCost: safeNumber(wasteRows[0]?.waste_cost, 0),
        tableTurns: tableOrders,
        openDays: cfg.lookbackDays,
      });
    }

    return result;
  } catch (err) {
    console.warn('[branch-comp] fetchBranchData failed', err);
    return [];
  }
};

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

const scoreBranch = (branch: BranchData, allBranches: BranchData[]): number => {
  if (allBranches.length === 0) return 0;

  // Normalize each metric to 0-1 relative to max across branches
  const maxRevenue = Math.max(...allBranches.map(b => b.totalRevenue), 1);
  const maxGrowth = Math.max(...allBranches.map(b => {
    return b.prevRevenue > 0 ? ((b.totalRevenue - b.prevRevenue) / b.prevRevenue) : 0;
  }), 0.01);
  const maxAOV = Math.max(...allBranches.map(b => b.orderCount > 0 ? b.totalRevenue / b.orderCount : 0), 1);
  const maxRating = Math.max(...allBranches.map(b => b.avgRating), 5);
  const maxTurnover = Math.max(...allBranches.map(b => b.openDays > 0 ? b.tableTurns / b.openDays : 0), 1);

  // Revenue (25%)
  const revScore = branch.totalRevenue / maxRevenue;

  // Growth (20%)
  const growth = branch.prevRevenue > 0
    ? (branch.totalRevenue - branch.prevRevenue) / branch.prevRevenue
    : 0;
  const growthScore = Math.max(0, Math.min(1, growth / maxGrowth));

  // AOV (15%)
  const aov = branch.orderCount > 0 ? branch.totalRevenue / branch.orderCount : 0;
  const aovScore = aov / maxAOV;

  // Satisfaction (15%)
  const satScore = branch.avgRating > 0 ? branch.avgRating / maxRating : 0.5;

  // Efficiency — table turns (15%)
  const turnover = branch.openDays > 0 ? branch.tableTurns / branch.openDays : 0;
  const effScore = turnover / maxTurnover;

  // Cost control (10%) — lower costs = better
  const laborPct = branch.totalRevenue > 0 ? branch.laborCost / branch.totalRevenue : 1;
  const foodPct = branch.totalRevenue > 0 ? branch.foodCost / branch.totalRevenue : 1;
  const wastePct = branch.totalRevenue > 0 ? branch.wasteCost / branch.totalRevenue : 1;
  // Invert: lower cost % = higher score (cap at 0.35 labor, 0.40 food, 0.05 waste)
  const laborScore = Math.max(0, 1 - laborPct / 0.35);
  const foodScore = Math.max(0, 1 - foodPct / 0.40);
  const wasteScore = Math.max(0, 1 - wastePct / 0.05);
  const costScore = (laborScore + foodScore + wasteScore) / 3;

  const overall = revScore * 0.25 + growthScore * 0.20 + aovScore * 0.15 +
    satScore * 0.15 + effScore * 0.15 + costScore * 0.10;

  return Math.round(overall * 100);
};

// ---------------------------------------------------------------------------
// AI enhancement
// ---------------------------------------------------------------------------

const enhanceWithAI = async (comparisons: BranchComparison[]): Promise<void> => {
  const { callOpenAIChat } = await import('@/lib/openai.service.ts').catch(() => ({} as any));
  if (!callOpenAIChat || comparisons.length < 2) return;

  const top = comparisons[0]; // rank 1
  const bottom = comparisons[comparisons.length - 1]; // last rank

  const prompt = `You are a multi-location restaurant performance analyst.
Analyze these branch comparison results and provide per-branch insight + recommendation.

Branches (JSON):
${JSON.stringify(comparisons.map(c => ({
  name: c.branch_name,
  rank: c.rank,
  revenue: c.total_revenue,
  growth_pct: c.revenue_growth_pct,
  avg_order: c.avg_order_value,
  orders: c.order_count,
  customers: c.customer_count,
  rating: c.avg_customer_rating,
  labor_pct: c.labor_cost_pct,
  food_pct: c.food_cost_pct,
  waste_pct: c.waste_pct,
  turnover: c.turnover_rate,
  score: c.overall_score,
})), null, 2)}

For each branch, provide:
  - insight: max 200 chars — what stands out about this branch (strengths/weaknesses)
  - recommendation: one of replicate_practices | investigate_decline | share_best_practice | resource_reallocation | maintain_position | urgent_intervention

Guidance:
  - replicate_practices: top performer — document what they do well for other branches
  - share_best_practice: rank 2-3, doing well — share with underperformers
  - maintain_position: mid-pack, stable — keep doing what works
  - investigate_decline: negative growth — find why revenue dropped
  - resource_reallocation: underperforming — reallocate budget/staff from top
  - urgent_intervention: bottom rank with declining revenue — immediate action needed

Respond with JSON array:
[{
  "name": "<match branch_name>",
  "insight": "<max 200 chars>",
  "recommendation": "replicate_practices" | "investigate_decline" | "share_best_practice" | "resource_reallocation" | "maintain_position" | "urgent_intervention"
}]`;

  try {
    const response = await callOpenAIChat([
      { role: 'system', content: 'You are a multi-location restaurant performance AI. Respond only with valid JSON.' },
      { role: 'user', content: prompt },
    ], { temperature: 0.4, maxTokens: 1200 });

    const text = typeof response === 'string' ? response : (response as any)?.content ?? '';
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return;
    const parsed = JSON.parse(jsonMatch[0]) as Array<{
      name: string; insight?: string; recommendation?: BranchRecommendation;
    }>;
    for (const item of parsed) {
      const comp = comparisons.find(c => c.branch_name === item.name);
      if (comp) {
        if (item.insight) comp.ai_insight = item.insight.slice(0, 200);
        if (item.recommendation) comp.ai_recommendation = item.recommendation;
      }
    }
  } catch (err) { console.warn('[branch-comp] AI failed', err); }
};

// ---------------------------------------------------------------------------
// Main entry
// ---------------------------------------------------------------------------

export const runBranchComparison = async (
  db: ReturnType<typeof useDB>,
  config: BranchComparisonConfig = DEFAULT_BRANCH_COMP_CONFIG,
  onProgress?: (current: number, total: number) => void
): Promise<{ comparisons: BranchComparison[]; analyzed: number }> => {
  if (onProgress) onProgress(0, 2);

  const branches = await fetchBranchData(db, config);
  if (onProgress) onProgress(1, 2);

  if (branches.length === 0) {
    if (onProgress) onProgress(2, 2);
    return { comparisons: [], analyzed: 0 };
  }

  // Score each branch
  const scored = branches.map(b => {
    const score = scoreBranch(b, branches);
    const growthPct = b.prevRevenue > 0
      ? ((b.totalRevenue - b.prevRevenue) / b.prevRevenue) * 100
      : 0;
    const aov = b.orderCount > 0 ? b.totalRevenue / b.orderCount : 0;
    const laborPct = b.totalRevenue > 0 ? (b.laborCost / b.totalRevenue) * 100 : 0;
    const foodPct = b.totalRevenue > 0 ? (b.foodCost / b.totalRevenue) * 100 : 0;
    const wastePct = b.totalRevenue > 0 ? (b.wasteCost / b.totalRevenue) * 100 : 0;
    const turnover = b.openDays > 0 ? b.tableTurns / b.openDays : 0;
    return {
      branch_id: b.branchId,
      branch_name: b.branchName,
      total_revenue: Math.round(b.totalRevenue * 100) / 100,
      revenue_growth_pct: Math.round(growthPct * 10) / 10,
      avg_order_value: Math.round(aov * 100) / 100,
      order_count: b.orderCount,
      customer_count: b.customerCount,
      avg_customer_rating: Math.round(b.avgRating * 10) / 10,
      labor_cost_pct: Math.round(laborPct * 10) / 10,
      food_cost_pct: Math.round(foodPct * 10) / 10,
      waste_pct: Math.round(wastePct * 10) / 10,
      turnover_rate: Math.round(turnover * 100) / 100,
      overall_score: score,
      analyzed_at: new Date(),
    };
  });

  // Sort by score descending
  scored.sort((a, b) => b.overall_score - a.overall_score);

  // Assign rank + percentile
  const totalBranches = scored.length;
  const comparisons: BranchComparison[] = scored.map((s, i) => ({
    ...s,
    rank: i + 1,
    total_branches: totalBranches,
    percentile: totalBranches > 1 ? 1 - (i / (totalBranches - 1)) : 1,
  }));

  // AI enhancement
  if (config.aiEnabled && comparisons.length > 0) {
    await enhanceWithAI(comparisons);
  }

  // Persist (refresh)
  try {
    await db.query(`DELETE FROM branch_comparison WHERE analyzed_at < time::now() - 1h`);
  } catch { /* non-fatal */ }
  for (const comp of comparisons) {
    try {
      await db.query(`CREATE branch_comparison CONTENT $data`, {
        data: { ...comp, analyzed_at: comp.analyzed_at.toISOString() },
      });
    } catch { /* non-fatal */ }
  }

  if (onProgress) onProgress(2, 2);
  return { comparisons, analyzed: branches.length };
};

// ---------------------------------------------------------------------------
// Read + summary
// ---------------------------------------------------------------------------

export const getBranchComparisons = async (db: ReturnType<typeof useDB>): Promise<BranchComparison[]> => {
  try {
    const result = await db.query(
      `SELECT * FROM branch_comparison
       WHERE analyzed_at > time::now() - 24h
       ORDER BY rank ASC`
    );
    return Array.isArray(result) ? result.flat() : [];
  } catch { return []; }
};

export interface BranchCompSummary {
  totalBranches: number;
  topPerformer?: string;
  topScore: number;
  underperformer?: string;
  underperformerScore: number;
  avgScore: number;
  totalRevenue: number;
}

export const getBranchCompSummary = async (db: ReturnType<typeof useDB>): Promise<BranchCompSummary> => {
  try {
    const result = await db.query(
      `SELECT count() AS total,
         math::max(overall_score) AS top_score,
         math::min(overall_score) AS low_score,
         math::mean(overall_score) AS avg_score,
         math::sum(total_revenue) AS total_rev
       FROM branch_comparison
       WHERE analyzed_at > time::now() - 24h
       GROUP ALL`
    );
    const rows = Array.isArray(result) ? result.flat() : [];
    const row = rows[0] ?? {};

    // Get top + bottom names
    const topResult = await db.query(
      `SELECT branch_name FROM branch_comparison
       WHERE analyzed_at > time::now() - 24h
       ORDER BY overall_score DESC LIMIT 1`
    );
    const topRows = Array.isArray(topResult) ? topResult.flat() : [];

    const bottomResult = await db.query(
      `SELECT branch_name FROM branch_comparison
       WHERE analyzed_at > time::now() - 24h
       ORDER BY overall_score ASC LIMIT 1`
    );
    const bottomRows = Array.isArray(bottomResult) ? bottomResult.flat() : [];

    return {
      totalBranches: safeNumber(row.total, 0),
      topPerformer: topRows[0]?.branch_name,
      topScore: safeNumber(row.top_score, 0),
      underperformer: bottomRows[0]?.branch_name,
      underperformerScore: safeNumber(row.low_score, 0),
      avgScore: safeNumber(row.avg_score, 0),
      totalRevenue: safeNumber(row.total_rev, 0),
    };
  } catch {
    return { totalBranches: 0, topScore: 0, underperformerScore: 0, avgScore: 0, totalRevenue: 0 };
  }
};
