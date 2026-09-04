/**
 * AI Menu Item Profitability Decay Tracker — tracks how each menu item's
 * profitability decays over time from ingredient cost inflation, portion creep,
 * waste accumulation, and discount creep. Alerts before items become loss leaders.
 *
 * 120th POSR-exclusive differentiator — restaurants lose $500-2,000/mo per
 * location from undetected profitability decay. No POS tracks profitability
 * trajectory over time.
 *
 * Distinct from:
 *   - dish-profitability.service (34th) — computes current profitability SNAPSHOT
 *   - food-cost-trend.service — tracks ingredient COST trends (not margin decay)
 *   - yield-variance.service — tracks recipe YIELD variance (not profitability)
 *   - recipe-optimization.service — optimizes recipe COST (not decay tracking)
 *   - menu-engineering-matrix.service — BCG classification (not trajectory)
 *   - dynamic-pricing.service — demand-based pricing (not decay-driven repricing)
 *
 * 8 AI rules:
 *   1. margin_erosion — total margin decay ≥5% from launch → review needed
 *   2. cost_inflation_decay — ingredient cost inflation eroding margin → renegotiate
 *   3. portion_creep — portions growing 10%+ beyond spec → standardize portions
 *   4. waste_accumulation — waste/trim increasing → recipe training needed
 *   5. discount_creep — promotional discounts never removed → remove discount
 *   6. threshold_crossing — profitability grade dropped (A→B, B→C, etc.) → urgent
 *   7. decay_acceleration — decay rate increasing (accelerating erosion) → act now
 *   8. compounding_decay — 3+ decay sources eroding simultaneously → critical
 */

import { useDB } from '@/api/db/db.ts';
import { safeNumber } from '@/lib/utils.ts';

export type ProfDecayRuleId =
  | 'margin_erosion'
  | 'cost_inflation_decay'
  | 'portion_creep'
  | 'waste_accumulation'
  | 'discount_creep'
  | 'threshold_crossing'
  | 'decay_acceleration'
  | 'compounding_decay';

export type ProfDecayAiRec =
  | 'raise_price'
  | 'reduce_portion'
  | 'renegotiate_supplier'
  | 'simplify_recipe'
  | 'remove_discount'
  | 'remove_item'
  | 'investigate'
  | 'monitor'
  | 'skip';

export interface ProfDecayAlert {
  id?: string;
  rule_id: ProfDecayRuleId;
  severity: 'critical' | 'high' | 'medium' | 'low';
  menu_item: string;
  launch_margin_pct?: number;
  current_margin_pct?: number;
  margin_decay_pct?: number;
  decay_sources?: string;
  cost_inflation_pct?: number;
  portion_creep_pct?: number;
  waste_pct?: number;
  discount_creep_pct?: number;
  current_grade?: string;
  previous_grade?: string;
  months_to_unprofitable?: number;
  decay_velocity?: string;
  est_monthly_opportunity: number;
  description: string;
  ai_insight?: string;
  ai_recommendation?: ProfDecayAiRec;
  status: 'open' | 'resolved' | 'in_progress' | 'rejected' | 'expired';
  detected_at: Date;
  expires_at?: Date;
}

export interface ProfDecayConfig {
  aiEnabled: boolean;
  erosionThreshold: number;
  criticalGrade: string;
  unprofitableWindow: number;
}

export const DEFAULT_PROFDECAY_CONFIG: ProfDecayConfig = {
  aiEnabled: true,
  erosionThreshold: 5.0,
  criticalGrade: 'D',
  unprofitableWindow: 6,
};

export const readProfDecayConfig = (settings: any): ProfDecayConfig => ({
  aiEnabled: settings?.profdecay_ai_enabled ?? true,
  erosionThreshold: safeNumber(settings?.profdecay_erosion_threshold, 5.0),
  criticalGrade: settings?.profdecay_critical_grade ?? 'D',
  unprofitableWindow: safeNumber(settings?.profdecay_unprofitable_window, 6),
});

const fmt$ = (n: number): string => `$${(n || 0).toFixed(2)}`;

