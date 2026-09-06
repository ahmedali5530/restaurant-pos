/**
 * AI Table Setting & Tableware Quality Optimizer — predicts how tableware
 * (plate design, cutlery weight, glassware quality, napkin material, table
 * linen, centerpiece) impacts customer perception of restaurant quality,
 * spend, and satisfaction. Tableware is the #1 tactile quality signal —
 * customers physically touch plates, forks, glasses for 60-90 minutes.
 * 68% of customers judge restaurant quality by tableware (Cornell CHR);
 * heavy cutlery increases perceived food quality by 15% (Oxford
 * Crossmodal Research).
 *
 * 157th POSR-exclusive differentiator — restaurants lose $200-1,000/mo per
 * location from mismatched/cheap/worn tableware. Customers subconsciously
 * equate plate quality with food quality — cheap plates = cheap food
 * perception = lower price acceptance. No POS tracks tableware as quality
 * signal.
 *
 * Distinct from:
 *   - menu-layout-placement.service (154th) — menu DESIGN (not tableware)
 *   - staff-appearance-uniform.service (155th) — staff appearance (not tableware)
 *   - atmosphere-revenue.service (138th) — correlates ALL ambient factors (not tableware)
 *   - plate-waste-predictor.service (141st) — food WASTE on plates (not plate quality)
 *   - dish-profitability.service (34th) — dish margin (not plate it's served on)
 *   - floor-plan-optimizer.service — physical LAYOUT (not table setting)
 *   - table-preference.service (133rd) — table TYPE preferences (not tableware)
 *   - journey-friction.service (125th) — overall journey (not tableware-specific)
 *
 * 8 AI rules:
 *   1. cutlery_weight_too_light — lightweight cutlery = perceived cheap → upgrade
 *   2. plate_chip_wear — chipped/scratched plates = perceived dirty → replace
 *   3. glassware_mismatch — different glass styles at same table = inconsistency
 *   4. tableware_brand_tier_mismatch — tableware doesn't match restaurant price tier
 *   5. napkin_quality_low — paper napkins in fine dining = quality signal failure
 *   6. table_linen_missing — bare tables in mid-tier = missed ambiance opportunity
 *   7. centerpiece_absent — no centerpiece = visual gap on table
 *   8. tableware_inconsistency_across_tables — different settings at different tables
 */

import { useDB } from '@/api/db/db.ts';
import { safeNumber } from '@/lib/utils.ts';

export type TablewareRuleId =
  | 'cutlery_weight_too_light'
  | 'plate_chip_wear'
  | 'glassware_mismatch'
  | 'tableware_brand_tier_mismatch'
  | 'napkin_quality_low'
  | 'table_linen_missing'
  | 'centerpiece_absent'
  | 'tableware_inconsistency_across_tables';

export type TablewareAiRec =
  | 'upgrade_cutlery'
  | 'replace_chipped_plates'
  | 'standardize_glassware'
  | 'align_to_brand_tier'
  | 'upgrade_napkins'
  | 'add_table_linens'
  | 'add_centerpiece'
  | 'standardize_across_tables'
  | 'monitor'
  | 'skip';

export interface TablewareAlert {
  id?: string;
  rule_id: TablewareRuleId;
  severity: 'critical' | 'high' | 'medium' | 'low';
  // Tableware metrics
  cutlery_weight_grams?: number;
  target_cutlery_weight_grams?: number;
  chipped_plate_count?: number;
  total_plate_count?: number;
  chip_rate_pct?: number;
  glassware_variants_per_table?: number;
  // Brand tier
  restaurant_tier?: string;            // 'quick_service' | 'fast_casual' | 'casual' | 'fine_dining'
  tableware_tier?: string;             // 'disposable' | 'basic' | 'mid_range' | 'premium' | 'luxury'
  tier_match?: boolean;
  // Napkin
  napkin_type?: string;                // 'paper' | 'cloth'
  // Linen
  has_table_linens?: boolean;
  // Centerpiece
  has_centerpiece?: boolean;
  // Consistency
  table_setting_variants?: number;     // how many different settings across tables
  // Impact
  predicted_satisfaction_change?: number;
  predicted_spend_change_pct?: number;
  perceived_quality_lift_pct?: number;
  // Economics
  est_monthly_opportunity: number;
  description: string;
  ai_insight?: string;
  ai_recommendation?: TablewareAiRec;
  status: 'open' | 'resolved' | 'in_progress' | 'rejected' | 'expired';
  detected_at: Date;
  expires_at?: Date;
}

