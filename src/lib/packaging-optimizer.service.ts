/**
 * AI Takeout Packaging Optimizer — right-sizes and selects optimal packaging
 * per order to cut material cost, prevent spills, and improve eco-profile.
 *
 * 59th POSR-exclusive differentiator — takeout/delivery packaging costs
 * restaurants $300-1,200/mo per location; 15-25% is wasted on oversized
 * containers, wrong materials, and missed consolidation.
 *
 * Distinct from:
 *   - waste-tracking.service (FOOD waste / kitchen overproduction — NOT
 *     packaging material cost)
 *   - delivery-analytics.service (delivery PERFORMANCE: time/accuracy — NOT
 *     packaging selection)
 *   - delivery-route.service (route/driver OPTIMIZATION — NOT packaging)
 *   - spoilage-prediction.service (ingredient SHELF-LIFE — NOT packaging)
 *   - food-cost-trend.service (ingredient COST trends — NOT packaging)
 *   - recipe-optimization.service (recipe ingredients — NOT packaging)
 *
 * Optimizes TAKEOUT PACKAGING selection per order:
 *   1. Oversized containers (large box for 1 small item)
 *   2. Wrong material for temperature (hot food in thin bag)
 *   3. Spill/leak risk (liquids in non-sealed)
 *   4. Bundle split (multi-item orders using separate boxes)
 *   5. Eco upgrade (high-volume plastic → compostable)
 *   6. Cost overrun (packaging > 8% of order value)
 *   7. Bulk discount missed (frequent SKUs at retail price)
 *   8. Damage history (items with prior damage complaints)
 */

import { useDB } from '@/api/db/db.ts';
import { safeNumber } from '@/lib/utils.ts';

export type PackagingRuleId =
  | 'oversized_container'
  | 'wrong_material_temp'
  | 'spill_risk_mismatch'
  | 'bundle_split'
  | 'eco_upgrade'
  | 'cost_overrun'
  | 'bulk_discount_missed'
  | 'damaged_history';

export type PackagingAiRec =
  | 'adopt_now'
  | 'pilot_2_weeks'
  | 'bulk_purchase'
  | 'monitor'
  | 'skip';

export interface PackagingRecommendation {
  id?: string;
  rule_id: PackagingRuleId;
  severity: 'critical' | 'high' | 'medium' | 'low';
  order_id?: string;
  item_name: string;
  current_packaging: string;
  suggested_packaging: string;
  order_count_30d?: number;
  current_unit_cost: number;
  suggested_unit_cost: number;
  est_savings_monthly: number;
  eco_score_delta?: number;
  spill_risk?: boolean;
  temp_issue?: boolean;
  est_loss: number;
  description: string;
  ai_insight?: string;
  ai_recommendation?: PackagingAiRec;
  status: 'open' | 'adopted' | 'piloting' | 'rejected' | 'expired';
  detected_at: Date;
  expires_at?: Date;
}

export interface PackagingConfig {
  aiEnabled: boolean;
  costPctThreshold: number;
  bulkThreshold: number;
  ecoTargetPct: number;
}

export const DEFAULT_PACKAGING_CONFIG: PackagingConfig = {
  aiEnabled: true,
  costPctThreshold: 8.0,
  bulkThreshold: 50,
  ecoTargetPct: 40.0,
};

export const readPackagingConfig = (settings: any): PackagingConfig => ({
  aiEnabled: settings?.packaging_ai_enabled ?? true,
  costPctThreshold: safeNumber(settings?.packaging_cost_pct_threshold, 8.0),
  bulkThreshold: safeNumber(settings?.packaging_bulk_threshold, 50),
  ecoTargetPct: safeNumber(settings?.packaging_eco_target_pct, 40.0),
});

const fmt$ = (n: number): string => `$${(n || 0).toFixed(2)}`;

// ---------------------------------------------------------------------------
// Packaging catalogue — current SKUs with unit cost + eco score (0-100)
// ---------------------------------------------------------------------------
interface PackSKU {
  id: string;
  label: string;
  unitCost: number;
  ecoScore: number;   // 0 = virgin plastic, 100 = compostable
  insulated: boolean;
  leakproof: boolean;
  capacity: 'small' | 'medium' | 'large';
  material: 'plastic' | 'paper' | 'compostable' | 'foil';
}

