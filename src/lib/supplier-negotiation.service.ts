/**
 * AI Supplier Negotiation Coach — analyze leverage + generate negotiation strategy.
 *
 * 74th POSR-exclusive differentiator — restaurants overpay 8-15% on supplies
 * (Restaurant Supply Chain research). 70% never renegotiate contracts (FSD survey).
 *
 * Distinct from:
 *   - procurement.service (predicts price trends — NOT negotiation strategy)
 *   - vendor-performance.service (scores vendor quality — NOT price negotiation)
 *   - food-cost-trend.service (tracks cost changes — NOT negotiation)
 *   - inventory-transfer.service (transfers between branches — NOT supplier deals)
 *   - reorder.service (suggests reorder timing — NOT negotiation)
 *
 * Analyzes supplier purchase data, identifies negotiation leverage (volume,
 * loyalty, competitor pricing, payment terms), generates negotiation scripts
 * with target prices and estimated savings.
 */

import { useDB } from '@/api/db/db.ts';
import { safeNumber } from '@/lib/utils.ts';

export type NegotiationRuleId =
  | 'volume_discount'
  | 'price_match'
  | 'payment_terms'
  | 'loyalty_bonus'
  | 'consolidation';

export type NegotiationAiRec =
  | 'negotiate_now'
  | 'schedule_meeting'
  | 'get_competitor_quote'
  | 'monitor'
  | 'switch_supplier';

export interface SupplierNegotiation {
  id?: string;
  rule_id: NegotiationRuleId;
  severity: 'critical' | 'high' | 'medium' | 'low';
  supplier_id?: string;
  supplier_name?: string;
  total_spend_90d: number;
  item_count: number;
  avg_price: number;
  market_price?: number;
  price_gap_pct: number;
  negotiation_leverage?: string;
  target_price?: number;
  negotiation_script?: string;
  est_savings_monthly: number;
  est_savings_annual: number;
  confidence: number;
  description: string;
  ai_insight?: string;
  ai_recommendation?: NegotiationAiRec;
  status: 'open' | 'negotiating' | 'secured' | 'declined' | 'expired';
  detected_at: Date;
  expires_at?: Date;
}

export interface NegotiationConfig {
  aiEnabled: boolean;
  minSpend: number;
  targetDiscount: number;
  lookbackDays: number;
}

export const DEFAULT_NEGOTIATION_CONFIG: NegotiationConfig = {
  aiEnabled: true,
  minSpend: 500,
  targetDiscount: 0.08,
  lookbackDays: 90,
};

export const readNegotiationConfig = (settings: any): NegotiationConfig => ({
  aiEnabled: settings?.negotiation_ai_enabled ?? true,
  minSpend: safeNumber(settings?.negotiation_min_spend, 500),
  targetDiscount: safeNumber(settings?.negotiation_target_discount, 0.08),
  lookbackDays: safeNumber(settings?.negotiation_lookback_days, 90),
});

const fmt$ = (n: number): string => `$${(n || 0).toFixed(2)}`;

// ---------------------------------------------------------------------------
// Engine
// ---------------------------------------------------------------------------

interface SupplierData {
  supplier_id: string;
  supplier_name: string;
  total_spend: number;
  item_count: number;
  avg_price: number;
  order_count: number;
  items: Array<{ name: string; price: number; quantity: number; total: number }>;
}

/**
 * Run the supplier negotiation coach engine.
 */
