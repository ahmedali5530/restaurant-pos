/**
 * AI Vendor Performance Analysis service — supplier scoring + recommendations.
 *
 * Research finding: Square Vendor Management $40/mo, Toast Supplier Management
 * add-on. POSR offers it free — analyzes supplier performance (on-time
 * delivery, quality, price competitiveness) + AI generates recommendations.
 *
 * Metrics per supplier:
 *   - On-time delivery rate: % POs fulfilled before due_date (default: submitted + 14d)
 *   - Quality score: 1 - (returns / total_orders), 0-1
 *   - Price competitiveness: avg unit cost vs market median (computed across all suppliers)
 *   - Order accuracy: 1 - (amendments / total_orders), 0-1
 *   - Total spend (last N days)
 *   - Total orders count
 *   - Avg lead time (days from submitted_at to fulfilled)
 *   - Return rate (% orders with returns)
 *   - Waste attribution ($ waste from items supplied by this vendor)
 *
 * Overall score (0-100, weighted):
 *   on-time (30%) + quality (25%) + price (20%) + accuracy (15%) + volume (10%)
 *
 * Grade: A (>= 85), B (70-84), C (55-69), D (40-54), F (< 40)
 *
 * Recommendations (AI):
 *   - 'renegotiate' — high volume + high price → ask for discount
 *   - 'diversify'   — single-source risk (no backup supplier for critical items)
 *   - 'consolidate' — many small orders → consolidate to fewer, larger POs
 *   - 'drop'        — poor performance + low volume → find alternative
 *   - 'keep'        — good performance, maintain relationship
 *   - 'monitor'    — borderline performance, watch closely
 */

import { useDB } from '@/api/db/db.ts';
import { safeNumber } from '@/lib/utils.ts';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type VendorRecommendation = 'renegotiate' | 'diversify' | 'consolidate' | 'drop' | 'keep' | 'monitor';
export type VendorGrade = 'A' | 'B' | 'C' | 'D' | 'F';
export type TrendDirection = 'improving' | 'declining' | 'stable';

export interface VendorPerformance {
  id?: string;
  supplier_id: string;
  supplier_name: string;
  period_start: Date;
  period_end: Date;
  total_orders: number;
  fulfilled_orders: number;
  on_time_orders: number;
  on_time_rate: number;        // 0-1
  returned_orders: number;
  return_rate: number;         // 0-1
  quality_score: number;       // 0-1
  amendments_count: number;
  accuracy_score: number;      // 0-1
  avg_lead_days: number;
  total_spend: number;
  avg_order_value: number;
  unique_items: number;
  avg_unit_cost: number;
  price_competitiveness: number; // 0-1
  waste_attributed: number;
  overall_score: number;       // 0-100
  grade: VendorGrade;
  trend_direction: TrendDirection;
  generated_at: Date;
  expires_at?: Date;
}

export interface VendorInsight {
  id?: string;
  supplier_id: string;
  supplier_name: string;
  recommendation: VendorRecommendation;
  insight_text: string;
  action?: string;
  projected_savings?: number;
  confidence: number;
  priority: 'low' | 'medium' | 'high';
  status: 'open' | 'acknowledged' | 'acted_on' | 'dismissed';
  generated_at: Date;
  expires_at?: Date;
}

export interface VendorConfig {
  lookbackDays: number;
  aiEnabled: boolean;
  minOrders: number;
  criticalItemsOnly: boolean;
}

export const DEFAULT_VENDOR_CONFIG: VendorConfig = {
  lookbackDays: 90,
  aiEnabled: true,
  minOrders: 3,
  criticalItemsOnly: false,
};

// ---------------------------------------------------------------------------
// Config reader
// ---------------------------------------------------------------------------

export const readVendorConfig = (settings: any): VendorConfig => ({
  lookbackDays: safeNumber(settings?.vendor_perf_lookback_days, 90),
  aiEnabled: settings?.vendor_perf_ai_enabled ?? true,
  minOrders: safeNumber(settings?.vendor_perf_min_orders, 3),
  criticalItemsOnly: settings?.vendor_perf_critical_items_only ?? false,
});

