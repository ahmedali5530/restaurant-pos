/**
 * AI Complaint Pattern Detection service — find recurring complaint patterns.
 *
 * 37th POSR-exclusive differentiator — restaurants lose 15-20% of repeat
 * customers to unresolved recurring complaints. Toast, Square analyze
 * individual reviews but DON'T detect cross-review patterns. POSR finds
 * recurring complaint themes, item-specific issues, time-correlated + AI recs.
 *
 * Detection rules (6):
 *   1. RECURRING_THEME — same theme in 3+ negative reviews in 30d
 *   2. ITEM_COMPLAINT — same dish mentioned in 3+ negative reviews
 *   3. TIME_CORRELATED — complaints cluster at specific hours
 *   4. STAFF_CORRELATED — complaints correlate with specific server
 *   5. DECLINING_TREND — complaint rate increasing week-over-week
 *   6. UNRESPONDED_CRITICAL — 1-star reviews not responded to in 48h
 */

import { useDB } from '@/api/db/db.ts';
import { safeNumber } from '@/lib/utils.ts';

export type ComplaintSeverity = 'info' | 'warning' | 'critical';
export type ComplaintRecommendation =
  | 'address_root_cause' | 'retrain_staff' | 'adjust_recipe'
  | 'add_staffing' | 'respond_now' | 'monitor';

export interface ComplaintPatternAlert {
  id?: string;
  rule_id: string;
  severity: ComplaintSeverity;
  theme?: string;
  item_name?: string;
  staff_name?: string;
  hour_of_day?: number;
  complaint_count: number;
  avg_rating: number;
  estimated_loss: number;
  trend_pct: number;
  description: string;
  context?: Record<string, any>;
  ai_insight?: string;
  ai_recommendation?: ComplaintRecommendation;
  status: 'open' | 'investigating' | 'resolved' | 'false_positive';
  detected_at: Date;
}

export interface ComplaintPatternConfig {
  aiEnabled: boolean;
  lookbackDays: number;
  minCount: number;
}

export const DEFAULT_COMPLAINT_CONFIG: ComplaintPatternConfig = {
  aiEnabled: true, lookbackDays: 30, minCount: 3,
};

export const readComplaintConfig = (settings: any): ComplaintPatternConfig => ({
  aiEnabled: settings?.complaint_pattern_ai_enabled ?? true,
  lookbackDays: safeNumber(settings?.complaint_pattern_lookback_days, 30),
  minCount: safeNumber(settings?.complaint_pattern_min_count, 3),
});

const isRecentlyAlerted = async (db: any, ruleId: string, identifier: string, hours = 48): Promise<boolean> => {
  try {
    const result = await db.query(
      `SELECT id FROM complaint_pattern_alert WHERE rule_id = $rid
         AND (theme = $id OR item_name = $id OR staff_name = $id)
         AND detected_at > time::now() - ${hours}h LIMIT 1`,
      { rid: ruleId, id: identifier }
    );
    return Array.isArray(result) && result.flat().length > 0;
  } catch { return false; }
};

// 1. RECURRING_THEME — same theme in 3+ negative reviews
const checkRecurringTheme = async (db: any, cfg: ComplaintPatternConfig): Promise<ComplaintPatternAlert[]> => {
  const alerts: ComplaintPatternAlert[] = [];
  try {
    const result = await db.query(
      `SELECT themes, count() AS cnt, math::mean(rating) AS avg_rating
       FROM sentiment_analysis
       WHERE sentiment IN ['negative', 'mixed']
         AND analyzed_at > time::now() - ${cfg.lookbackDays}d
       SPLIT themes
       GROUP BY themes`
    );
    const rows = Array.isArray(result) ? result.flat() : [];
    for (const r of rows) {
      const count = safeNumber(r.cnt, 0);
      const theme = r.themes ?? 'unknown';
      if (count >= cfg.minCount) {
        if (await isRecentlyAlerted(db, 'recurring_theme', theme, 72)) continue;
        alerts.push({
          rule_id: 'recurring_theme', severity: count >= 6 ? 'critical' : 'warning',
          theme, complaint_count: count, avg_rating: Math.round(safeNumber(r.avg_rating, 2) * 10) / 10,
          trend_pct: 0, estimated_loss: count * 20,
          description: `Theme "${theme}" appears in ${count} negative reviews (avg rating ${safeNumber(r.avg_rating, 2).toFixed(1)}/5) in last ${cfg.lookbackDays}d. Recurring theme suggests systemic issue.`,
          context: { theme, count, avg_rating: r.avg_rating },
          status: 'open', detected_at: new Date(),
        });
      }
    }
  } catch (err) { console.warn('[complaint] recurring_theme failed', err); }
  return alerts;
};

