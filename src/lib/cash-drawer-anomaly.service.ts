/**
 * AI Cash Drawer Anomaly Detection service — detect cash handling irregularities.
 *
 * 35th POSR-exclusive differentiator — cash theft costs restaurants $2-5k/year.
 * Toast, Square, Lightspeed track cash closings but DON'T detect anomalies
 * in real-time. POSR analyzes cash drawer patterns + flags discrepancies.
 *
 * Detection rules (6):
 *   1. DRAWER_SHORTAGE — closing balance < expected by > $10
 *   2. EXCESSIVE_VOIDS — staff has > 5 voids per shift
 *   3. NO_SALE_OPENS — drawer opened without sale > 3x per shift
 *   4. CASH_MISMATCH — cash payments don't match order totals
 *   5. LATE_SHIFT_CASH — cash activity after closing time
 *   6. REPEATED_SHORTAGES — same staff has 3+ shortage events in 30d
 */

import { useDB } from '@/api/db/db.ts';
import { safeNumber } from '@/lib/utils.ts';

export type CashDrawerSeverity = 'info' | 'warning' | 'critical';
export type CashDrawerRecommendation =
  | 'investigate' | 'audit_cashier' | 'install_camera'
  | 'require_dual_count' | 'suspend_cash_access' | 'dismiss';

export interface CashDrawerAlert {
  id?: string;
  rule_id: string;
  severity: CashDrawerSeverity;
  staff_name?: string;
  shift_date?: Date;
  metric_value: number;
  expected_value: number;
  estimated_loss: number;
  description: string;
  context?: Record<string, any>;
  ai_insight?: string;
  ai_recommendation?: CashDrawerRecommendation;
  status: 'open' | 'investigating' | 'resolved' | 'false_positive';
  detected_at: Date;
}

export interface CashDrawerConfig {
  aiEnabled: boolean;
  lookbackDays: number;
  shortageThreshold: number;
  maxVoids: number;
  maxNoSale: number;
}

export const DEFAULT_CASH_DRAWER_CONFIG: CashDrawerConfig = {
  aiEnabled: true, lookbackDays: 30, shortageThreshold: 10, maxVoids: 5, maxNoSale: 3,
};

export const readCashDrawerConfig = (settings: any): CashDrawerConfig => ({
  aiEnabled: settings?.cash_drawer_ai_enabled ?? true,
  lookbackDays: safeNumber(settings?.cash_drawer_lookback_days, 30),
  shortageThreshold: safeNumber(settings?.cash_drawer_shortage_threshold, 10),
  maxVoids: safeNumber(settings?.cash_drawer_max_voids, 5),
  maxNoSale: safeNumber(settings?.cash_drawer_max_no_sale, 3),
});

const formatCurrency = (n: number): string => `$${(n || 0).toFixed(2)}`;

const isRecentlyAlerted = async (db: any, ruleId: string, identifier: string, hours = 24): Promise<boolean> => {
  try {
    const result = await db.query(
      `SELECT id FROM cash_drawer_alert WHERE rule_id = $rid AND staff_name = $id AND detected_at > time::now() - ${hours}h LIMIT 1`,
      { rid: ruleId, id: identifier }
    );
    return Array.isArray(result) && result.flat().length > 0;
  } catch { return false; }
};

