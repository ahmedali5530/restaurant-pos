/**
 * AI Tip Distribution Analytics service — tip pool equity + fairness analysis.
 *
 * Research finding: Toast Tip Pool Management $25+/mo (higher tier), Square
 * Tip Reporting in Plus. POSR offers it free — analyzes tip collection,
 * distribution fairness among staff, tip % by payment method, hourly tip
 * patterns, + AI recommendations for equitable distribution.
 *
 * Metrics:
 *   - Total tips collected
 *   - Tip frequency: % of orders with tips
 *   - Avg tip %: avg tip / order total × 100
 *   - Cash vs card tip split
 *   - Per-employee tip collection + share
 *   - Gini coefficient: 0 = perfectly equal, 1 = completely unequal
 *   - Equity score: 100 - (gini × 100)
 *   - Peak tipping hour
 */

import { useDB } from '@/api/db/db.ts';
import { safeNumber } from '@/lib/utils.ts';

export interface TipAnalysis {
  id?: string;
  analysis_date: Date;
  period_start: Date;
  period_end: Date;
  total_tips: number;
  total_orders_with_tips: number;
  total_orders: number;
  tip_frequency: number;
  avg_tip_pct: number;
  avg_tip_amount: number;
  cash_tip_pct: number;
  card_tip_pct: number;
  peak_tip_hour?: number;
  per_employee?: Array<{
    name: string;
    tips_collected: number;
    orders_served: number;
    avg_tip_per_order: number;
    tip_share_pct: number;
  }>;
  gini_coefficient: number;
  equity_score: number;
  ai_insight?: string;
  ai_recommendations: string[];
  generated_at: Date;
}

export interface TipConfig {
  aiEnabled: boolean;
  lookbackDays: number;
}

export const DEFAULT_TIP_CONFIG: TipConfig = {
  aiEnabled: true,
  lookbackDays: 30,
};

export const readTipConfig = (settings: any): TipConfig => ({
  aiEnabled: settings?.tip_ai_enabled ?? true,
  lookbackDays: safeNumber(settings?.tip_lookback_days, 30),
});

// Gini coefficient computation (0 = equal, 1 = unequal)
const computeGini = (values: number[]): number => {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;
  const sum = sorted.reduce((s, v) => s + v, 0);
  if (sum === 0) return 0;
  let cumSum = 0;
  let weightedSum = 0;
  for (let i = 0; i < n; i++) {
    cumSum += sorted[i];
    weightedSum += cumSum;
  }
  return (2 * weightedSum) / (n * sum) - (n + 1) / n;
};