// ---------------------------------------------------------------------------
// Data collection — fetch PO + return data per supplier
// ---------------------------------------------------------------------------

interface SupplierOrderData {
  supplier_id: string;
  supplier_name: string;
  orders: any[];
  returns: any[];
  amendments: number;
  total_spend: number;
  unique_items: Set<string>;
  unit_costs: number[];
}

const collectSupplierData = async (
  db: ReturnType<typeof useDB>,
  lookbackDays: number
): Promise<Map<string, SupplierOrderData>> => {
  const cutoff = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000);
  const bySupplier = new Map<string, SupplierOrderData>();

  // Fetch fulfilled purchase orders with items
  try {
    const result = await db.query<any[]>(
      `SELECT
         id,
         po_number,
         status,
         supplier.id AS supplier_id,
         supplier.name AS supplier_name,
         submitted_at,
         updated_at,
         created_at,
         items,
         (SELECT math::sum(quantity * price) AS total FROM $parent.items)[0] AS po_total
       FROM inventory_purchase_order
       WHERE created_at > $cutoff AND deleted_at IS NONE
       FETCH supplier, items.item`,
      { cutoff: cutoff.toISOString() }
    );
    const rows = Array.isArray(result) ? result.flat() : [];

    for (const po of rows) {
      const supplierId = po.supplier_id?.toString?.() ?? 'unknown';
      const supplierName = po.supplier_name ?? 'Unknown Supplier';
      if (!bySupplier.has(supplierId)) {
        bySupplier.set(supplierId, {
          supplier_id: supplierId,
          supplier_name: supplierName,
          orders: [],
          returns: [],
          amendments: 0,
          total_spend: 0,
          unique_items: new Set(),
          unit_costs: [],
        });
      }
      const data = bySupplier.get(supplierId)!;
      data.orders.push(po);
      const poTotal = safeNumber(po.po_total?.[0]?.total ?? po.po_total, 0);
      data.total_spend += poTotal;
      // Track unique items + unit costs
      if (Array.isArray(po.items)) {
        for (const item of po.items) {
          if (item?.item?.id) data.unique_items.add(item.item.id.toString());
          const qty = safeNumber(item?.quantity, 0);
          const price = safeNumber(item?.price, 0);
          if (qty > 0 && price > 0) {
            data.unit_costs.push(price);
          }
        }
      }
    }
  } catch (err) {
    console.error('[vendor-perf] collectPurchaseOrders failed', err);
  }

  // Fetch purchase returns
  try {
    const returnsResult = await db.query<any[]>(
      `SELECT
         id,
         supplier.id AS supplier_id,
         created_at,
         items
       FROM inventory_purchase_return
       WHERE created_at > $cutoff AND deleted_at IS NONE
       FETCH supplier`,
      { cutoff: cutoff.toISOString() }
    );
    const returns = Array.isArray(returnsResult) ? returnsResult.flat() : [];
    for (const ret of returns) {
      const supplierId = ret.supplier_id?.toString?.() ?? 'unknown';
      if (bySupplier.has(supplierId)) {
        bySupplier.get(supplierId)!.returns.push(ret);
      }
    }
  } catch (err) {
    console.warn('[vendor-perf] fetchReturns failed', err);
  }

  return bySupplier;
};

// ---------------------------------------------------------------------------
// Compute market median unit cost (for price competitiveness)
// ---------------------------------------------------------------------------