const PACKAGING_CATALOGUE: PackSKU[] = [
  { id: 'small_box',        label: 'Small box',          unitCost: 0.18, ecoScore: 55, insulated: false, leakproof: false, capacity: 'small',  material: 'paper' },
  { id: 'medium_box',       label: 'Medium box',         unitCost: 0.28, ecoScore: 55, insulated: false, leakproof: false, capacity: 'medium', material: 'paper' },
  { id: 'large_box',        label: 'Large box',          unitCost: 0.42, ecoScore: 55, insulated: false, leakproof: false, capacity: 'large',  material: 'paper' },
  { id: 'combo_box',        label: 'Combo box (3-comp)', unitCost: 0.55, ecoScore: 60, insulated: false, leakproof: false, capacity: 'large',  material: 'paper' },
  { id: 'plastic_clamshell', label: 'Plastic clamshell',  unitCost: 0.22, ecoScore: 15, insulated: false, leakproof: true,  capacity: 'medium', material: 'plastic' },
  { id: 'foil_container',   label: 'Foil container',     unitCost: 0.30, ecoScore: 70, insulated: true,  leakproof: false, capacity: 'medium', material: 'foil' },
  { id: 'insulated_bag',    label: 'Insulated bag',      unitCost: 0.65, ecoScore: 65, insulated: true,  leakproof: false, capacity: 'large',  material: 'paper' },
  { id: 'leakproof_container', label: 'Leakproof container', unitCost: 0.38, ecoScore: 50, insulated: true, leakproof: true, capacity: 'medium', material: 'plastic' },
  { id: 'compostable_box',  label: 'Compostable box',    unitCost: 0.34, ecoScore: 95, insulated: false, leakproof: false, capacity: 'medium', material: 'compostable' },
  { id: 'paper_bag',        label: 'Paper bag',          unitCost: 0.08, ecoScore: 60, insulated: false, leakproof: false, capacity: 'small',  material: 'paper' },
];

const skuById = (id: string): PackSKU | undefined =>
  PACKAGING_CATALOGUE.find(s => s.id === id);

// Item profile — temperature, liquid content, fragility, size
interface ItemProfile {
  name: string;
  isHot: boolean;
  isLiquid: boolean;
  isFragile: boolean;
  size: 'small' | 'medium' | 'large';
  currentPackaging: string;
  unitCost: number;
}

// Mock item profiles (in production, derived from menu table + packaging assignment)
const ITEM_PROFILES: ItemProfile[] = [
  { name: 'Burger & Fries',       isHot: true,  isLiquid: false, isFragile: false, size: 'medium', currentPackaging: 'large_box',         unitCost: 0.42 },
  { name: 'Caesar Salad',         isHot: false, isLiquid: false, isFragile: false, size: 'medium', currentPackaging: 'large_box',         unitCost: 0.42 },
  { name: 'Tomato Soup',          isHot: true,  isLiquid: true,  isFragile: false, size: 'small',  currentPackaging: 'paper_bag',         unitCost: 0.08 },
  { name: 'Chicken Curry',        isHot: true,  isLiquid: true,  isFragile: false, size: 'medium', currentPackaging: 'plastic_clamshell',  unitCost: 0.22 },
  { name: 'Sushi Platter',        isHot: false, isLiquid: false, isFragile: true,  size: 'large',  currentPackaging: 'paper_bag',         unitCost: 0.08 },
  { name: 'Pizza Slice',          isHot: true,  isLiquid: false, isFragile: false, size: 'medium', currentPackaging: 'paper_bag',         unitCost: 0.08 },
  { name: 'Pasta Alfredo',        isHot: true,  isLiquid: true,  isFragile: false, size: 'medium', currentPackaging: 'large_box',         unitCost: 0.42 },
  { name: 'Spring Rolls (4pc)',   isHot: true,  isLiquid: false, isFragile: true,  size: 'small',  currentPackaging: 'large_box',         unitCost: 0.42 },
  { name: 'Smoothie Bowl',        isHot: false, isLiquid: true,  isFragile: false, size: 'medium', currentPackaging: 'paper_bag',         unitCost: 0.08 },
  { name: 'Wings (10pc)',         isHot: true,  isLiquid: false, isFragile: false, size: 'large',  currentPackaging: 'large_box',         unitCost: 0.42 },
];