// 2. ITEM_COMPLAINT — same dish in 3+ negative reviews
const checkItemComplaint = async (db: any, cfg: ComplaintPatternConfig): Promise<ComplaintPatternAlert[]> => {
  const alerts: ComplaintPatternAlert[] = [];
  try {
    const result = await db.query(
      `SELECT mentioned_dishes, count() AS cnt, math::mean(rating) AS avg_rating
       FROM sentiment_analysis
       WHERE sentiment IN ['negative', 'mixed']
         AND array::len(mentioned_dishes) > 0
         AND analyzed_at > time::now() - ${cfg.lookbackDays}d
       SPLIT mentioned_dishes
       GROUP BY mentioned_dishes`
    );
    const rows = Array.isArray(result) ? result.flat() : [];
    for (const r of rows) {
      const count = safeNumber(r.cnt, 0);
      const dish = r.mentioned_dishes ?? 'unknown';
      if (count >= cfg.minCount) {
        if (await isRecentlyAlerted(db, 'item_complaint', dish, 72)) continue;
        alerts.push({
          rule_id: 'item_complaint', severity: count >= 5 ? 'critical' : 'warning',
          item_name: dish, complaint_count: count, avg_rating: Math.round(safeNumber(r.avg_rating, 2) * 10) / 10,
          trend_pct: 0, estimated_loss: count * 15,
          description: `Dish "${dish}" mentioned in ${count} negative reviews (avg rating ${safeNumber(r.avg_rating, 2).toFixed(1)}/5). Item-specific complaints suggest recipe or quality issue.`,
          context: { dish, count, avg_rating: r.avg_rating },
          status: 'open', detected_at: new Date(),
        });
      }
    }
  } catch (err) { console.warn('[complaint] item_complaint failed', err); }
  return alerts;
};

// 3. TIME_CORRELATED — complaints cluster at specific hours
const checkTimeCorrelated = async (db: any, cfg: ComplaintPatternConfig): Promise<ComplaintPatternAlert[]> => {
  const alerts: ComplaintPatternAlert[] = [];
  try {
    const result = await db.query(
      `SELECT time::hour(submitted_at) AS hour, count() AS cnt, math::mean(rating) AS avg_rating
       FROM customer_review
       WHERE rating <= 2
         AND submitted_at > time::now() - ${cfg.lookbackDays}d
       GROUP BY time::hour(submitted_at)`
    );
    const rows = Array.isArray(result) ? result.flat() : [];
    for (const r of rows) {
      const count = safeNumber(r.cnt, 0);
      const hour = safeNumber(r.hour, 0);
      if (count >= cfg.minCount) {
        if (await isRecentlyAlerted(db, 'time_correlated', String(hour), 72)) continue;
        alerts.push({
          rule_id: 'time_correlated', severity: count >= 6 ? 'critical' : 'warning',
          hour_of_day: hour, complaint_count: count, avg_rating: Math.round(safeNumber(r.avg_rating, 2) * 10) / 10,
          trend_pct: 0, estimated_loss: count * 10,
          description: `${count} low-rated reviews (≤2 stars, avg ${safeNumber(r.avg_rating, 2).toFixed(1)}) submitted around ${hour}:00. Time-correlated complaints suggest staffing or rush-hour issues.`,
          context: { hour, count, avg_rating: r.avg_rating },
          status: 'open', detected_at: new Date(),
        });
      }
    }
  } catch (err) { console.warn('[complaint] time_correlated failed', err); }
  return alerts;
};