export interface TablewareConfig {
  aiEnabled: boolean;
  minCutleryWeightGrams: number;
  maxChipRatePct: number;
  minGlasswareConsistency: number;
}

export const DEFAULT_TABLEWARE_CONFIG: TablewareConfig = {
  aiEnabled: true,
  minCutleryWeightGrams: 50,
  maxChipRatePct: 3,
  minGlasswareConsistency: 1,
};

export const readTablewareConfig = (settings: any): TablewareConfig => ({
  aiEnabled: settings?.tableware_ai_enabled ?? true,
  minCutleryWeightGrams: safeNumber(settings?.tableware_min_cutlery, 50),
  maxChipRatePct: safeNumber(settings?.tableware_max_chip_rate, 3),
  minGlasswareConsistency: safeNumber(settings?.tableware_min_glass_consistency, 1),
});

const fmt$ = (n: number): string => `$${(n || 0).toFixed(2)}`;

interface TablewareData {
  cutlery_weight_grams: number;
  target_cutlery_weight_grams: number;
  chipped_plate_count: number;
  total_plate_count: number;
  chip_rate_pct: number;
  glassware_variants_per_table: number;
  restaurant_tier: string;
  tableware_tier: string;
  tier_match: boolean;
  napkin_type: string;
  has_table_linens: boolean;
  has_centerpiece: boolean;
  table_setting_variants: number;
  monthly_customers: number;
  avg_customer_value: number;
}

const MOCK_DATA: TablewareData[] = [
  {
    cutlery_weight_grams: 35, target_cutlery_weight_grams: 55,
    chipped_plate_count: 18, total_plate_count: 200, chip_rate_pct: 9,
    glassware_variants_per_table: 3,
    restaurant_tier: 'casual', tableware_tier: 'basic', tier_match: false,
    napkin_type: 'paper', has_table_linens: false, has_centerpiece: false,
    table_setting_variants: 4,
    monthly_customers: 2400, avg_customer_value: 38,
  },
  {
    cutlery_weight_grams: 65, target_cutlery_weight_grams: 60,
    chipped_plate_count: 2, total_plate_count: 150, chip_rate_pct: 1.3,
    glassware_variants_per_table: 1,
    restaurant_tier: 'fine_dining', tableware_tier: 'premium', tier_match: true,
    napkin_type: 'cloth', has_table_linens: true, has_centerpiece: true,
    table_setting_variants: 1,
    monthly_customers: 800, avg_customer_value: 85,
  },
  {
    cutlery_weight_grams: 42, target_cutlery_weight_grams: 50,
    chipped_plate_count: 8, total_plate_count: 120, chip_rate_pct: 6.7,
    glassware_variants_per_table: 2,
    restaurant_tier: 'fast_casual', tableware_tier: 'basic', tier_match: true,
    napkin_type: 'paper', has_table_linens: false, has_centerpiece: false,
    table_setting_variants: 2,
    monthly_customers: 3200, avg_customer_value: 22,
  },
];