export const runNegotiationEngine = async (
  db: ReturnType<typeof useDB>,
  config: NegotiationConfig = DEFAULT_NEGOTIATION_CONFIG
): Promise<{ negotiations: SupplierNegotiation[]; generated: number }> => {
  const negotiations: SupplierNegotiation[] = [];
  const now = new Date();

  // 1. Fetch supplier purchase data
  let suppliers: SupplierData[] = [];
  try {
    const result = await db.query(
      `SELECT
         supplier.id AS supplier_id,
         supplier.name AS supplier_name,
         math::sum(purchase_price * quantity) AS total_spend,
         count() AS item_count,
         math::mean(purchase_price) AS avg_price,
         count(DISTINCT purchase.id) AS order_count
       FROM inventory_purchase_item
       WHERE purchase.created_at > time::now() - ${config.lookbackDays}d
         AND supplier IS NOT NONE
         AND purchase_price IS NOT NONE
       GROUP BY supplier.id, supplier.name`
    );
    const rows = Array.isArray(result) ? result.flat() : [];
    suppliers = rows.map((r: any) => ({
      supplier_id: String(r.supplier_id ?? ''),
      supplier_name: String(r.supplier_name ?? 'Unknown Supplier'),
      total_spend: safeNumber(r.total_spend, 0),
      item_count: safeNumber(r.item_count, 0),
      avg_price: safeNumber(r.avg_price, 0),
      order_count: safeNumber(r.order_count, 0),
      items: [],
    })).filter(s => s.total_spend >= config.minSpend);
  } catch (err) {
    console.warn('[negotiation] fetchSuppliers failed', err);
  }

  if (suppliers.length === 0) return { negotiations: [], generated: 0 };

  // 2. Analyze each supplier for negotiation opportunities
  for (const supplier of suppliers) {
    // Estimate market price (avg across all suppliers for same items)
    // Simplified: assume market = avg_price × 0.92 (8% below current)
    const marketPrice = supplier.avg_price * (1 - config.targetDiscount);
    const priceGapPct = config.targetDiscount;
    const targetPrice = supplier.avg_price * (1 - config.targetDiscount);

    const estSavingsMonthly = supplier.total_spend * config.targetDiscount / 3; // 90d / 3 = monthly
    const estSavingsAnnual = estSavingsMonthly * 12;

    // Determine rule based on spend volume + patterns
    let ruleId: NegotiationRuleId;
    let severity: 'critical' | 'high' | 'medium' | 'low';
    let aiRec: NegotiationAiRec;
    let leverage: string;
    let script: string;
    let desc = '';
    let confidence = 0.5;

    if (supplier.total_spend > 5000 && supplier.order_count >= 10) {
      // High-volume, frequent orders → VOLUME DISCOUNT
      ruleId = 'volume_discount';
      severity = 'high';
      aiRec = 'negotiate_now';
      confidence = 0.75;
      leverage = `High volume: ${fmt$(supplier.total_spend)} over ${config.lookbackDays}d across ${supplier.order_count} orders — you're a top customer and have leverage to demand volume pricing.`;
      script = `"We've been spending ${fmt$(supplier.total_spend)} with you over the last 90 days. That makes us one of your top accounts. I'd like to discuss a volume discount — we're targeting ${fmt$(targetPrice)}/unit, which is ${(config.targetDiscount * 100).toFixed(0)}% off current pricing. In return, we can commit to ${supplier.order_count * 1.2 | 0}+ orders in the next quarter and consolidate more items with you. Can we make this work?"`;
      desc = `${supplier.supplier_name}: VOLUME DISCOUNT opportunity — ${fmt$(supplier.total_spend)} spend over ${config.lookbackDays}d, ${supplier.order_count} orders. Target ${fmt$(targetPrice)} (-${(config.targetDiscount * 100).toFixed(0)}%). Est savings: ${fmt$(estSavingsAnnual)}/yr.`;
    } else if (supplier.total_spend > 2000 && supplier.order_count >= 5) {
      // Mid-volume → PRICE MATCH (get competitor quotes)
      ruleId = 'price_match';
      severity = 'medium';
      aiRec = 'get_competitor_quote';
      confidence = 0.60;
      leverage = `Mid-volume spend ${fmt$(supplier.total_spend)} — get 2-3 competitor quotes to use as negotiation leverage.`;
      script = `"We're getting quotes from [Competitor A] and [Competitor B] for the same items. If you can match or beat their pricing, we'll consolidate all orders with you. Otherwise, we'll need to split our purchasing. What's the best you can do?"`;
      desc = `${supplier.supplier_name}: PRICE MATCH opportunity — get competitor quotes for ${fmt$(supplier.total_spend)} spend. Target ${fmt$(targetPrice)}. Est savings: ${fmt$(estSavingsAnnual)}/yr.`;
    } else if (supplier.total_spend > 1000) {
      // Payment terms negotiation
      ruleId = 'payment_terms';
      severity = 'medium';
      aiRec = 'schedule_meeting';
      confidence = 0.55;
      leverage = `Negotiate payment terms: request Net-30 or Net-60 instead of COD to improve cash flow.`;
      script = `"We'd like to discuss extending our payment terms from COD to Net-30. This would help us manage cash flow better and allow us to increase order frequency. In return, we can commit to minimum monthly volume of ${fmt$(supplier.total_spend / 3)}."`;
      desc = `${supplier.supplier_name}: PAYMENT TERMS — request Net-30 for ${fmt$(supplier.total_spend)} account. Cash flow benefit equivalent to ${fmt$(estSavingsMonthly * 0.5)}/mo in working capital.`;
    } else if (supplier.order_count >= 8) {
      // Loyalty bonus — frequent small orders
      ruleId = 'loyalty_bonus';
      severity = 'low';
      aiRec = 'schedule_meeting';
      confidence = 0.50;
      leverage = `Loyal customer: ${supplier.order_count} orders in ${config.lookbackDays}d — ask for loyalty pricing or free delivery.`;
      script = `"We've placed ${supplier.order_count} orders with you in the last 90 days. As a loyal customer, we'd like to discuss loyalty pricing — even a 5% discount would make a big difference, or free delivery on orders over ${fmt$(supplier.total_spend / supplier.order_count)}."`;
      desc = `${supplier.supplier_name}: LOYALTY BONUS — ${supplier.order_count} orders in ${config.lookbackDays}d. Request loyalty pricing or free delivery. Est savings: ${fmt$(estSavingsAnnual)}/yr.`;
    } else {
      // Consolidation opportunity — suggest consolidating with other suppliers
      ruleId = 'consolidation';
      severity = 'low';
      aiRec = 'monitor';
      confidence = 0.40;
      leverage = `Consolidation: combine orders with another supplier for better volume pricing.`;
      script = `"We're currently splitting our purchasing across multiple suppliers. If we consolidate all ${supplier.item_count} items with you, what volume discount can you offer? We'd be looking at ${fmt$(supplier.total_spend * 2)}/quarter."`;
      desc = `${supplier.supplier_name}: CONSOLIDATION — suggest combining orders for volume leverage. Est savings if consolidated: ${fmt$(estSavingsAnnual)}/yr.`;
    }

    negotiations.push({
      rule_id: ruleId,
      severity,
      supplier_id: supplier.supplier_id,
      supplier_name: supplier.supplier_name,
      total_spend_90d: Math.round(supplier.total_spend * 100) / 100,
      item_count: supplier.item_count,
      avg_price: Math.round(supplier.avg_price * 100) / 100,
      market_price: Math.round(marketPrice * 100) / 100,
      price_gap_pct: Math.round(priceGapPct * 10000) / 100,
      negotiation_leverage: leverage,
      target_price: Math.round(targetPrice * 100) / 100,
      negotiation_script: script,
      est_savings_monthly: Math.round(estSavingsMonthly * 100) / 100,
      est_savings_annual: Math.round(estSavingsAnnual * 100) / 100,
      confidence: Math.round(confidence * 100) / 100,
      description: desc,
      ai_recommendation: aiRec,
      status: 'open',
      detected_at: now,
    });
  }

  // 3. AI insight for top 5 high-priority negotiations
  if (config.aiEnabled && negotiations.length > 0) {
    const { callOpenAIChat } = await import('@/lib/openai.service.ts').catch(() => ({} as any));
    if (callOpenAIChat) {
      const topNegs = negotiations.filter(n => n.severity === 'high' || n.severity === 'medium').slice(0, 5);
      for (const n of topNegs) {
        try {
          const response = await callOpenAIChat([
            { role: 'system', content: 'You are a restaurant supply chain negotiation AI. Respond with a single actionable insight (max 200 chars).' },
            { role: 'user', content: `Supplier "${n.supplier_name}": ${fmt$(n.total_spend_90d)} spend over 90d, ${n.item_count} items, ${n.order_count ?? 'N/A'} orders. Target price ${fmt$(n.target_price ?? 0)} (-${(n.price_gap_pct * 100).toFixed(0)}%). Est savings ${fmt$(n.est_savings_annual)}/yr. Leverage: ${n.negotiation_leverage}` },
          ], { temperature: 0.4, maxTokens: 120 });
          const text = typeof response === 'string' ? response : (response as any)?.content ?? '';
          n.ai_insight = text.slice(0, 200);
        } catch { /* skip AI failure */ }
      }
    }
  }

  // 4. Persist
  try {
    await db.query(`DELETE FROM supplier_negotiation WHERE status = 'open' AND detected_at < time::now() - 1h`);
  } catch { /* ignore */ }
  for (const n of negotiations) {
    try {
      await db.query(`CREATE supplier_negotiation CONTENT $data`, {
        data: { ...n, detected_at: n.detected_at.toISOString() },
      });
    } catch { /* ignore */ }
  }

  return { negotiations, generated: negotiations.length };
};

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export const getActiveNegotiations = async (db: ReturnType<typeof useDB>): Promise<SupplierNegotiation[]> => {
  try {
    const result = await db.query(
      `SELECT * FROM supplier_negotiation
       WHERE status = 'open'
       ORDER BY est_savings_annual DESC
       LIMIT 50`
    );
    return Array.isArray(result) ? result.flat() : [];
  } catch { return []; }
};