export const analyzeTipDistribution = async (
  db: ReturnType<typeof useDB>,
  config: TipConfig = DEFAULT_TIP_CONFIG,
  onProgress?: (current: number, total: number) => void
): Promise<TipAnalysis | null> => {
  if (onProgress) onProgress(0, 3);

  const cutoff = new Date(Date.now() - config.lookbackDays * 24 * 60 * 60 * 1000);

  // Fetch orders with tips
  let totalTips = 0;
  let totalOrdersWithTips = 0;
  let totalOrders = 0;
  let cashTips = 0;
  let cardTips = 0;
  let totalOrderValue = 0;
  let totalTipAmount = 0;
  const byHour = new Map<number, { tips: number; count: number }>();
  const byEmployee = new Map<string, { name: string; tips: number; orders: number }>();

  try {
    const result = await db.query(
      `SELECT
         id, total, tip, tip_amount, status, created_at,
         user.id AS user_id,
         user.first_name AS first_name,
         user.last_name AS last_name,
         payments
       FROM order
       WHERE created_at > $cutoff AND status = 'Paid' AND deleted_at IS NONE
       FETCH user, payments`,
      { cutoff: cutoff.toISOString() }
    );
    const rows = Array.isArray(result) ? result.flat() : [];

    for (const order of rows) {
      totalOrders++;
      const orderTotal = safeNumber(order.total, 0);
      const tip = safeNumber(order.tip_amount ?? order.tip, 0);

      if (orderTotal > 0) totalOrderValue += orderTotal;

      if (tip > 0) {
        totalOrdersWithTips++;
        totalTips += tip;
        totalTipAmount += tip;

        // Payment method
        const payments = Array.isArray(order.payments) ? order.payments : [];
        let isCash = false;
        let isCard = false;
        for (const p of payments) {
          const ptype = String(p?.payment_type?.name ?? p?.method ?? '').toLowerCase();
          if (ptype.includes('cash')) { isCash = true; cashTips += tip; break; }
          if (ptype.includes('card') || ptype.includes('credit')) { isCard = true; cardTips += tip; break; }
        }
        if (!isCash && !isCard) cardTips += tip; // default to card

        // Hour
        const hour = new Date(order.created_at).getHours();
        if (!byHour.has(hour)) byHour.set(hour, { tips: 0, count: 0 });
        byHour.get(hour)!.tips += tip;
        byHour.get(hour)!.count++;

        // Employee
        const userId = order.user_id?.toString?.() ?? '';
        const userName = `${order.first_name ?? ''} ${order.last_name ?? ''}`.trim() || 'Unknown';
        if (!byEmployee.has(userId)) byEmployee.set(userId, { name: userName, tips: 0, orders: 0 });
        byEmployee.get(userId)!.tips += tip;
      }

      // Count orders served per employee (for avg tip per order)
      if (tip > 0) {
        const userId = order.user_id?.toString?.() ?? '';
        if (byEmployee.has(userId)) byEmployee.get(userId)!.orders++;
      }
    }
  } catch (err) {
    console.error('[tip-analytics] fetch failed', err);
    return null;
  }
  if (onProgress) onProgress(1, 3);

  if (totalOrders === 0) return null;

  // Compute metrics
  const tipFrequency = (totalOrdersWithTips / totalOrders) * 100;
  const avgTipPct = totalOrderValue > 0 ? (totalTipAmount / totalOrderValue) * 100 : 0;
  const avgTipAmount = totalOrdersWithTips > 0 ? totalTipAmount / totalOrdersWithTips : 0;
  const cashPct = totalTips > 0 ? (cashTips / totalTips) * 100 : 0;
  const cardPct = totalTips > 0 ? (cardTips / totalTips) * 100 : 0;

  // Peak tipping hour
  let peakTipHour: number | undefined;
  let peakTipAmount = 0;
  for (const [hour, data] of byHour) {
    if (data.tips > peakTipAmount) { peakTipHour = hour; peakTipAmount = data.tips; }
  }

  // Per-employee breakdown
  const perEmployee = Array.from(byEmployee.values())
    .map(e => ({
      name: e.name,
      tips_collected: Math.round(e.tips * 100) / 100,
      orders_served: e.orders,
      avg_tip_per_order: Math.round((e.orders > 0 ? e.tips / e.orders : 0) * 100) / 100,
      tip_share_pct: Math.round((totalTips > 0 ? (e.tips / totalTips) * 100 : 0) * 10) / 10,
    }))
    .sort((a, b) => b.tips_collected - a.tips_collected);

  // Gini coefficient (tip distribution inequality)
  const tipValues = perEmployee.map(e => e.tips_collected);
  const gini = computeGini(tipValues);
  const equityScore = Math.round((1 - gini) * 100 * 10) / 10;

  const analysis: TipAnalysis = {
    analysis_date: new Date(),
    period_start: new Date(Date.now() - config.lookbackDays * 24 * 60 * 60 * 1000),
    period_end: new Date(),
    total_tips: Math.round(totalTips * 100) / 100,
    total_orders_with_tips: totalOrdersWithTips,
    total_orders: totalOrders,
    tip_frequency: Math.round(tipFrequency * 10) / 10,
    avg_tip_pct: Math.round(avgTipPct * 10) / 10,
    avg_tip_amount: Math.round(avgTipAmount * 100) / 100,
    cash_tip_pct: Math.round(cashPct * 10) / 10,
    card_tip_pct: Math.round(cardPct * 10) / 10,
    peak_tip_hour: peakTipHour,
    per_employee: perEmployee,
    gini_coefficient: Math.round(gini * 1000) / 1000,
    equity_score: equityScore,
    ai_recommendations: [],
    generated_at: new Date(),
  };
  if (onProgress) onProgress(2, 3);

  // AI enhancement
  if (config.aiEnabled) {
    const { callOpenAIChat } = await import('@/lib/openai.service.ts').catch(() => ({} as any));
    if (callOpenAIChat) {
      const prompt = `You are a restaurant tip distribution fairness expert.
Analyze this tip data and provide insights + recommendations.

Total tips: $${analysis.total_tips}
Orders with tips: ${analysis.total_orders_with_tips}/${analysis.total_orders} (${analysis.tip_frequency}%)
Avg tip %: ${analysis.avg_tip_pct}%
Avg tip amount: $${analysis.avg_tip_amount}
Cash tips: ${analysis.cash_tip_pct}% | Card tips: ${analysis.card_tip_pct}%
Gini coefficient: ${analysis.gini_coefficient} (0=equal, 1=unequal)
Equity score: ${analysis.equity_score}/100

Top employees:
${JSON.stringify(perEmployee.slice(0, 5), null, 2)}

Respond with JSON:
{
  "insight": "<max 300 chars — overall tip distribution assessment>",
  "recommendations": ["<max 200 chars each — actionable steps for fairness>"]
}`;

      try {
        const response = await callOpenAIChat([
          { role: 'system', content: 'You are a restaurant tip distribution AI. Respond only with valid JSON.' },
          { role: 'user', content: prompt },
        ], { temperature: 0.3, maxTokens: 600 });

        const text = typeof response === 'string' ? response : (response as any)?.content ?? '';
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          analysis.ai_insight = parsed.insight;
          analysis.ai_recommendations = Array.isArray(parsed.recommendations) ? parsed.recommendations : [];
        }
      } catch (err) {
        console.warn('[tip-analytics] AI failed', err);
      }
    }
  }
  if (onProgress) onProgress(3, 3);

  // Persist
  try {
    await db.query(`UPDATE tip_distribution_analysis SET expires_at = time::now() WHERE expires_at = NONE OR expires_at > time::now()`);
    await db.query(`CREATE tip_distribution_analysis CONTENT $data`, {
      data: {
        ...analysis,
        analysis_date: analysis.analysis_date.toISOString(),
        period_start: analysis.period_start.toISOString(),
        period_end: analysis.period_end.toISOString(),
        generated_at: analysis.generated_at.toISOString(),
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      },
    });
  } catch (err) {
    console.warn('[tip-analytics] persist failed', err);
  }

  return analysis;
};

export const getLatestTipAnalysis = async (
  db: ReturnType<typeof useDB>
): Promise<TipAnalysis | null> => {
  try {
    const result = await db.query(
      `SELECT * FROM tip_distribution_analysis
       WHERE expires_at > time::now()
       ORDER BY generated_at DESC LIMIT 1`
    );
    const list = Array.isArray(result) ? result.flat() : [];
    return list[0] ?? null;
  } catch (err) {
    console.error('[tip-analytics] getLatest failed', err);
    return null;
  }
};