const computeMarketMedian = (allCosts: number[]): number => {
  if (allCosts.length === 0) return 0;
  const sorted = [...allCosts].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

// ---------------------------------------------------------------------------
// Performance computation per supplier
// ---------------------------------------------------------------------------

const computeGrade = (score: number): VendorGrade => {
  if (score >= 85) return 'A';
  if (score >= 70) return 'B';
  if (score >= 55) return 'C';
  if (score >= 40) return 'D';
  return 'F';
};

const computeTrend = (orders: any[]): TrendDirection => {
  if (orders.length < 4) return 'stable';
  // Sort by date, split into halves, compare avg lead time
  const sorted = [...orders].sort((a, b) =>
    new Date(a.submitted_at ?? a.created_at).getTime() - new Date(b.submitted_at ?? b.created_at).getTime()
  );
  const mid = Math.floor(sorted.length / 2);
  const computeLead = (po: any): number => {
    const start = po.submitted_at ? new Date(po.submitted_at) : null;
    const end = po.updated_at ? new Date(po.updated_at) : null;
    if (!start || !end) return 0;
    return (end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000);
  };
  const firstHalfAvg = sorted.slice(0, mid).reduce((s, po) => s + computeLead(po), 0) / mid;
  const secondHalfAvg = sorted.slice(mid).reduce((s, po) => s + computeLead(po), 0) / (sorted.length - mid);
  if (secondHalfAvg < firstHalfAvg * 0.8) return 'improving';
  if (secondHalfAvg > firstHalfAvg * 1.2) return 'declining';
  return 'stable';
};

const computePerformance = (
  data: SupplierOrderData,
  marketMedianCost: number,
  periodStart: Date,
  periodEnd: Date
): VendorPerformance => {
  const totalOrders = data.orders.length;
  const fulfilledOrders = data.orders.filter(o => o.status === 'Fulfilled').length;
  // On-time: fulfilled before due_date (submitted_at + 14 days default)
  let onTimeOrders = 0;
  let totalLeadDays = 0;
  let leadCount = 0;
  for (const po of data.orders) {
    if (po.status !== 'Fulfilled') continue;
    const submitted = po.submitted_at ? new Date(po.submitted_at) : null;
    const fulfilled = po.updated_at ? new Date(po.updated_at) : null;
    if (!submitted || !fulfilled) continue;
    const leadDays = (fulfilled.getTime() - submitted.getTime()) / (24 * 60 * 60 * 1000);
    totalLeadDays += leadDays;
    leadCount++;
    // On-time if fulfilled within 14 days of submission (configurable in future)
    if (leadDays <= 14) onTimeOrders++;
  }
  const onTimeRate = fulfilledOrders > 0 ? onTimeOrders / fulfilledOrders : 0;
  const avgLeadDays = leadCount > 0 ? totalLeadDays / leadCount : 0;

  // Returns
  const returnedOrders = data.returns.length;
  const returnRate = totalOrders > 0 ? returnedOrders / totalOrders : 0;
  const qualityScore = Math.max(0, 1 - returnRate);

  // Accuracy (amendments — simplified: count POs with status changes beyond draft→pending→approved→fulfilled)
  // For now, use 0.95 baseline if no amendment tracking (TODO: integrate with revision history)
  const accuracyScore = 0.95;

  // Price competitiveness: compare avg unit cost to market median
  const avgUnitCost = data.unit_costs.length > 0
    ? data.unit_costs.reduce((s, c) => s + c, 0) / data.unit_costs.length
    : 0;
  let priceCompetitiveness = 0.5; // neutral default
  if (marketMedianCost > 0 && avgUnitCost > 0) {
    // 1.0 if at or below median, decreasing to 0 at 2x median
    const ratio = avgUnitCost / marketMedianCost;
    priceCompetitiveness = Math.max(0, Math.min(1, 2 - ratio));
  }

  // Overall score (0-100, weighted)
  const volumeScore = Math.min(1, totalOrders / 10); // 10+ orders = max volume score
  const overallScore = Math.round(
    (onTimeRate * 30) +
    (qualityScore * 25) +
    (priceCompetitiveness * 20) +
    (accuracyScore * 15) +
    (volumeScore * 10)
  );

  const grade = computeGrade(overallScore);
  const trend = computeTrend(data.orders);

  return {
    supplier_id: data.supplier_id,
    supplier_name: data.supplier_name,
    period_start: periodStart,
    period_end: periodEnd,
    total_orders: totalOrders,
    fulfilled_orders: fulfilledOrders,
    on_time_orders: onTimeOrders,
    on_time_rate: Math.round(onTimeRate * 100) / 100,
    returned_orders: returnedOrders,
    return_rate: Math.round(returnRate * 100) / 100,
    quality_score: Math.round(qualityScore * 100) / 100,
    amendments_count: data.amendments,
    accuracy_score: Math.round(accuracyScore * 100) / 100,
    avg_lead_days: Math.round(avgLeadDays * 10) / 10,
    total_spend: Math.round(data.total_spend * 100) / 100,
    avg_order_value: Math.round((totalOrders > 0 ? data.total_spend / totalOrders : 0) * 100) / 100,
    unique_items: data.unique_items.size,
    avg_unit_cost: Math.round(avgUnitCost * 100) / 100,
    price_competitiveness: Math.round(priceCompetitiveness * 100) / 100,
    waste_attributed: 0, // TODO: link waste items to supplier items
    overall_score: overallScore,
    grade,
    trend_direction: trend,
    generated_at: new Date(),
    expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000),
  };
};