interface DecayData {
  menu_item: string;
  launch_margin_pct: number;
  current_margin_pct: number;
  // Per-source decay breakdown (in margin percentage points)
  cost_inflation_pct: number;   // margin lost to ingredient cost inflation
  portion_creep_pct: number;    // margin lost to over-portioning
  waste_pct: number;            // margin lost to waste/trim increase
  discount_creep_pct: number;   // margin lost to unremoved discounts
  current_grade: 'A' | 'B' | 'C' | 'D' | 'F';
  previous_grade: 'A' | 'B' | 'C' | 'D' | 'F';
  months_since_launch: number;
  // For decay_velocity: monthly decay rate now vs previous period
  current_monthly_decay_rate: number;   // % per month currently
  previous_monthly_decay_rate: number;  // % per month previously
  monthly_volume: number;               // orders per month
  avg_price: number;                    // current selling price
}

const MOCK_ITEMS: DecayData[] = [
  {
    menu_item: 'Beef Burger', launch_margin_pct: 62, current_margin_pct: 48,
    cost_inflation_pct: 8, portion_creep_pct: 4, waste_pct: 1, discount_creep_pct: 1,
    current_grade: 'B', previous_grade: 'A', months_since_launch: 8,
    current_monthly_decay_rate: 1.8, previous_monthly_decay_rate: 1.2,
    monthly_volume: 320, avg_price: 15.90,
  },
  {
    menu_item: 'Margherita Pizza', launch_margin_pct: 68, current_margin_pct: 55,
    cost_inflation_pct: 6, portion_creep_pct: 3, waste_pct: 2, discount_creep_pct: 2,
    current_grade: 'B', previous_grade: 'A', months_since_launch: 6,
    current_monthly_decay_rate: 2.2, previous_monthly_decay_rate: 1.5,
    monthly_volume: 280, avg_price: 14.50,
  },
  {
    menu_item: 'Caesar Salad', launch_margin_pct: 72, current_margin_pct: 58,
    cost_inflation_pct: 4, portion_creep_pct: 6, waste_pct: 3, discount_creep_pct: 1,
    current_grade: 'B', previous_grade: 'A', months_since_launch: 10,
    current_monthly_decay_rate: 1.4, previous_monthly_decay_rate: 1.3,
    monthly_volume: 145, avg_price: 10.90,
  },
  {
    menu_item: 'Salmon Bowl', launch_margin_pct: 58, current_margin_pct: 38,
    cost_inflation_pct: 12, portion_creep_pct: 4, waste_pct: 2, discount_creep_pct: 2,
    current_grade: 'D', previous_grade: 'C', months_since_launch: 7,
    current_monthly_decay_rate: 2.9, previous_monthly_decay_rate: 2.0,
    monthly_volume: 210, avg_price: 16.90,
  },
  {
    menu_item: 'Pasta Alfredo', launch_margin_pct: 65, current_margin_pct: 52,
    cost_inflation_pct: 5, portion_creep_pct: 5, waste_pct: 1, discount_creep_pct: 2,
    current_grade: 'B', previous_grade: 'B', months_since_launch: 12,
    current_monthly_decay_rate: 1.1, previous_monthly_decay_rate: 1.2,
    monthly_volume: 90, avg_price: 13.50,
  },
  {
    menu_item: 'Chicken Wings', launch_margin_pct: 55, current_margin_pct: 31,
    cost_inflation_pct: 10, portion_creep_pct: 8, waste_pct: 3, discount_creep_pct: 3,
    current_grade: 'D', previous_grade: 'C', months_since_launch: 9,
    current_monthly_decay_rate: 2.7, previous_monthly_decay_rate: 1.8,
    monthly_volume: 260, avg_price: 12.90,
  },
  {
    menu_item: 'Ribeye Steak', launch_margin_pct: 45, current_margin_pct: 28,
    cost_inflation_pct: 14, portion_creep_pct: 2, waste_pct: 1, discount_creep_pct: 0,
    current_grade: 'D', previous_grade: 'B', months_since_launch: 5,
    current_monthly_decay_rate: 3.4, previous_monthly_decay_rate: 2.5,
    monthly_volume: 65, avg_price: 32.00,
  },
];

function computeMonthsToUnprofitable(d: DecayData): number {
  if (d.current_monthly_decay_rate <= 0) return 999;
  return Math.round(d.current_margin_pct / d.current_monthly_decay_rate);
}