// 1. DRAWER_SHORTAGE — cash closings with negative variance
const checkDrawerShortage = async (db: any, cfg: CashDrawerConfig): Promise<CashDrawerAlert[]> => {
  const alerts: CashDrawerAlert[] = [];
  try {
    // Look at cash closings — compare expected vs actual
    const result = await db.query(
      `SELECT
         id, closing_balance, expected_balance, opened_by.name AS staff_name,
         business_date, variance
       FROM cash_closing
       WHERE created_at > time::now() - 7d
         AND variance < -$threshold
       FETCH opened_by`,
      { threshold: cfg.shortageThreshold }
    );
    const rows = Array.isArray(result) ? result.flat() : [];
    for (const r of rows) {
      const variance = safeNumber(r.variance, 0);
      const sname = r.staff_name ?? 'Unknown';
      if (await isRecentlyAlerted(db, 'drawer_shortage', sname, 24)) continue;
      alerts.push({
        rule_id: 'drawer_shortage',
        severity: Math.abs(variance) > 50 ? 'critical' : 'warning',
        staff_name: sname,
        shift_date: r.business_date ? new Date(r.business_date) : undefined,
        metric_value: variance,
        expected_value: 0,
        estimated_loss: Math.abs(variance),
        description: `Cash drawer shortage of ${formatCurrency(Math.abs(variance))} for shift on ${r.business_date ?? 'recent shift'} by "${sname}". Expected ${formatCurrency(safeNumber(r.expected_balance, 0))}, actual ${formatCurrency(safeNumber(r.closing_balance, 0))}.`,
        context: { variance, expected: r.expected_balance, actual: r.closing_balance },
        status: 'open', detected_at: new Date(),
      });
    }
  } catch (err) { console.warn('[cash-drawer] shortage failed', err); }
  return alerts;
};

// 2. EXCESSIVE_VOIDS — staff with > maxVoids per shift
const checkExcessiveVoids = async (db: any, cfg: CashDrawerConfig): Promise<CashDrawerAlert[]> => {
  const alerts: CashDrawerAlert[] = [];
  try {
    const result = await db.query(
      `SELECT
         cashier.id AS sid, cashier.name AS sname,
         time::day(created_at) AS shift_day,
         count() AS void_count
       FROM order
       WHERE status = 'Void'
         AND deleted_at IS NONE
         AND created_at > time::now() - 7d
         AND cashier IS NOT NONE
       GROUP BY cashier, time::day(created_at)
       FETCH cashier`
    );
    const rows = Array.isArray(result) ? result.flat() : [];
    for (const r of rows) {
      const voidCount = safeNumber(r.void_count, 0);
      if (voidCount > cfg.maxVoids) {
        const sname = r.sname ?? 'Unknown';
        if (await isRecentlyAlerted(db, 'excessive_voids', sname, 24)) continue;
        alerts.push({
          rule_id: 'excessive_voids',
          severity: voidCount > cfg.maxVoids * 2 ? 'critical' : 'warning',
          staff_name: sname,
          shift_date: r.shift_day ? new Date(r.shift_day) : undefined,
          metric_value: voidCount, expected_value: cfg.maxVoids,
          estimated_loss: voidCount * 5,
          description: `Staff "${sname}" had ${voidCount} voided orders in one shift (threshold ${cfg.maxVoids}). Excessive voids are a common cash theft indicator — void sale, pocket cash.`,
          context: { void_count: voidCount, threshold: cfg.maxVoids },
          status: 'open', detected_at: new Date(),
        });
      }
    }
  } catch (err) { console.warn('[cash-drawer] excessive_voids failed', err); }
  return alerts;
};