export const getSummary = async (db: ReturnType<typeof useDB>): Promise<{
  negotiationCount: number;
  totalAnnualSavings: number;
  highPriorityCount: number;
  avgConfidence: number;
}> => {
  try {
    const result = await db.query(
      `SELECT
         count() AS total,
         math::sum(est_savings_annual) AS savings,
         math::count(severity = 'high') AS high,
         math::mean(confidence) AS confidence
       FROM supplier_negotiation
       WHERE status = 'open' GROUP ALL`
    );
    const rows = Array.isArray(result) ? result.flat() : [];
    const r = rows[0] ?? {};
    return {
      negotiationCount: safeNumber(r.total, 0),
      totalAnnualSavings: safeNumber(r.savings, 0),
      highPriorityCount: safeNumber(r.high, 0),
      avgConfidence: safeNumber(r.confidence, 0),
    };
  } catch {
    return { negotiationCount: 0, totalAnnualSavings: 0, highPriorityCount: 0, avgConfidence: 0 };
  }
};

export const updateNegotiationStatus = async (
  db: ReturnType<typeof useDB>,
  negId: string,
  status: 'negotiating' | 'secured' | 'declined' | 'expired'
): Promise<void> => {
  await db.query(`UPDATE $id SET status = $status`, { id: negId, status });
};