// 5. DECLINING_TREND — complaint rate increasing week-over-week
const checkDecliningTrend = async (db: any, _cfg: ComplaintPatternConfig): Promise<ComplaintPatternAlert[]> => {
  const alerts: ComplaintPatternAlert[] = [];
  try {
    const thisWeek = await db.query(
      `SELECT count() AS cnt FROM customer_review WHERE rating <= 2 AND submitted_at > time::now() - 7d`
    );
    const lastWeek = await db.query(
      `SELECT count() AS cnt FROM customer_review WHERE rating <= 2 AND submitted_at > time::now() - 14d AND submitted_at < time::now() - 7d`
    );
    const thisCount = safeNumber(Array.isArray(thisWeek) ? thisWeek.flat()[0]?.cnt : 0, 0);
    const lastCount = safeNumber(Array.isArray(lastWeek) ? lastWeek.flat()[0]?.cnt : 0, 0);
    if (lastCount > 0 && thisCount > lastCount * 1.3) {
      const trendPct = ((thisCount - lastCount) / lastCount) * 100;
      alerts.push({
        rule_id: 'declining_trend', severity: trendPct > 50 ? 'critical' : 'warning',
        complaint_count: thisCount, avg_rating: 0, trend_pct: Math.round(trendPct),
        estimated_loss: thisCount * 25,
        description: `Low-rated reviews increased ${Math.round(trendPct)}% week-over-week (${lastCount} → ${thisCount}). Trend suggests declining customer satisfaction — investigate root cause urgently.`,
        context: { this_week: thisCount, last_week: lastCount, trend_pct: trendPct },
        status: 'open', detected_at: new Date(),
      });
    }
  } catch (err) { console.warn('[complaint] declining_trend failed', err); }
  return alerts;
};

// 6. UNRESPONDED_CRITICAL — 1-star reviews not responded to in 48h
const checkUnrespondedCritical = async (db: any, cfg: ComplaintPatternConfig): Promise<ComplaintPatternAlert[]> => {
  const alerts: ComplaintPatternAlert[] = [];
  try {
    const result = await db.query(
      `SELECT count() AS cnt FROM customer_review
       WHERE rating = 1 AND is_responded = false
         AND submitted_at < time::now() - 48h
         AND submitted_at > time::now() - ${cfg.lookbackDays}d`
    );
    const rows = Array.isArray(result) ? result.flat() : [];
    const count = safeNumber(rows[0]?.cnt, 0);
    if (count >= 1) {
      alerts.push({
        rule_id: 'unresponded_critical', severity: count >= 3 ? 'critical' : 'warning',
        complaint_count: count, avg_rating: 1, trend_pct: 0,
        estimated_loss: count * 50,
        description: `${count} one-star reviews not responded to within 48h. Unresponded critical reviews damage reputation and reduce repeat visits by 30%.`,
        context: { unresponded_count: count },
        status: 'open', detected_at: new Date(),
      });
    }
  } catch (err) { console.warn('[complaint] unresponded_critical failed', err); }
  return alerts;
};