// Damage complaint history (mock: items with prior damage reports)
const DAMAGED_ITEMS = new Set(['Sushi Platter', 'Spring Rolls (4pc)', 'Cake Slice']);

/**
 * Run the packaging optimizer engine.
 * Evaluates item profiles against packaging catalogue, generates recommendations.
 */
export const runPackagingEngine = async (
  db: ReturnType<typeof useDB>,
  config: PackagingConfig = DEFAULT_PACKAGING_CONFIG
): Promise<{ recommendations: PackagingRecommendation[]; generated: number }> => {
  const recs: PackagingRecommendation[] = [];
  const now = new Date();

  // 1. Fetch order frequency per item (last 30 days) for savings calculation
  let itemFrequency: Map<string, number> = new Map();
  try {
    const result = await db.query(
      `SELECT item.name AS item, count() AS cnt
       FROM order_item
       WHERE created_at > time::now() - 30d
         AND order.order_type IN ['delivery', 'pickup_online', 'takeout']
       GROUP BY item.name`
    );
    const rows = Array.isArray(result) ? result.flat() : [];
    for (const r of rows) {
      itemFrequency.set(String(r.item), safeNumber(r.cnt, 0));
    }
  } catch (err) {
    console.warn('[packaging] fetchFrequency failed — using mock', err);
  }

  // Fallback: mock frequency if no data
  if (itemFrequency.size === 0) {
    ITEM_PROFILES.forEach((p, i) => itemFrequency.set(p.name, 80 - i * 6));
  }

  // 2. Fetch recent takeout orders for bundle-split detection
  let multiItemOrders: { orderId: string; itemCount: number; total: number; packagingCost: number }[] = [];
  try {
    const result = await db.query(
      `SELECT id AS order_id, count(order_item) AS item_count,
         math::sum(total) AS total
       FROM order
       WHERE order_type IN ['delivery', 'pickup_online', 'takeout']
         AND created_at > time::now() - 7d
         AND count(order_item) >= 3
       LIMIT 50`
    );
    const rows = Array.isArray(result) ? result.flat() : [];
    multiItemOrders = rows.map((r: any) => ({
      orderId: String(r.order_id ?? ''),
      itemCount: safeNumber(r.item_count, 0),
      total: safeNumber(r.total, 0),
      packagingCost: safeNumber(r.item_count, 0) * 0.42, // assume large box per item
    }));
  } catch (err) {
    console.warn('[packaging] fetchMultiItemOrders failed — using mock', err);
    multiItemOrders = [
      { orderId: 'ORD-2041', itemCount: 4, total: 38.50, packagingCost: 1.68 },
      { orderId: 'ORD-2087', itemCount: 5, total: 52.20, packagingCost: 2.10 },
      { orderId: 'ORD-2103', itemCount: 3, total: 27.90, packagingCost: 1.26 },
    ];
  }

  // 3. Apply 8 packaging optimization rules per item profile
  for (const item of ITEM_PROFILES) {
    const freq = itemFrequency.get(item.name) ?? 10;
    const currentSku = skuById(item.currentPackaging);

    // --- Rule 1: OVERSIZED_CONTAINER ---
    if (currentSku && currentSku.capacity !== item.size) {
      const sizes = ['small', 'medium', 'large'];
      const currIdx = sizes.indexOf(currentSku.capacity);
      const needIdx = sizes.indexOf(item.size);
      if (currIdx > needIdx) {
        const betterSku = PACKAGING_CATALOGUE.find(s =>
          s.capacity === item.size && s.material === currentSku.material
        ) ?? PACKAGING_CATALOGUE.find(s => s.capacity === item.size);
        if (betterSku) {
          const unitSave = item.unitCost - betterSku.unitCost;
          const monthlySave = unitSave * freq * 30 / 7; // freq is 30d, scale
          recs.push(makeRec(
            'oversized_container', 'medium',
            item.name, item.currentPackaging, betterSku.id,
            freq, item.unitCost, betterSku.unitCost,
            monthlySave,
            `${item.name} ships in a ${currentSku.label.toLowerCase()} but only needs a ${betterSku.label.toLowerCase()} — right-size to save ${fmt$(unitSave)}/unit`,
            'adopt_now'
          ));
        }
      }
    }

    // --- Rule 2: WRONG_MATERIAL_TEMP ---
    if (item.isHot && currentSku && !currentSku.insulated) {
      const insulated = PACKAGING_CATALOGUE.find(s => s.insulated && s.capacity === item.size)
        ?? PACKAGING_CATALOGUE.find(s => s.insulated);
      if (insulated) {
        const costDelta = insulated.unitCost - item.unitCost;
        const complaintLoss = 12; // est $/mo from cold-food complaints + remakes
        recs.push(makeRec(
          'wrong_material_temp', 'high',
          item.name, item.currentPackaging, insulated.id,
          freq, item.unitCost, insulated.unitCost,
          complaintLoss - Math.max(0, costDelta * freq * 30 / 7),
          `${item.name} is served hot but ships in non-insulated ${currentSku.label.toLowerCase()} — food arrives cold, triggering complaints and remakes. Switch to ${insulated.label.toLowerCase()}.`,
          'adopt_now',
          { tempIssue: true, ecoScoreDelta: insulated.ecoScore - currentSku.ecoScore }
        ));
      }
    }

    // --- Rule 3: SPILL_RISK_MISMATCH ---
    if (item.isLiquid && currentSku && !currentSku.leakproof) {
      const leakproof = PACKAGING_CATALOGUE.find(s => s.leakproof && s.capacity === item.size)
        ?? PACKAGING_CATALOGUE.find(s => s.leakproof);
      if (leakproof) {
        const spillLoss = 8; // est $/mo from spilled orders + refunds
        recs.push(makeRec(
          'spill_risk_mismatch', 'critical',
          item.name, item.currentPackaging, leakproof.id,
          freq, item.unitCost, leakproof.unitCost,
          spillLoss,
          `${item.name} contains liquid but ships in non-leakproof ${currentSku.label.toLowerCase()} — spill risk triggers refunds and 1-star reviews. Switch to ${leakproof.label.toLowerCase()}.`,
          'adopt_now',
          { spillRisk: true, ecoScoreDelta: leakproof.ecoScore - currentSku.ecoScore }
        ));
      }
    }

    // --- Rule 4: BUNDLE_SPLIT (handled per multi-item order, not per item) ---
    // (added below in multi-item loop)

    // --- Rule 5: ECO_UPGRADE ---
    if (currentSku && currentSku.material === 'plastic' && freq >= 30) {
      const compostable = PACKAGING_CATALOGUE.find(s => s.material === 'compostable' && s.capacity === item.size)
        ?? PACKAGING_CATALOGUE.find(s => s.material === 'compostable');
      if (compostable) {
        const costDelta = compostable.unitCost - item.unitCost;
        const ecoDelta = compostable.ecoScore - currentSku.ecoScore;
        recs.push(makeRec(
          'eco_upgrade', 'medium',
          item.name, item.currentPackaging, compostable.id,
          freq, item.unitCost, compostable.unitCost,
          -costDelta * freq * 30 / 7, // net cost increase but eco benefit
          `${item.name} ships ${freq}/mo in virgin plastic. Compostable ${compostable.label.toLowerCase()} adds ${fmt$(Math.max(0, costDelta))}/unit but boosts eco-score +${ecoDelta} and complies with single-use plastic bans.`,
          'pilot_2_weeks',
          { ecoScoreDelta: ecoDelta }
        ));
      }
    }

    // --- Rule 6: COST_OVERRUN ---
    // (packaging > 8% of typical order value for this item)
    const typicalOrderValue = 18; // avg order value
    const packagingPct = (item.unitCost / typicalOrderValue) * 100;
    if (packagingPct > config.costPctThreshold) {
      const cheaper = PACKAGING_CATALOGUE
        .filter(s => s.capacity === item.size && s.unitCost < item.unitCost)
        .sort((a, b) => a.unitCost - b.unitCost)[0];
      if (cheaper) {
        const unitSave = item.unitCost - cheaper.unitCost;
        const monthlySave = unitSave * freq * 30 / 7;
        recs.push(makeRec(
          'cost_overrun', 'high',
          item.name, item.currentPackaging, cheaper.id,
          freq, item.unitCost, cheaper.unitCost,
          monthlySave,
          `${item.name} packaging is ${packagingPct.toFixed(1)}% of order value (threshold ${config.costPctThreshold}%). Switch to ${cheaper.label.toLowerCase()} to save ${fmt$(unitSave)}/unit.`,
          'adopt_now'
        ));
      }
    }

    // --- Rule 7: BULK_DISCOUNT_MISSED ---
    if (freq >= config.bulkThreshold) {
      const bulkUnitCost = item.unitCost * 0.65; // 35% bulk discount
      const monthlySave = (item.unitCost - bulkUnitCost) * freq;
      recs.push(makeRec(
        'bulk_discount_missed', 'medium',
        item.name, item.currentPackaging, `${item.currentPackaging} (bulk)`,
        freq, item.unitCost, bulkUnitCost,
        monthlySave,
        `${item.name} uses ${freq}x/month of ${currentSku?.label ?? item.currentPackaging} — qualifies for bulk contract (35% off). Retail purchase wastes ${fmt$(monthlySave)}/mo.`,
        'bulk_purchase'
      ));
    }

    // --- Rule 8: DAMAGED_HISTORY ---
    if (DAMAGED_ITEMS.has(item.name)) {
      const sturdier = PACKAGING_CATALOGUE.find(s => s.leakproof && s.capacity === item.size)
        ?? PACKAGING_CATALOGUE.find(s => s.capacity === 'large');
      if (sturdier && sturdier.id !== item.currentPackaging) {
        const damageLoss = 15; // est $/mo from damage refunds + remakes
        recs.push(makeRec(
          'damaged_history', 'high',
          item.name, item.currentPackaging, sturdier.id,
          freq, item.unitCost, sturdier.unitCost,
          damageLoss,
          `${item.name} has a history of damage complaints in transit. Upgrade to sturdier ${sturdier.label.toLowerCase()} to reduce damage refunds (~${fmt$(damageLoss)}/mo exposure).`,
          'adopt_now',
          { spillRisk: true }
        ));
      }
    }
  }

  // 4. BUNDLE_SPLIT rule — multi-item orders using separate boxes
  for (const order of multiItemOrders) {
    if (order.itemCount >= 3) {
      const comboBox = skuById('combo_box')!;
      const currentCost = order.packagingCost; // separate boxes
      const comboCost = comboBox.unitCost * Math.ceil(order.itemCount / 3);
      const unitSave = currentCost - comboCost;
      const monthlySave = unitSave * 20; // ~20 such orders/mo
      if (unitSave > 0) {
        recs.push(makeRec(
          'bundle_split', 'medium',
          `Order ${order.orderId}`, 'Separate boxes', 'combo_box',
          20, currentCost, comboCost,
          monthlySave,
          `Order ${order.orderId} (${order.itemCount} items) ships in ${order.itemCount} separate boxes. Consolidate into ${Math.ceil(order.itemCount / 3)} combo box(es) to save ${fmt$(unitSave)}/order.`,
          'adopt_now'
        ));
      }
    }
  }

  // 5. AI insight for top 5 critical/high recommendations
  if (config.aiEnabled && recs.length > 0) {
    const { callOpenAIChat } = await import('@/lib/openai.service.ts').catch(() => ({} as any));
    if (callOpenAIChat) {
      const topRecs = recs
        .filter(r => r.severity === 'critical' || r.severity === 'high')
        .slice(0, 5);
      for (const r of topRecs) {
        try {
          const response = await callOpenAIChat([
            { role: 'system', content: 'You are a restaurant packaging cost-optimization AI. Respond with a single actionable insight (max 200 chars).' },
            { role: 'user', content: `Packaging rec: ${r.rule_id} for ${r.item_name} — ${r.current_packaging} → ${r.suggested_packaging}, saves ${fmt$(r.est_savings_monthly)}/mo. ${r.description}` },
          ], { temperature: 0.2, maxTokens: 120 });
          const text = typeof response === 'string' ? response : (response as any)?.content ?? '';
          r.ai_insight = text.slice(0, 200);
        } catch { /* skip AI failure */ }
      }
    }
  }

  // 6. Persist
  try {
    await db.query(`DELETE FROM packaging_recommendation WHERE status = 'open' AND detected_at < time::now() - 1h`);
  } catch { /* ignore */ }
  for (const r of recs) {
    try {
      await db.query(`CREATE packaging_recommendation CONTENT $data`, {
        data: { ...r, detected_at: r.detected_at.toISOString() },
      });
    } catch { /* ignore individual insert failures */ }
  }

  return { recommendations: recs, generated: recs.length };
};