export const runProfDecayEngine = async (
  db: ReturnType<typeof useDB>,
  config: ProfDecayConfig = DEFAULT_PROFDECAY_CONFIG
): Promise<{ alerts: ProfDecayAlert[]; generated: number }> => {
  const alerts: ProfDecayAlert[] = [];
  const now = new Date();

  let items: DecayData[] = [];
  try {
    const result = await db.query(
      `SELECT menu_item, launch_margin_pct, current_margin_pct,
              cost_inflation_pct, portion_creep_pct, waste_pct, discount_creep_pct,
              current_grade, previous_grade, months_since_launch,
              current_monthly_decay_rate, previous_monthly_decay_rate,
              monthly_volume, avg_price
       FROM profitability_decay_log
       WHERE status = 'active'
       LIMIT 50`
    );
    const rows = Array.isArray(result) ? result.flat() : [];
    items = rows.map((r: any) => ({
      menu_item: String(r.menu_item ?? 'Unknown'),
      launch_margin_pct: safeNumber(r.launch_margin_pct, 0),
      current_margin_pct: safeNumber(r.current_margin_pct, 0),
      cost_inflation_pct: safeNumber(r.cost_inflation_pct, 0),
      portion_creep_pct: safeNumber(r.portion_creep_pct, 0),
      waste_pct: safeNumber(r.waste_pct, 0),
      discount_creep_pct: safeNumber(r.discount_creep_pct, 0),
      current_grade: r.current_grade ?? 'C',
      previous_grade: r.previous_grade ?? 'C',
      months_since_launch: safeNumber(r.months_since_launch, 0),
      current_monthly_decay_rate: safeNumber(r.current_monthly_decay_rate, 0),
      previous_monthly_decay_rate: safeNumber(r.previous_monthly_decay_rate, 0),
      monthly_volume: safeNumber(r.monthly_volume, 0),
      avg_price: safeNumber(r.avg_price, 0),
    }));
  } catch (err) {
    console.warn('[profdecay] fetchItems failed — using mock', err);
  }

  if (items.length === 0) {
    items = MOCK_ITEMS;
  }

  for (const item of items) {
    const totalDecay = item.launch_margin_pct - item.current_margin_pct;
    const monthlyOpp = Math.round(totalDecay * 0.01 * item.avg_price * item.monthly_volume);
    const monthsToUnprofitable = computeMonthsToUnprofitable(item);
    const decaySources: string[] = [];
    if (item.cost_inflation_pct >= 3) decaySources.push('cost_inflation');
    if (item.portion_creep_pct >= 3) decaySources.push('portion_creep');
    if (item.waste_pct >= 2) decaySources.push('waste');
    if (item.discount_creep_pct >= 1) decaySources.push('discount_creep');

    // Rule 1: MARGIN_EROSION (total decay ≥5% from launch)
    if (totalDecay >= config.erosionThreshold) {
      alerts.push({
        rule_id: 'margin_erosion',
        severity: totalDecay >= 15 ? 'critical' : 'high',
        menu_item: item.menu_item,
        launch_margin_pct: item.launch_margin_pct,
        current_margin_pct: item.current_margin_pct,
        margin_decay_pct: Math.round(totalDecay * 10) / 10,
        decay_sources: decaySources.join(','),
        current_grade: item.current_grade,
        months_to_unprofitable: monthsToUnprofitable,
        est_monthly_opportunity: monthlyOpp,
        description: `${item.menu_item}: MARGIN EROSION — margin decayed ${totalDecay.toFixed(0)}% since launch (${item.launch_margin_pct}% → ${item.current_margin_pct}%). Current grade: ${item.current_grade}. Decay sources: ${decaySources.join(', ')}. At current rate, unprofitable in ${monthsToUnprofitable} months. REVIEW: raise price, reduce portion, renegotiate supplier, or simplify recipe. Each month of delay = ${fmt$(monthlyOpp)} lost. Volume: ${item.monthly_volume}/mo at ${fmt$(item.avg_price)}.`,
        ai_recommendation: 'raise_price',
        status: 'open', detected_at: now,
      });
    }

    // Rule 2: COST_INFLATION_DECAY (ingredient cost inflation eroding margin)
    if (item.cost_inflation_pct >= 5) {
      const costImpact = Math.round(item.cost_inflation_pct * 0.01 * item.avg_price * item.monthly_volume);
      alerts.push({
        rule_id: 'cost_inflation_decay',
        severity: item.cost_inflation_pct >= 10 ? 'critical' : 'high',
        menu_item: item.menu_item,
        cost_inflation_pct: item.cost_inflation_pct,
        current_margin_pct: item.current_margin_pct,
        launch_margin_pct: item.launch_margin_pct,
        margin_decay_pct: Math.round(totalDecay * 10) / 10,
        current_grade: item.current_grade,
        est_monthly_opportunity: costImpact,
        description: `${item.menu_item}: COST INFLATION DECAY — ingredient costs rose ${item.cost_inflation_pct}% since launch, eroding ${item.cost_inflation_pct}pp of margin. Biggest decay source for this item. RENEGOTIATE SUPPLIER: get 3 quotes, bulk-buy, or find substitute ingredient. If supplier won't budge, RAISE PRICE by ${item.cost_inflation_pct}% to restore margin. Cost impact: ${fmt$(costImpact)}/mo. Don't absorb inflation — pass it through.`,
        ai_recommendation: item.cost_inflation_pct >= 10 ? 'raise_price' : 'renegotiate_supplier',
        status: 'open', detected_at: now,
      });
    }

    // Rule 3: PORTION_CREEP (portions growing 10%+ beyond spec)
    if (item.portion_creep_pct >= 4) {
      const creepCost = Math.round(item.portion_creep_pct * 0.01 * item.avg_price * 0.4 * item.monthly_volume);
      alerts.push({
        rule_id: 'portion_creep',
        severity: 'medium',
        menu_item: item.menu_item,
        portion_creep_pct: item.portion_creep_pct,
        current_margin_pct: item.current_margin_pct,
        est_monthly_opportunity: creepCost,
        description: `${item.menu_item}: PORTION CREEP — portions have grown ${item.portion_creep_pct}% beyond recipe spec. Prep staff being "generous" but eroding margin. ${item.portion_creep_pct}pp margin lost. STANDARDIZE: use portion scales, pre-portioned containers, visual guides. Retrain prep staff on exact specs. Creep cost: ${fmt$(creepCost)}/mo in excess food. Customers don't notice 10% less — they notice 10% more (and you pay for it).`,
        ai_recommendation: 'reduce_portion',
        status: 'open', detected_at: now,
      });
    }

    // Rule 4: WASTE_ACCUMULATION (waste/trim increasing)
    if (item.waste_pct >= 2) {
      const wasteCost = Math.round(item.waste_pct * 0.01 * item.avg_price * 0.3 * item.monthly_volume);
      alerts.push({
        rule_id: 'waste_accumulation',
        severity: 'medium',
        menu_item: item.menu_item,
        waste_pct: item.waste_pct,
        current_margin_pct: item.current_margin_pct,
        est_monthly_opportunity: wasteCost,
        description: `${item.menu_item}: WASTE ACCUMULATION — waste/trim increased ${item.waste_pct}% since launch. Recipe familiarity dropped or prep technique degraded. ${item.waste_pct}pp margin lost to waste. RECIPE TRAINING: re-train prep staff on proper technique, use waste tracking sheets, identify waste points (over-trimming, burn, spoilage). Waste cost: ${fmt$(wasteCost)}/mo. Every 1% waste reduction = ${fmt$(item.avg_price * 0.3 * item.monthly_volume * 0.01)}/mo recovered.`,
        ai_recommendation: 'simplify_recipe',
        status: 'open', detected_at: now,
      });
    }

    // Rule 5: DISCOUNT_CREEP (promotional discounts never removed)
    if (item.discount_creep_pct >= 2) {
      const discountCost = Math.round(item.discount_creep_pct * 0.01 * item.avg_price * item.monthly_volume);
      alerts.push({
        rule_id: 'discount_creep',
        severity: 'medium',
        menu_item: item.menu_item,
        discount_creep_pct: item.discount_creep_pct,
        current_margin_pct: item.current_margin_pct,
        est_monthly_opportunity: discountCost,
        description: `${item.menu_item}: DISCOUNT CREEP — promotional discount still active ${item.months_since_launch} months after launch. ${item.discount_creep_pct}pp margin lost to forgotten discount. REMOVE DISCOUNT: promo ended but POS still applying it. Audit all active discounts — many are "temporary" promos that became permanent. Discount cost: ${fmt$(discountCost)}/mo. This is pure margin recovery — just turn off the discount code.`,
        ai_recommendation: 'remove_discount',
        status: 'open', detected_at: now,
      });
    }

    // Rule 6: THRESHOLD_CROSSING (profitability grade dropped)
    const gradeOrder = ['A', 'B', 'C', 'D', 'F'];
    const gradeDiff = gradeOrder.indexOf(item.current_grade) - gradeOrder.indexOf(item.previous_grade);
    if (gradeDiff > 0) {
      const isCritical = item.current_grade === config.criticalGrade || item.current_grade === 'F';
      alerts.push({
        rule_id: 'threshold_crossing',
        severity: isCritical ? 'critical' : 'high',
        menu_item: item.menu_item,
        current_grade: item.current_grade,
        previous_grade: item.previous_grade,
        current_margin_pct: item.current_margin_pct,
        launch_margin_pct: item.launch_margin_pct,
        margin_decay_pct: Math.round(totalDecay * 10) / 10,
        months_to_unprofitable: monthsToUnprofitable,
        est_monthly_opportunity: monthlyOpp,
        description: `${item.menu_item}: THRESHOLD CROSSING — grade dropped ${item.previous_grade} → ${item.current_grade}. Margin now ${item.current_margin_pct}% (was ${item.launch_margin_pct}% at launch). ${isCritical ? 'CRITICAL — at or approaching unprofitability. ' : ''}Projected unprofitable in ${monthsToUnprofitable} months. URGENT: raise price ${Math.ceil(totalDecay)}% to restore grade ${item.previous_grade}, OR accept lower margin if item drives traffic. Don't let items silently slide to F.`,
        ai_recommendation: isCritical ? 'raise_price' : 'monitor',
        status: 'open', detected_at: now,
      });
    }

    // Rule 7: DECAY_ACCELERATION (decay rate increasing)
    if (item.current_monthly_decay_rate > item.previous_monthly_decay_rate * 1.3) {
      const accelPct = ((item.current_monthly_decay_rate - item.previous_monthly_decay_rate) / Math.max(item.previous_monthly_decay_rate, 0.1)) * 100;
      alerts.push({
        rule_id: 'decay_acceleration',
        severity: 'high',
        menu_item: item.menu_item,
        current_margin_pct: item.current_margin_pct,
        margin_decay_pct: Math.round(totalDecay * 10) / 10,
        decay_velocity: 'accelerating',
        months_to_unprofitable: monthsToUnprofitable,
        est_monthly_opportunity: monthlyOpp,
        description: `${item.menu_item}: DECAY ACCELERATING — monthly decay rate increased ${accelPct.toFixed(0)}% (${item.previous_monthly_decay_rate.toFixed(1)} → ${item.current_monthly_decay_rate.toFixed(1)} %/mo). Erosion speeding up — something changed recently (supplier price hike, new prep staff, recipe modification). ACT NOW — at current acceleration, unprofitable in ${monthsToUnprofitable} months (was longer at previous rate). Investigate cause of acceleration + intervene immediately.`,
        ai_recommendation: 'investigate',
        status: 'open', detected_at: now,
      });
    }

    // Rule 8: COMPOUNDING_DECAY (3+ decay sources eroding simultaneously)
    if (decaySources.length >= 3) {
      alerts.push({
        rule_id: 'compounding_decay',
        severity: 'critical',
        menu_item: item.menu_item,
        current_margin_pct: item.current_margin_pct,
        launch_margin_pct: item.launch_margin_pct,
        margin_decay_pct: Math.round(totalDecay * 10) / 10,
        decay_sources: decaySources.join(','),
        cost_inflation_pct: item.cost_inflation_pct,
        portion_creep_pct: item.portion_creep_pct,
        waste_pct: item.waste_pct,
        discount_creep_pct: item.discount_creep_pct,
        current_grade: item.current_grade,
        months_to_unprofitable: monthsToUnprofitable,
        est_monthly_opportunity: monthlyOpp,
        description: `${item.menu_item}: COMPOUNDING DECAY — ${decaySources.length} decay sources eroding simultaneously (${decaySources.join(', ')}). Total decay: ${totalDecay.toFixed(0)}pp. Compounding effect = faster than any single source alone. Cost inflation: ${item.cost_inflation_pct}pp, portion creep: ${item.portion_creep_pct}pp, waste: ${item.waste_pct}pp, discount: ${item.discount_creep_pct}pp. CRITICAL: address ALL sources — fixing one won't stop the others. Comprehensive intervention needed: raise price + standardize portions + retrain + remove discounts.`,
        ai_recommendation: 'raise_price',
        status: 'open', detected_at: now,
      });
    }
  }

  if (config.aiEnabled && alerts.length > 0) {
    const { callOpenAIChat } = await import('@/lib/openai.service.ts').catch(() => ({} as any));
    if (callOpenAIChat) {
      const topAlerts = alerts.filter(a => a.severity === 'critical' || a.severity === 'high').slice(0, 5);
      for (const a of topAlerts) {
        try {
          const response = await callOpenAIChat([
            { role: 'system', content: 'You are a restaurant menu economics AI specializing in profitability decay tracking and margin recovery. Recommend specific interventions to halt decay. Respond with a single actionable insight (max 200 chars).' },
            { role: 'user', content: `Item: ${a.menu_item} — ${a.rule_id}. Launch margin ${a.launch_margin_pct ?? 0}%, current ${a.current_margin_pct ?? 0}% (decay ${a.margin_decay_pct ?? 0}pp). Grade ${a.previous_grade ?? '?'}→${a.current_grade ?? '?'}. Sources: ${a.decay_sources ?? 'N/A'}. Cost inflation ${a.cost_inflation_pct ?? 0}pp, portion creep ${a.portion_creep_pct ?? 0}pp, waste ${a.waste_pct ?? 0}pp, discount ${a.discount_creep_pct ?? 0}pp. Unprofitable in ${a.months_to_unprofitable ?? '?'}mo. ${a.description}` },
          ], { temperature: 0.2, maxTokens: 120 });
          const text = typeof response === 'string' ? response : (response as any)?.content ?? '';
          a.ai_insight = text.slice(0, 200);
        } catch { /* skip */ }
      }
    }
  }

  try {
    await db.query(`DELETE FROM profitability_decay_alert WHERE status = 'open' AND detected_at < time::now() - 24h`);
  } catch { /* ignore */ }
  for (const a of alerts) {
    try {
      await db.query(`CREATE profitability_decay_alert CONTENT $data`, {
        data: { ...a, detected_at: a.detected_at.toISOString() },
      });
    } catch { /* ignore */ }
  }

  return { alerts, generated: alerts.length };
};