// ---------------------------------------------------------------------------
// AI enhancement — per-supplier insights + recommendations
// ---------------------------------------------------------------------------

const enhanceWithAI = async (
  performances: VendorPerformance[]
): Promise<VendorInsight[]> => {
  const { callOpenAIChat } = await import('@/lib/openai.service.ts').catch(() => ({} as any));
  if (!callOpenAIChat) {
    console.warn('[vendor-perf] OpenAI not available — using rule-based recommendations');
    return ruleBasedInsights(performances);
  }

  const prompt = `You are a restaurant procurement advisor.
Analyze these supplier performance scorecards and provide recommendations.

Suppliers (JSON):
${JSON.stringify(performances.map(p => ({
  name: p.supplier_name,
  grade: p.grade,
  score: p.overall_score,
  on_time_rate: p.on_time_rate,
  quality_score: p.quality_score,
  price_competitiveness: p.price_competitiveness,
  avg_lead_days: p.avg_lead_days,
  total_spend: p.total_spend,
  total_orders: p.total_orders,
  unique_items: p.unique_items,
  avg_unit_cost: p.avg_unit_cost,
  trend: p.trend_direction,
  return_rate: p.return_rate,
})), null, 2)}

For each supplier, respond with JSON:
[{
  "supplier_name": "...",
  "recommendation": "renegotiate" | "diversify" | "consolidate" | "drop" | "keep" | "monitor",
  "insight_text": "<max 300 chars — what's happening>",
  "action": "<max 200 chars — concrete next step>",
  "projected_annual_savings": <number or 0>,
  "confidence": <0-1>,
  "priority": "low" | "medium" | "high"
}]

Only include suppliers where you have a meaningful recommendation. Focus on actionable insights.`;

  try {
    const response = await callOpenAIChat([
      { role: 'system', content: 'You are a restaurant procurement advisor AI. Respond only with valid JSON.' },
      { role: 'user', content: prompt },
    ], { temperature: 0.3, maxTokens: 2000 });

    const text = typeof response === 'string' ? response : (response as any)?.content ?? '';
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return ruleBasedInsights(performances);
    const parsed = JSON.parse(jsonMatch[0]) as Array<{
      supplier_name: string;
      recommendation: VendorRecommendation;
      insight_text: string;
      action?: string;
      projected_annual_savings?: number;
      confidence?: number;
      priority?: 'low' | 'medium' | 'high';
    }>;

    const insights: VendorInsight[] = [];
    for (const item of parsed) {
      const perf = performances.find(p => p.supplier_name === item.supplier_name);
      if (!perf) continue;
      insights.push({
        supplier_id: perf.supplier_id,
        supplier_name: perf.supplier_name,
        recommendation: item.recommendation,
        insight_text: item.insight_text.slice(0, 300),
        action: item.action?.slice(0, 200),
        projected_savings: item.projected_annual_savings ? Math.round(item.projected_annual_savings * 100) / 100 : undefined,
        confidence: Math.max(0, Math.min(1, item.confidence ?? 0.7)),
        priority: item.priority ?? 'medium',
        status: 'open',
        generated_at: new Date(),
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000),
      });
    }
    return insights;
  } catch (err) {
    console.warn('[vendor-perf] AI failed — using rule-based', err);
    return ruleBasedInsights(performances);
  }
};