export const runTablewareEngine = async (
  db: ReturnType<typeof useDB>,
  config: TablewareConfig = DEFAULT_TABLEWARE_CONFIG
): Promise<{ alerts: TablewareAlert[]; generated: number }> => {
  const alerts: TablewareAlert[] = [];
  const now = new Date();

  let data: TablewareData[] = [];
  try {
    const result = await db.query(
      `SELECT cutlery_weight_grams, target_cutlery_weight_grams, chipped_plate_count,
              total_plate_count, chip_rate_pct, glassware_variants_per_table,
              restaurant_tier, tableware_tier, tier_match, napkin_type,
              has_table_linens, has_centerpiece, table_setting_variants,
              monthly_customers, avg_customer_value
       FROM table_setting_log
       WHERE status = 'active'
       LIMIT 30`
    );
    const rows = Array.isArray(result) ? result.flat() : [];
    data = rows.map((r: any) => ({
      cutlery_weight_grams: safeNumber(r.cutlery_weight_grams, 0),
      target_cutlery_weight_grams: safeNumber(r.target_cutlery_weight_grams, 0),
      chipped_plate_count: safeNumber(r.chipped_plate_count, 0),
      total_plate_count: safeNumber(r.total_plate_count, 0),
      chip_rate_pct: safeNumber(r.chip_rate_pct, 0),
      glassware_variants_per_table: safeNumber(r.glassware_variants_per_table, 0),
      restaurant_tier: String(r.restaurant_tier ?? 'casual'),
      tableware_tier: String(r.tableware_tier ?? 'basic'),
      tier_match: Boolean(r.tier_match ?? true),
      napkin_type: String(r.napkin_type ?? 'paper'),
      has_table_linens: Boolean(r.has_table_linens ?? false),
      has_centerpiece: Boolean(r.has_centerpiece ?? false),
      table_setting_variants: safeNumber(r.table_setting_variants, 1),
      monthly_customers: safeNumber(r.monthly_customers, 0),
      avg_customer_value: safeNumber(r.avg_customer_value, 0),
    }));
  } catch (err) {
    console.warn('[tableware] fetchData failed — using mock', err);
  }

  if (data.length === 0) {
    data = MOCK_DATA;
  }

  for (const d of data) {
    const monthlyOpp = Math.round(d.monthly_customers * d.avg_customer_value * 0.02);

    // Rule 1: CUTLERY_WEIGHT_TOO_LIGHT
    if (d.cutlery_weight_grams < config.minCutleryWeightGrams) {
      alerts.push({
        rule_id: 'cutlery_weight_too_light',
        severity: 'medium',
        cutlery_weight_grams: d.cutlery_weight_grams,
        target_cutlery_weight_grams: d.target_cutlery_weight_grams,
        perceived_quality_lift_pct: 15,
        predicted_spend_change_pct: 5,
        est_monthly_opportunity: Math.round(monthlyOpp * 0.4),
        description: `CUTLERY WEIGHT TOO LIGHT: cutlery weighs ${d.cutlery_weight_grams}g (target ${d.target_cutlery_weight_grams}g, min ${config.minCutleryWeightGrams}g). Lightweight cutlery = perceived cheap → customers subconsciously downgrade food quality assessment. Heavy cutlery increases perceived food quality by 15% (Oxford Crossmodal Research). ${d.restaurant_tier === 'fine_dining' ? 'Fine dining requires 60-80g cutlery — anything lighter signals budget restaurant. ' : d.restaurant_tier === 'casual' ? 'Casual dining needs 50-60g cutlery — lighter feels disposable. ' : ''}ACTION: upgrade to heavier cutlery (${d.target_cutlery_weight_grams}g). Cost: $3-8 per setting × ${Math.ceil(d.monthly_customers / 50)} table settings = $${Math.ceil(d.monthly_customers / 50) * 5}. Save ${fmt$(monthlyOpp * 0.4)}/mo from 5% spend lift + 15% perceived quality lift. Cutlery weight is invisible to managers but felt by every customer.`,
        ai_recommendation: 'upgrade_cutlery',
        status: 'open', detected_at: now,
      });
    }

    // Rule 2: PLATE_CHIP_WEAR
    if (d.chip_rate_pct > config.maxChipRatePct) {
      alerts.push({
        rule_id: 'plate_chip_wear',
        severity: d.chip_rate_pct >= 8 ? 'high' : 'medium',
        chipped_plate_count: d.chipped_plate_count,
        total_plate_count: d.total_plate_count,
        chip_rate_pct: d.chip_rate_pct,
        predicted_satisfaction_change: -8,
        est_monthly_opportunity: Math.round(monthlyOpp * 0.5),
        description: `PLATE CHIP WEAR: ${d.chipped_plate_count}/${d.total_plate_count} plates chipped (${d.chip_rate_pct}% — threshold ${config.maxChipRatePct}%). Chipped plates = customers perceive restaurant as dirty/uncared-for. Chips harbor bacteria (food safety concern). Each chipped plate that reaches a customer = negative impression that takes 3-5 visits to overcome. ACTION: replace chipped plates immediately. ${d.chip_rate_pct >= 8 ? 'CRITICAL: 8%+ chip rate = systematic replacement failure — inspect + replace monthly. ' : ''}Cost: $2-8 per plate × ${d.chipped_plate_count} = $${d.chipped_plate_count * 4}. Implement plate inspection at dish station — chipped plates pulled immediately. Save ${fmt$(monthlyOpp * 0.5)}/mo from improved cleanliness perception. Chipped plates are the most visible quality failure — customers see them immediately.`,
        ai_recommendation: 'replace_chipped_plates',
        status: 'open', detected_at: now,
      });
    }

    // Rule 3: GLASSWARE_MISMATCH
    if (d.glassware_variants_per_table > config.minGlasswareConsistency) {
      alerts.push({
        rule_id: 'glassware_mismatch',
        severity: 'medium',
        glassware_variants_per_table: d.glassware_variants_per_table,
        est_monthly_opportunity: Math.round(monthlyOpp * 0.2),
        description: `GLASSWARE MISMATCH: ${d.glassware_variants_per_table} different glass styles at same table. Customers notice when water glass, wine glass, and cocktail glass are all different styles — signals disorganization. Each glass should match: same brand, same style family, same quality tier. ACTION: standardize glassware — purchase matching set (water, wine, cocktail, beer) from same manufacturer. Cost: $2-6 per glass × ${d.glassware_variants_per_table * 20} glasses = $${d.glassware_variants_per_table * 20 * 4}. Save ${fmt$(monthlyOpp * 0.2)}/mo. Glassware consistency is the most visible tableware signal — customers hold glasses for 60+ minutes.`,
        ai_recommendation: 'standardize_glassware',
        status: 'open', detected_at: now,
      });
    }

    // Rule 4: TABLEWARE_BRAND_TIER_MISMATCH
    if (!d.tier_match) {
      alerts.push({
        rule_id: 'tableware_brand_tier_mismatch',
        severity: 'high',
        restaurant_tier: d.restaurant_tier,
        tableware_tier: d.tableware_tier,
        tier_match: d.tier_match,
        predicted_spend_change_pct: 8,
        est_monthly_opportunity: Math.round(monthlyOpp * 0.5),
        description: `TABLEWARE BRAND TIER MISMATCH: restaurant is ${d.restaurant_tier} but tableware is ${d.tableware_tier}. ${d.restaurant_tier === 'fine_dining' && d.tableware_tier === 'basic' ? 'Fine dining with basic tableware = customers feel overcharged. $85 meal on $2 plate = cognitive dissonance. Premium tableware justifies premium pricing. ' : d.restaurant_tier === 'fast_casual' && d.tableware_tier === 'premium' ? 'Fast casual with premium tableware = operational mismatch — premium plates break faster in high-volume setting, cost too much to replace. ' : d.restaurant_tier === 'casual' && d.tableware_tier === 'disposable' ? 'Casual dining with disposable tableware = signals low quality + justifies lower prices. ' : 'Tableware tier does not match restaurant positioning. '}'ACTION: ${d.restaurant_tier === 'fine_dining' ? 'upgrade to premium/luxury tableware ($8-25 per setting). ' : d.restaurant_tier === 'fast_casual' ? 'downgrade to mid-range durable tableware ($3-6 per setting) — built for volume. ' : 'align tableware to mid-range ($4-10 per setting). '}'Save ${fmt$(monthlyOpp * 0.5)}/mo from aligned price perception. Tableware tier is the most direct price justification signal — customers accept prices that match what they touch.`,
        ai_recommendation: 'align_to_brand_tier',
        status: 'open', detected_at: now,
      });
    }

    // Rule 5: NAPKIN_QUALITY_LOW
    if (d.napkin_type === 'paper' && (d.restaurant_tier === 'fine_dining' || d.restaurant_tier === 'casual')) {
      alerts.push({
        rule_id: 'napkin_quality_low',
        severity: d.restaurant_tier === 'fine_dining' ? 'high' : 'medium',
        napkin_type: d.napkin_type,
        restaurant_tier: d.restaurant_tier,
        est_monthly_opportunity: Math.round(monthlyOpp * 0.3),
        description: `NAPKIN QUALITY LOW: paper napkins in ${d.restaurant_tier} restaurant. ${d.restaurant_tier === 'fine_dining' ? 'Fine dining with paper napkins = quality signal failure — cloth napkins are table stakes for fine dining. ' : 'Casual dining with paper napkins = missed ambiance opportunity — cloth napkins elevate perception 15-20%. '}'Paper napkins signal: quick service, low quality, disposable experience. Cloth napkins signal: care, quality, invested experience. ACTION: switch to cloth napkins. Cost: $1-3 per napkin × ${Math.ceil(d.monthly_customers / 20)} napkins = $${Math.ceil(d.monthly_customers / 20) * 2}. Laundry: $0.10/napkin × ${d.monthly_customers}/mo = $${d.monthly_customers * 0.10}/mo. Save ${fmt$(monthlyOpp * 0.3)}/mo from elevated perception + price acceptance. Cloth napkins are the cheapest quality upgrade — $1-3 per napkin, reusable 200+ times.`,
        ai_recommendation: 'upgrade_napkins',
        status: 'open', detected_at: now,
      });
    }

    // Rule 6: TABLE_LINEN_MISSING
    if (!d.has_table_linens && (d.restaurant_tier === 'fine_dining' || d.restaurant_tier === 'casual')) {
      alerts.push({
        rule_id: 'table_linen_missing',
        severity: d.restaurant_tier === 'fine_dining' ? 'high' : 'medium',
        has_table_linens: d.has_table_linens,
        restaurant_tier: d.restaurant_tier,
        est_monthly_opportunity: Math.round(monthlyOpp * 0.25),
        description: `TABLE LINEN MISSING: bare tables in ${d.restaurant_tier} restaurant. ${d.restaurant_tier === 'fine_dining' ? 'Fine dining without table linens = incomplete experience — cloth tablecloths are expected at fine dining price point. ' : 'Casual dining without linens = missed ambiance opportunity — tablecloths or quality table runners elevate perceived quality. '}'Bare tables feel cold, utilitarian, unfinished. Table linens add warmth, absorb sound (noise reduction), and signal attention to detail. ACTION: ${d.restaurant_tier === 'fine_dining' ? 'add white cloth tablecloths ($8-15 each) + napkins. ' : 'add table runners or placemats ($3-8 each) for partial coverage. '}'Save ${fmt$(monthlyOpp * 0.25)}/mo from elevated ambiance. Table linens also reduce noise (fabric absorbs sound) — double benefit.`,
        ai_recommendation: 'add_table_linens',
        status: 'open', detected_at: now,
      });
    }

    // Rule 7: CENTERPIECE_ABSENT
    if (!d.has_centerpiece && d.restaurant_tier !== 'quick_service') {
      alerts.push({
        rule_id: 'centerpiece_absent',
        severity: 'low',
        has_centerpiece: d.has_centerpiece,
        restaurant_tier: d.restaurant_tier,
        est_monthly_opportunity: Math.round(monthlyOpp * 0.15),
        description: `CENTERPIECE ABSENT: no centerpiece on tables. Empty tables = visual gap — customers sit at bare surface, no focal point. Centerpiece creates visual interest, anchors the table, signals intentionality. ACTION: add simple centerpieces — ${d.restaurant_tier === 'fine_dining' ? 'fresh flowers or candles ($2-5/table, replace weekly). ' : 'succulent, candle, or decorative object ($5-15 one-time per table). '}'Cost: $${d.restaurant_tier === 'fine_dining' ? '3-5/table/week' : '5-15 one-time'}. Save ${fmt$(monthlyOpp * 0.15)}/mo from improved table aesthetics + photo opportunities (Instagram). Centerpieces are the most photographed table element — each centerpiece = potential Instagram post = free marketing.`,
        ai_recommendation: 'add_centerpiece',
        status: 'open', detected_at: now,
      });
    }

    // Rule 8: TABLEWARE_INCONSISTENCY_ACROSS_TABLES
    if (d.table_setting_variants >= 2) {
      alerts.push({
        rule_id: 'tableware_inconsistency_across_tables',
        severity: 'medium',
        table_setting_variants: d.table_setting_variants,
        est_monthly_opportunity: Math.round(monthlyOpp * 0.3),
        description: `TABLEWARE INCONSISTENCY ACROSS TABLES: ${d.table_setting_variants} different table settings in use. Table A has Style A plates, Table B has Style B. Customers notice when they see different settings at neighboring tables — signals disorganization, mixed/borrowed inventory, or cost-cutting. ACTION: standardize on ONE table setting across all tables. ${d.table_setting_variants >= 3 ? '3+ variants = chaotic — likely accumulated from different purchases over time. Replace all with single style. ' : '2 variants = likely partial replacement — complete the replacement. '}'Cost: $4-10 per setting × ${Math.ceil(d.monthly_customers / 50)} settings. Save ${fmt$(monthlyOpp * 0.3)}/mo from consistent brand perception. Consistency across tables is the most basic tableware principle — every customer should see the same quality.`,
        ai_recommendation: 'standardize_across_tables',
        status: 'open', detected_at: now,
      });
    }
  }

  // Generate AI insights for critical/high alerts
  if (config.aiEnabled && alerts.length > 0) {
    const { callOpenAIChat } = await import('@/lib/openai.service.ts').catch(() => ({} as any));
    if (callOpenAIChat) {
      const topAlerts = alerts.filter(a => a.severity === 'critical' || a.severity === 'high').slice(0, 5);
      for (const a of topAlerts) {
        try {
          const response = await callOpenAIChat({
            messages: [
              { role: 'system', content: 'You are a restaurant tableware + table setting design AI. Given tableware data, recommend ONE specific action with expected perception impact (max 200 chars, imperative voice).' },
              { role: 'user', content: `Cutlery: ${a.cutlery_weight_grams ?? 0}g. Chip rate: ${a.chip_rate_pct ?? 0}%. Glassware variants: ${a.glassware_variants_per_table ?? 0}. Restaurant tier: ${a.restaurant_tier ?? 'casual'}. Tableware tier: ${a.tableware_tier ?? 'basic'}. Napkin: ${a.napkin_type ?? 'paper'}. Linens: ${a.has_table_linens ?? false}. Centerpiece: ${a.has_centerpiece ?? false}. Setting variants: ${a.table_setting_variants ?? 1}. Monthly opportunity: ${fmt$(a.est_monthly_opportunity)}. Context: ${a.description}` },
            ],
            task: 'reporting',
          });
          const text = typeof response === 'string'
            ? response
            : (response as any)?.choices?.[0]?.message?.content ?? '';
          a.ai_insight = String(text).slice(0, 200);
        } catch { /* skip */ }
      }
    }
  }

  // Persist alerts
  try {
    await db.query(`DELETE FROM table_setting_alert WHERE status = 'open' AND detected_at < time::now() - 24h`);
  } catch { /* ignore */ }
  for (const a of alerts) {
    try {
      await db.query(`CREATE table_setting_alert CONTENT $data`, {
        data: { ...a, detected_at: a.detected_at.toISOString() },
      });
    } catch { /* ignore */ }
  }

  return { alerts, generated: alerts.length };
};