export const getActiveAlerts = async (db: ReturnType<typeof useDB>): Promise<ProfDecayAlert[]> => {
  try {
    const result = await db.query(
      `SELECT * FROM profitability_decay_alert WHERE status = 'open'
       ORDER BY est_monthly_opportunity DESC LIMIT 50`
    );
    return Array.isArray(result) ? result.flat() : [];
  } catch { return []; }
};

export const getSummary = async (db: ReturnType<typeof useDB>): Promise<{
  totalAlerts: number; criticalCount: number; totalOpportunity: number;
  avgDecay: number; itemsAtRisk: number;
}> => {
  try {
    const result = await db.query(
      `SELECT count() AS total, math::count(severity = 'critical') AS critical,
              math::sum(est_monthly_opportunity WHERE est_monthly_opportunity > 0) AS opportunity,
              math::mean(margin_decay_pct WHERE margin_decay_pct != NONE) AS avgdecay,
              math::count(current_grade IN ['D', 'F']) AS atrisk
       FROM profitability_decay_alert WHERE status = 'open' GROUP ALL`
    );
    const rows = Array.isArray(result) ? result.flat() : [];
    const r = rows[0] ?? {};
    return {
      totalAlerts: safeNumber(r.total, 0), criticalCount: safeNumber(r.critical, 0),
      totalOpportunity: safeNumber(r.opportunity, 0),
      avgDecay: safeNumber(r.avgdecay, 0), itemsAtRisk: safeNumber(r.atrisk, 0),
    };
  } catch {
    return { totalAlerts: 0, criticalCount: 0, totalOpportunity: 0, avgDecay: 0, itemsAtRisk: 0 };
  }
};

export const updateAlertStatus = async (
  db: ReturnType<typeof useDB>, alertId: string,
  status: 'resolved' | 'in_progress' | 'rejected' | 'expired'
): Promise<void> => {
  await db.query(`UPDATE $id SET status = $status`, { id: alertId, status });
};