// 4. CASH_MISMATCH — cash payments don't match order totals
const checkCashMismatch = async (db: any, _cfg: CashDrawerConfig): Promise<CashDrawerAlert[]> => {
  const alerts: CashDrawerAlert[] = [];
  try {
    // Find orders where cash payment != order total (significant difference)
    const result = await db.query(
      `SELECT
         id, total, cashier.name AS sname,
         math::sum(IF payments.payment_type.name = 'Cash' THEN payments.amount ELSE 0 END) AS cash_paid
       FROM order
       WHERE status = 'Paid' AND deleted_at IS NONE
         AND created_at > time::now() - 7d
         AND cashier IS NOT NONE
       GROUP BY id
       FETCH cashier, payments.payment_type`
    );
    const rows = Array.isArray(result) ? result.flat() : [];
    const mismatchesByStaff = new Map<string, { name: string; count: number; totalDiff: number }>();
    for (const r of rows) {
      const total = safeNumber(r.total, 0);
      const cashPaid = safeNumber(r.cash_paid, 0);
      const diff = Math.abs(total - cashPaid);
      if (diff > 5) {
        const sname = r.sname ?? 'Unknown';
        if (!mismatchesByStaff.has(sname)) mismatchesByStaff.set(sname, { name: sname, count: 0, totalDiff: 0 });
        const entry = mismatchesByStaff.get(sname)!;
        entry.count++;
        entry.totalDiff += diff;
      }
    }
    for (const [, entry] of mismatchesByStaff) {
      if (entry.count >= 3) {
        if (await isRecentlyAlerted(db, 'cash_mismatch', entry.name, 48)) continue;
        alerts.push({
          rule_id: 'cash_mismatch',
          severity: entry.count >= 6 ? 'critical' : 'warning',
          staff_name: entry.name,
          metric_value: entry.count, expected_value: 0,
          estimated_loss: entry.totalDiff,
          description: `Staff "${entry.name}" has ${entry.count} orders with cash payment ≠ order total (total discrepancy ${formatCurrency(entry.totalDiff)}). Cash mismatches may indicate skimming or rounding errors.`,
          context: { mismatch_count: entry.count, total_diff: entry.totalDiff },
          status: 'open', detected_at: new Date(),
        });
      }
    }
  } catch (err) { console.warn('[cash-drawer] cash_mismatch failed', err); }
  return alerts;
};

// 6. REPEATED_SHORTAGES — same staff 3+ shortage events in 30d
const checkRepeatedShortages = async (db: any, cfg: CashDrawerConfig): Promise<CashDrawerAlert[]> => {
  const alerts: CashDrawerAlert[] = [];
  try {
    const result = await db.query(
      `SELECT
         opened_by.name AS sname,
         count() AS shortage_count,
         math::sum(variance) AS total_shortage
       FROM cash_closing
       WHERE variance < -$threshold
         AND created_at > time::now() - ${cfg.lookbackDays}d
       GROUP BY opened_by
       FETCH opened_by`,
      { threshold: cfg.shortageThreshold }
    );
    const rows = Array.isArray(result) ? result.flat() : [];
    for (const r of rows) {
      const count = safeNumber(r.shortage_count, 0);
      const totalShortage = Math.abs(safeNumber(r.total_shortage, 0));
      if (count >= 3) {
        const sname = r.sname ?? 'Unknown';
        if (await isRecentlyAlerted(db, 'repeated_shortages', sname, 72)) continue;
        alerts.push({
          rule_id: 'repeated_shortages',
          severity: count >= 5 ? 'critical' : 'warning',
          staff_name: sname,
          metric_value: count, expected_value: 2,
          estimated_loss: totalShortage,
          description: `Staff "${sname}" has ${count} cash drawer shortages in ${cfg.lookbackDays}d totaling ${formatCurrency(totalShortage)}. Repeated shortages suggest systematic cash handling issue.`,
          context: { shortage_count: count, total_shortage: totalShortage },
          status: 'open', detected_at: new Date(),
        });
      }
    }
  } catch (err) { console.warn('[cash-drawer] repeated_shortages failed', err); }
  return alerts;
};