// ---------------------------------------------------------------------------
// Helper: build a recommendation
// ---------------------------------------------------------------------------
function makeRec(
  ruleId: PackagingRuleId,
  severity: PackagingRecommendation['severity'],
  itemName: string,
  currentPackaging: string,
  suggestedPackaging: string,
  freq: number,
  currentUnitCost: number,
  suggestedUnitCost: number,
  estSavingsMonthly: number,
  description: string,
  aiRec: PackagingAiRec,
  extra?: { spillRisk?: boolean; tempIssue?: boolean; ecoScoreDelta?: number }
): PackagingRecommendation {
  const now = new Date();
  return {
    rule_id: ruleId,
    severity,
    item_name: itemName,
    current_packaging: currentPackaging,
    suggested_packaging: suggestedPackaging,
    order_count_30d: freq,
    current_unit_cost: Math.round(currentUnitCost * 100) / 100,
    suggested_unit_cost: Math.round(suggestedUnitCost * 100) / 100,
    est_savings_monthly: Math.round(estSavingsMonthly * 100) / 100,
    eco_score_delta: extra?.ecoScoreDelta,
    spill_risk: extra?.spillRisk,
    temp_issue: extra?.tempIssue,
    est_loss: Math.round(Math.max(0, -estSavingsMonthly) * 100) / 100,
    description,
    ai_recommendation: aiRec,
    status: 'open',
    detected_at: now,
  };
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export const getActiveRecommendations = async (db: ReturnType<typeof useDB>): Promise<PackagingRecommendation[]> => {
  try {
    const result = await db.query(
      `SELECT * FROM packaging_recommendation
       WHERE status = 'open'
       ORDER BY est_savings_monthly DESC
       LIMIT 50`
    );
    return Array.isArray(result) ? result.flat() : [];
  } catch { return []; }
};

export const getSummary = async (db: ReturnType<typeof useDB>): Promise<{
  totalRecs: number;
  criticalCount: number;
  totalSavings: number;
  avgEcoDelta: number;
}> => {
  try {
    const result = await db.query(
      `SELECT
         count() AS total,
         math::count(severity = 'critical') AS critical,
         math::sum(est_savings_monthly) AS savings,
         math::mean(eco_score_delta) AS eco
       FROM packaging_recommendation
       WHERE status = 'open' GROUP ALL`
    );
    const rows = Array.isArray(result) ? result.flat() : [];
    const r = rows[0] ?? {};
    return {
      totalRecs: safeNumber(r.total, 0),
      criticalCount: safeNumber(r.critical, 0),
      totalSavings: safeNumber(r.savings, 0),
      avgEcoDelta: safeNumber(r.eco, 0),
    };
  } catch {
    return { totalRecs: 0, criticalCount: 0, totalSavings: 0, avgEcoDelta: 0 };
  }
};

export const updateRecStatus = async (
  db: ReturnType<typeof useDB>,
  recId: string,
  status: 'adopted' | 'piloting' | 'rejected' | 'expired'
): Promise<void> => {
  await db.query(`UPDATE $id SET status = $status`, { id: recId, status });
};