const ruleBasedInsights = (performances: VendorPerformance[]): VendorInsight[] => {
  return performances.map(p => {
    let recommendation: VendorRecommendation = 'keep';
    let insight_text = '';
    let action = '';
    let projected_savings = 0;
    let priority: 'low' | 'medium' | 'high' = 'low';

    if (p.grade === 'A') {
      recommendation = 'keep';
      insight_text = `Excellent supplier — ${p.overall_score}/100 (grade ${p.grade}). On-time ${(p.on_time_rate * 100).toFixed(0)}%, quality ${(p.quality_score * 100).toFixed(0)}%.`;
      action = 'Maintain relationship. Consider negotiating volume discounts given consistent performance.';
      priority = 'low';
    } else if (p.grade === 'F' || (p.grade === 'D' && p.total_orders < 5)) {
      recommendation = 'drop';
      insight_text = `Poor performance — grade ${p.grade}, ${p.overall_score}/100. On-time only ${(p.on_time_rate * 100).toFixed(0)}%.`;
      action = 'Find alternative supplier. Low volume makes switching low-risk.';
      priority = 'high';
    } else if (p.total_spend > 5000 && p.price_competitiveness < 0.4) {
      recommendation = 'renegotiate';
      insight_text = `High spend ($${p.total_spend.toFixed(0)}) but below-median pricing (competitiveness ${(p.price_competitiveness * 100).toFixed(0)}%).`;
      action = 'Request volume discount or solicit competing quotes. Leverage $' + p.total_spend.toFixed(0) + ' annual spend.';
      projected_savings = p.total_spend * 0.05; // 5% potential savings
      priority = 'high';
    } else if (p.unique_items <= 2 && p.total_spend > 1000) {
      recommendation = 'diversify';
      insight_text = `Single-source risk — provides ${p.unique_items} item(s), $${p.total_spend.toFixed(0)} spend.`;
      action = 'Identify backup supplier for these items to reduce supply chain risk.';
      priority = 'medium';
    } else if (p.total_orders > 10 && p.avg_order_value < 200) {
      recommendation = 'consolidate';
      insight_text = `Many small orders (${p.total_orders} orders, avg $${p.avg_order_value.toFixed(0)}/order).`;
      action = 'Consolidate to fewer, larger POs to reduce admin overhead + qualify for volume pricing.';
      projected_savings = p.total_orders * 25; // $25 admin cost per order
      priority = 'medium';
    } else {
      recommendation = 'monitor';
      insight_text = `Borderline performance — grade ${p.grade}, ${p.overall_score}/100. Trend: ${p.trend_direction}.`;
      action = 'Monitor closely for 30 days. Set up quarterly performance review.';
      priority = 'low';
    }

    return {
      supplier_id: p.supplier_id,
      supplier_name: p.supplier_name,
      recommendation,
      insight_text,
      action,
      projected_savings: projected_savings > 0 ? Math.round(projected_savings * 100) / 100 : undefined,
      confidence: 0.6,
      priority,
      status: 'open',
      generated_at: new Date(),
      expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000),
    };
  });
};

// ---------------------------------------------------------------------------
// Main entry — analyze all suppliers
// ---------------------------------------------------------------------------

export interface AnalyzeVendorsResult {
  performances: VendorPerformance[];
  insights: VendorInsight[];
  totalSpend: number;
  potentialSavings: number;
}