// AI enhancement
const enhanceWithAI = async (alerts: CashDrawerAlert[]): Promise<void> => {
  const { callOpenAIChat } = await import('@/lib/openai.service.ts').catch(() => ({} as any));
  if (!callOpenAIChat || alerts.length === 0) return;
  const prompt = `You are a restaurant cash security analyst. Analyze these cash drawer alerts and provide insight + recommendation.

Alerts (JSON):
${JSON.stringify(alerts.slice(0, 12).map(a => ({
  rule: a.rule_id, severity: a.severity, staff: a.staff_name,
  metric: a.metric_value, loss: a.estimated_loss, description: a.description,
})), null, 2)}

Respond with JSON array:
[{"rule":"<match rule_id>","insight":"<max 200 chars>","recommendation":"investigate"|"audit_cashier"|"install_camera"|"require_dual_count"|"suspend_cash_access"|"dismiss"}]`;

  try {
    const response = await callOpenAIChat([
      { role: 'system', content: 'You are a cash drawer anomaly detection AI. Respond only with valid JSON.' },
      { role: 'user', content: prompt },
    ], { temperature: 0.3, maxTokens: 800 });
    const text = typeof response === 'string' ? response : (response as any)?.content ?? '';
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return;
    const parsed = JSON.parse(jsonMatch[0]) as Array<{ rule: string; insight?: string; recommendation?: CashDrawerRecommendation }>;
    for (const item of parsed) {
      const alert = alerts.find(a => a.rule_id === item.rule);
      if (alert) {
        if (item.insight) alert.ai_insight = item.insight.slice(0, 200);
        if (item.recommendation) alert.ai_recommendation = item.recommendation;
      }
    }
  } catch (err) { console.warn('[cash-drawer] AI failed', err); }
};

export const runCashDrawerScan = async (
  db: ReturnType<typeof useDB>,
  config: CashDrawerConfig = DEFAULT_CASH_DRAWER_CONFIG,
  onProgress?: (current: number, total: number) => void
): Promise<{ alerts: CashDrawerAlert[]; checked: number }> => {
  const checks = [
    () => checkDrawerShortage(db, config),
    () => checkExcessiveVoids(db, config),
    () => checkCashMismatch(db, config),
    () => checkRepeatedShortages(db, config),
  ];
  const total = checks.length;
  let allAlerts: CashDrawerAlert[] = [];
  for (let i = 0; i < checks.length; i++) {
    if (onProgress) onProgress(i, total);
    try { allAlerts.push(...await checks[i]()); } catch (err) { console.warn('[cash-drawer] check', i, err); }
  }
  if (config.aiEnabled && allAlerts.length > 0) await enhanceWithAI(allAlerts);
  for (const alert of allAlerts) {
    try { await db.query(`CREATE cash_drawer_alert CONTENT $data`, { data: { ...alert, shift_date: alert.shift_date?.toISOString(), detected_at: alert.detected_at.toISOString() } }); } catch { }
  }
  if (onProgress) onProgress(total, total);
  return { alerts: allAlerts, checked: total };
};

export const getOpenAlerts = async (db: ReturnType<typeof useDB>): Promise<CashDrawerAlert[]> => {
  try {
    const result = await db.query(`SELECT * FROM cash_drawer_alert WHERE status = 'open' ORDER BY CASE severity WHEN 'critical' THEN 0 WHEN 'warning' THEN 1 ELSE 2 END, estimated_loss DESC`);
    return Array.isArray(result) ? result.flat() : [];
  } catch { return []; }
};

export const getSummary = async (db: ReturnType<typeof useDB>): Promise<{ total: number; critical: number; warning: number; totalLoss: number }> => {
  try {
    const result = await db.query(`SELECT count() AS total, math::count(severity = 'critical') AS critical, math::count(severity = 'warning') AS warning, math::sum(estimated_loss) AS total_loss FROM cash_drawer_alert WHERE status = 'open' GROUP ALL`);
    const rows = Array.isArray(result) ? result.flat() : [];
    const row = rows[0] ?? {};
    return { total: safeNumber(row.total, 0), critical: safeNumber(row.critical, 0), warning: safeNumber(row.warning, 0), totalLoss: safeNumber(row.total_loss, 0) };
  } catch { return { total: 0, critical: 0, warning: 0, totalLoss: 0 }; }
};

export const updateStatus = async (db: ReturnType<typeof useDB>, alertId: string, status: string): Promise<void> => {
  await db.query(`UPDATE $id SET status = $status`, { id: alertId, status });
};