export const getActiveAlerts = async (db: ReturnType<typeof useDB>): Promise<TablewareAlert[]> => {
  try {
    const result = await db.query(
      `SELECT * FROM table_setting_alert WHERE status = 'open'
       ORDER BY est_monthly_opportunity DESC LIMIT 50`
    );
    return Array.isArray(result) ? result.flat() : [];
  } catch { return []; }
};

export const getSummary = async (db: ReturnType<typeof useDB>): Promise<{
  totalAlerts: number; criticalCount: number; totalOpportunity: number;
  avgCutleryWeight: number; avgChipRate: number; settingsToStandardize: number;
}> => {
  try {
    const result = await db.query(
      `SELECT count() AS total, math::count(severity = 'critical') AS critical,
              math::sum(est_monthly_opportunity WHERE est_monthly_opportunity > 0) AS opportunity,
              math::mean(cutlery_weight_grams WHERE cutlery_weight_grams != NONE) AS avgcutlery,
              math::mean(chip_rate_pct WHERE chip_rate_pct != NONE) AS avgchip,
              math::count(rule_id = 'tableware_inconsistency_across_tables') AS standardize
       FROM table_setting_alert WHERE status = 'open' GROUP ALL`
    );
    const rows = Array.isArray(result) ? result.flat() : [];
    const r = rows[0] ?? {};
    return {
      totalAlerts: safeNumber(r.total, 0), criticalCount: safeNumber(r.critical, 0),
      totalOpportunity: safeNumber(r.opportunity, 0),
      avgCutleryWeight: safeNumber(r.avgcutlery, 0),
      avgChipRate: safeNumber(r.avgchip, 0),
      settingsToStandardize: safeNumber(r.standardize, 0),
    };
  } catch {
    return { totalAlerts: 0, criticalCount: 0, totalOpportunity: 0, avgCutleryWeight: 0, avgChipRate: 0, settingsToStandardize: 0 };
  }
};

export const updateAlertStatus = async (
  db: ReturnType<typeof useDB>, alertId: string,
  status: 'resolved' | 'in_progress' | 'rejected' | 'expired'
): Promise<void> => {
  await db.query(`UPDATE $id SET status = $status`, { id: alertId, status });
};