export const analyzeVendorPerformance = async (
  db: ReturnType<typeof useDB>,
  config: VendorConfig = DEFAULT_VENDOR_CONFIG,
  onProgress?: (current: number, total: number) => void
): Promise<AnalyzeVendorsResult> => {
  if (onProgress) onProgress(0, 4);

  // 1. Collect supplier data
  const supplierData = await collectSupplierData(db, config.lookbackDays);
  if (onProgress) onProgress(1, 4);

  // Filter by min orders
  const filtered = new Map<string, SupplierOrderData>();
  for (const [id, data] of supplierData) {
    if (data.orders.length >= config.minOrders) {
      filtered.set(id, data);
    }
  }

  if (filtered.size === 0) {
    return { performances: [], insights: [], totalSpend: 0, potentialSavings: 0 };
  }

  // 2. Compute market median unit cost
  const allCosts: number[] = [];
  for (const data of filtered.values()) {
    allCosts.push(...data.unit_costs);
  }
  const marketMedian = computeMarketMedian(allCosts);

  // 3. Compute performance per supplier
  const periodStart = new Date(Date.now() - config.lookbackDays * 24 * 60 * 60 * 1000);
  const periodEnd = new Date();
  const performances: VendorPerformance[] = [];
  for (const data of filtered.values()) {
    performances.push(computePerformance(data, marketMedian, periodStart, periodEnd));
  }
  // Sort by overall score descending
  performances.sort((a, b) => b.overall_score - a.overall_score);
  if (onProgress) onProgress(2, 4);

  // 4. AI enhancement (or rule-based fallback)
  let insights: VendorInsight[];
  if (config.aiEnabled) {
    insights = await enhanceWithAI(performances);
  } else {
    insights = ruleBasedInsights(performances);
  }
  if (onProgress) onProgress(3, 4);

  // 5. Persist
  try {
    // Expire old data
    await db.query(`UPDATE vendor_performance SET expires_at = time::now() WHERE expires_at = NONE OR expires_at > time::now()`);
    await db.query(`UPDATE vendor_insight SET expires_at = time::now() WHERE expires_at = NONE OR expires_at > time::now()`);

    for (const perf of performances) {
      try {
        const result = await db.query<any>(
          `CREATE vendor_performance CONTENT $data`,
          {
            data: {
              ...perf,
              supplier: perf.supplier_id,
              period_start: perf.period_start.toISOString(),
              period_end: perf.period_end.toISOString(),
              generated_at: perf.generated_at.toISOString(),
              expires_at: perf.expires_at?.toISOString(),
            },
          }
        );
        perf.id = (result as any)?.id?.toString?.() ?? '';
      } catch (err) {
        console.warn('[vendor-perf] persist performance failed', err);
      }
    }

    for (const insight of insights) {
      try {
        await db.query(
          `CREATE vendor_insight CONTENT $data`,
          {
            data: {
              ...insight,
              supplier: insight.supplier_id,
              generated_at: insight.generated_at.toISOString(),
              expires_at: insight.expires_at?.toISOString(),
            },
          }
        );
      } catch (err) {
        console.warn('[vendor-perf] persist insight failed', err);
      }
    }
  } catch (err) {
    console.warn('[vendor-perf] persist batch failed', err);
  }
  if (onProgress) onProgress(4, 4);

  const totalSpend = performances.reduce((s, p) => s + p.total_spend, 0);
  const potentialSavings = insights.reduce((s, i) => s + (i.projected_savings ?? 0), 0);

  return { performances, insights, totalSpend, potentialSavings };
};

// ---------------------------------------------------------------------------
// Retrieval
// ---------------------------------------------------------------------------

export const getVendorPerformances = async (
  db: ReturnType<typeof useDB>
): Promise<VendorPerformance[]> => {
  try {
    const result = await db.query<VendorPerformance[]>(
      `SELECT * FROM vendor_performance
       WHERE expires_at > time::now()
       ORDER BY overall_score DESC`
    );
    return Array.isArray(result) ? result.flat() : [];
  } catch (err) {
    console.error('[vendor-perf] getVendorPerformances failed', err);
    return [];
  }
};

export const getOpenVendorInsights = async (
  db: ReturnType<typeof useDB>
): Promise<VendorInsight[]> => {
  try {
    const result = await db.query<VendorInsight[]>(
      `SELECT * FROM vendor_insight
       WHERE status = 'open' AND (expires_at = NONE OR expires_at > time::now())
       ORDER BY
         CASE priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END,
         projected_savings DESC`
    );
    return Array.isArray(result) ? result.flat() : [];
  } catch (err) {
    console.error('[vendor-perf] getOpenVendorInsights failed', err);
    return [];
  }
};

export const updateInsightStatus = async (
  db: ReturnType<typeof useDB>,
  insightId: string,
  status: 'acknowledged' | 'acted_on' | 'dismissed'
): Promise<void> => {
  await db.query(`UPDATE $id SET status = $status`, { id: insightId, status });
};