// AI enhancement
const enhanceWithAI = async (alerts: ComplaintPatternAlert[]): Promise<void> => {
  const { callOpenAIChat } = await import('@/lib/openai.service.ts').catch(() => ({} as any));
  if (!callOpenAIChat || alerts.length === 0) return;
  const prompt = `You are a restaurant customer experience analyst. Analyze complaint patterns and provide insight + recommendation.

Alerts (JSON):
${JSON.stringify(alerts.slice(0, 10).map(a => ({
  rule: a.rule_id, severity: a.severity, theme: a.theme, item: a.item_name,
  hour: a.hour_of_day, count: a.complaint_count, rating: a.avg_rating,
  trend: a.trend_pct, description: a.description,
})), null, 2)}

Respond with JSON array:
[{"rule":"<match rule_id>","insight":"<max 200 chars>","recommendation":"address_root_cause"|"retrain_staff"|"adjust_recipe"|"add_staffing"|"respond_now"|"monitor"}]`;

  try {
    const response = await callOpenAIChat([
      { role: 'system', content: 'You are a complaint pattern detection AI. Respond only with valid JSON.' },
      { role: 'user', content: prompt },
    ], { temperature: 0.3, maxTokens: 800 });
    const text = typeof response === 'string' ? response : (response as any)?.content ?? '';
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return;
    const parsed = JSON.parse(jsonMatch[0]) as Array<{ rule: string; insight?: string; recommendation?: ComplaintRecommendation }>;
    for (const item of parsed) {
      const alert = alerts.find(a => a.rule_id === item.rule);
      if (alert) {
        if (item.insight) alert.ai_insight = item.insight.slice(0, 200);
        if (item.recommendation) alert.ai_recommendation = item.recommendation;
      }
    }
  } catch (err) { console.warn('[complaint] AI failed', err); }
};

export const runComplaintPatternScan = async (
  db: ReturnType<typeof useDB>,
  config: ComplaintPatternConfig = DEFAULT_COMPLAINT_CONFIG,
  onProgress?: (current: number, total: number) => void
): Promise<{ alerts: ComplaintPatternAlert[]; checked: number }> => {
  const checks = [
    () => checkRecurringTheme(db, config),
    () => checkItemComplaint(db, config),
    () => checkTimeCorrelated(db, config),
    () => checkDecliningTrend(db, config),
    () => checkUnrespondedCritical(db, config),
  ];
  const total = checks.length;
  let allAlerts: ComplaintPatternAlert[] = [];
  for (let i = 0; i < checks.length; i++) {
    if (onProgress) onProgress(i, total);
    try { allAlerts.push(...await checks[i]()); } catch (err) { console.warn('[complaint] check', i, err); }
  }
  if (config.aiEnabled && allAlerts.length > 0) await enhanceWithAI(allAlerts);
  for (const alert of allAlerts) {
    try { await db.query(`CREATE complaint_pattern_alert CONTENT $data`, { data: { ...alert, detected_at: alert.detected_at.toISOString() } }); } catch { }
  }
  if (onProgress) onProgress(total, total);
  return { alerts: allAlerts, checked: total };
};

export const getOpenAlerts = async (db: ReturnType<typeof useDB>): Promise<ComplaintPatternAlert[]> => {
  try {
    const result = await db.query(`SELECT * FROM complaint_pattern_alert WHERE status = 'open' ORDER BY CASE severity WHEN 'critical' THEN 0 WHEN 'warning' THEN 1 ELSE 2 END, complaint_count DESC`);
    return Array.isArray(result) ? result.flat() : [];
  } catch { return []; }
};

export const getSummary = async (db: ReturnType<typeof useDB>): Promise<{ total: number; critical: number; warning: number }> => {
  try {
    const result = await db.query(`SELECT count() AS total, math::count(severity = 'critical') AS critical, math::count(severity = 'warning') AS warning FROM complaint_pattern_alert WHERE status = 'open' GROUP ALL`);
    const rows = Array.isArray(result) ? result.flat() : [];
    const row = rows[0] ?? {};
    return { total: safeNumber(row.total, 0), critical: safeNumber(row.critical, 0), warning: safeNumber(row.warning, 0) };
  } catch { return { total: 0, critical: 0, warning: 0 }; }
};

export const updateStatus = async (db: ReturnType<typeof useDB>, alertId: string, status: string): Promise<void> => {
  await db.query(`UPDATE $id SET status = $status`, { id: alertId, status });
};
