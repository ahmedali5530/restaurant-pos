/**
 * AI Food Safety Compliance Monitoring service — HACCP automation.
 *
 * 7th POSR-exclusive differentiator — Toast and Square have basic manual
 * temperature logging but NO AI. They don't detect patterns, predict
 * equipment failures, or auto-generate corrective-action reports.
 *
 * Restaurants face $10k-$50k+ fines for HACCP violations (FDA Food Code).
 * A single critical violation can shut down a location. POSR automates
 * HACCP compliance with 7 detection rules + AI corrective actions.
 *
 * Detection rules (7):
 *   1. CRITICAL_TEMP_BREACH — fridge > 5°C / freezer > -18°C / hot-hold < 60°C
 *   2. PROLONGED_BREACH — breach lasting > 30 min (food spoilage risk)
 *   3. EQUIPMENT_DRIFT — gradual temp increase over 24h (predictive maintenance)
 *   4. MISSED_CHECK — required temp check not logged within window (4h default)
 *   5. REPEATED_BREACH — same zone breached 3+ times in 7 days
 *   6. AFTER_HOURS_BREACH — breach when staff not on-site
 *   7. EXPIRED_STOCK — inventory_item past expiry still in stock
 */

import { useDB } from '@/api/db/db.ts';
import { safeNumber } from '@/lib/utils.ts';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type FoodSafetySeverity = 'info' | 'warning' | 'critical';
export type FoodSafetyRecommendation =
  | 'discard_food' | 'repair_equipment' | 'recheck_in_30min'
  | 'call_maintenance' | 'retrain_staff' | 'document_haccp' | 'dismiss';

export type TemperatureZone = 'fridge' | 'freezer' | 'hot_hold' | 'prep_area' | 'cold_display' | 'delivery';

export interface TemperatureLog {
  id?: string;
  zone: TemperatureZone;
  zone_name?: string;
  item?: string;
  temperature: number;       // °C
  min_safe?: number;
  max_safe?: number;
  is_breach: boolean;
  breach_duration_min?: number;
  logged_by?: string;
  logged_at: Date;
  notes?: string;
  branch_id?: string;
}

export interface FoodSafetyAlert {
  id?: string;
  rule_id: string;
  severity: FoodSafetySeverity;
  zone?: string;
  zone_name?: string;
  item_id?: string;
  item_name?: string;
  metric_value: number;
  expected_value: number;
  deviation_pct: number;
  estimated_risk: number;   // 0-100
  description: string;
  context?: Record<string, any>;
  ai_insight?: string;
  ai_recommendation?: FoodSafetyRecommendation;
  status: 'open' | 'investigating' | 'resolved' | 'false_positive';
  detected_at: Date;
  branch_id?: string;
}

export interface FoodSafetyConfig {
  aiEnabled: boolean;
  lookbackDays: number;
  checkIntervalMin: number;
  prolongedThresholdMin: number;
  repeatedThreshold: number;
  driftDays: number;
  fridgeMax: number;
  freezerMax: number;
  hotHoldMin: number;
  prepMax: number;
}

export const DEFAULT_FOODSAFETY_CONFIG: FoodSafetyConfig = {
  aiEnabled: true,
  lookbackDays: 7,
  checkIntervalMin: 240,
  prolongedThresholdMin: 30,
  repeatedThreshold: 3,
  driftDays: 1,
  fridgeMax: 5,
  freezerMax: -18,
  hotHoldMin: 60,
  prepMax: 8,
};

export const readFoodSafetyConfig = (settings: any): FoodSafetyConfig => ({
  aiEnabled: settings?.foodsafety_ai_enabled ?? true,
  lookbackDays: safeNumber(settings?.foodsafety_lookback_days, 7),
  checkIntervalMin: safeNumber(settings?.foodsafety_check_interval_min, 240),
  prolongedThresholdMin: safeNumber(settings?.foodsafety_prolonged_threshold_min, 30),
  repeatedThreshold: safeNumber(settings?.foodsafety_repeated_threshold, 3),
  driftDays: safeNumber(settings?.foodsafety_drift_days, 1),
  fridgeMax: safeNumber(settings?.foodsafety_fridge_max, 5),
  freezerMax: safeNumber(settings?.foodsafety_freezer_max, -18),
  hotHoldMin: safeNumber(settings?.foodsafety_hot_hold_min, 60),
  prepMax: safeNumber(settings?.foodsafety_prep_max, 8),
});

// ---------------------------------------------------------------------------
// Helpers — safe range per zone
// ---------------------------------------------------------------------------

const getZoneLimits = (zone: string, cfg: FoodSafetyConfig): { min: number; max: number } => {
  switch (zone) {
    case 'fridge':        return { min: -2,  max: cfg.fridgeMax };
    case 'freezer':      return { min: -30, max: cfg.freezerMax };
    case 'hot_hold':     return { min: cfg.hotHoldMin, max: 90 };
    case 'prep_area':    return { min: -2,  max: cfg.prepMax };
    case 'cold_display': return { min: -2,  max: cfg.prepMax };
    case 'delivery':     return { min: 0,   max: cfg.fridgeMax };
    default:             return { min: -10, max: 25 };
  }
};

const isBreach = (temp: number, zone: string, cfg: FoodSafetyConfig): boolean => {
  const { min, max } = getZoneLimits(zone, cfg);
  return temp < min || temp > max;
};

const isRecentlyAlerted = async (
  db: ReturnType<typeof useDB>,
  ruleId: string,
  zone: string,
  hours = 6
): Promise<boolean> => {
  try {
    const result = await db.query(
      `SELECT id FROM foodsafety_alert
       WHERE rule_id = $ruleId AND zone = $zone
         AND detected_at > time::now() - ${hours}h
       LIMIT 1`,
      { ruleId, zone }
    );
    return Array.isArray(result) && result.flat().length > 0;
  } catch { return false; }
};

// ---------------------------------------------------------------------------
// Detection rules
// ---------------------------------------------------------------------------

// 1. CRITICAL_TEMP_BREACH — temperature outside safe range
const checkCriticalTempBreach = async (db: any, cfg: FoodSafetyConfig): Promise<FoodSafetyAlert[]> => {
  const alerts: FoodSafetyAlert[] = [];
  try {
    const result = await db.query(
      `SELECT * FROM temperature_log
       WHERE logged_at > time::now() - 24h
       ORDER BY logged_at DESC`
    );
    const rows = Array.isArray(result) ? result.flat() : [];
    const seen = new Set<string>();
    for (const r of rows) {
      const zone = r.zone;
      if (!zone || seen.has(zone)) continue;
      seen.add(zone);
      const temp = safeNumber(r.temperature, 0);
      const limits = getZoneLimits(zone, cfg);
      const breach = r.min_safe != null || r.max_safe != null
        ? (r.min_safe != null && temp < r.min_safe) || (r.max_safe != null && temp > r.max_safe)
        : temp < limits.min || temp > limits.max;
      if (breach) {
        const dev = Math.abs(temp - (temp > limits.max ? limits.max : limits.min));
        const devPct = limits.max !== 0 ? Math.round((dev / Math.abs(limits.max)) * 100) : 100;
        alerts.push({
          rule_id: 'critical_temp_breach',
          severity: dev > 5 ? 'critical' : 'warning',
          zone,
          zone_name: r.zone_name,
          item_id: r.item?.toString?.(),
          metric_value: temp,
          expected_value: temp > limits.max ? limits.max : limits.min,
          deviation_pct: devPct,
          estimated_risk: Math.min(100, 50 + dev * 5),
          description: `${zone.replace(/_/g, ' ')} "${r.zone_name ?? zone}" recorded ${temp}°C — outside safe range [${limits.min}°C to ${limits.max}°C]. FDA Food Code violation.`,
          context: { temperature: temp, min_safe: limits.min, max_safe: limits.max, logged_at: r.logged_at },
          status: 'open',
          detected_at: new Date(r.logged_at),
        });
      }
    }
  } catch (err) { console.warn('[foodsafety] critical_temp_breach failed', err); }
  return alerts;
};

// 2. PROLONGED_BREACH — breach lasting > 30 min
const checkProlongedBreach = async (db: any, cfg: FoodSafetyConfig): Promise<FoodSafetyAlert[]> => {
  const alerts: FoodSafetyAlert[] = [];
  try {
    const result = await db.query(
      `SELECT * FROM temperature_log
       WHERE is_breach = true
         AND breach_duration_min > $threshold
         AND logged_at > time::now() - 7d
       ORDER BY logged_at DESC`,
      { threshold: cfg.prolongedThresholdMin }
    );
    const rows = Array.isArray(result) ? result.flat() : [];
    for (const r of rows) {
      if (await isRecentlyAlerted(db, 'prolonged_breach', r.zone, 12)) continue;
      const duration = safeNumber(r.breach_duration_min, 0);
      alerts.push({
        rule_id: 'prolonged_breach',
        severity: duration > 120 ? 'critical' : 'warning',
        zone: r.zone,
        zone_name: r.zone_name,
        metric_value: duration,
        expected_value: cfg.prolongedThresholdMin,
        deviation_pct: Math.round((duration / cfg.prolongedThresholdMin - 1) * 100),
        estimated_risk: Math.min(100, duration * 0.5),
        description: `${r.zone.replace(/_/g, ' ')} "${r.zone_name ?? r.zone}" in breach for ${duration} min (threshold ${cfg.prolongedThresholdMin} min). Food in zone likely spoiled — discard immediately.`,
        context: { duration_min: duration, temperature: r.temperature },
        status: 'open',
        detected_at: new Date(r.logged_at),
      });
    }
  } catch (err) { console.warn('[foodsafety] prolonged_breach failed', err); }
  return alerts;
};

// 3. EQUIPMENT_DRIFT — gradual temp increase over 24h (predictive)
const checkEquipmentDrift = async (db: any, cfg: FoodSafetyConfig): Promise<FoodSafetyAlert[]> => {
  const alerts: FoodSafetyAlert[] = [];
  try {
    // Get avg temp per zone for last 24h vs previous 24h
    const result = await db.query(
      `SELECT zone, zone_name,
         math::mean(temperature) AS avg_temp,
         math::max(temperature) AS max_temp,
         count() AS readings
       FROM temperature_log
       WHERE logged_at > time::now() - 24h
       GROUP BY zone`
    );
    const currentRows = Array.isArray(result) ? result.flat() : [];

    const prevResult = await db.query(
      `SELECT zone,
         math::mean(temperature) AS prev_avg_temp
       FROM temperature_log
       WHERE logged_at > time::now() - 48h
         AND logged_at < time::now() - 24h
       GROUP BY zone`
    );
    const prevRows = Array.isArray(prevResult) ? prevResult.flat() : [];
    const prevMap = new Map(prevRows.map((r: any) => [r.zone, r]));

    for (const curr of currentRows) {
      if (safeNumber(curr.readings, 0) < 3) continue; // not enough data
      const prev = prevMap.get(curr.zone);
      if (!prev) continue;
      const currAvg = safeNumber(curr.avg_temp, 0);
      const prevAvg = safeNumber(prev.prev_avg_temp, 0);
      const drift = currAvg - prevAvg;
      // For cold zones, drift > 2°C upward is concerning
      const isColdZone = ['fridge', 'freezer', 'prep_area', 'cold_display'].includes(curr.zone);
      if (isColdZone && drift > 2) {
        if (await isRecentlyAlerted(db, 'equipment_drift', curr.zone, 24)) continue;
        const limits = getZoneLimits(curr.zone, cfg);
        alerts.push({
          rule_id: 'equipment_drift',
          severity: drift > 4 ? 'critical' : 'warning',
          zone: curr.zone,
          zone_name: curr.zone_name,
          metric_value: currAvg,
          expected_value: prevAvg,
          deviation_pct: Math.round((drift / Math.abs(limits.max)) * 100),
          estimated_risk: Math.min(100, drift * 15),
          description: `${curr.zone.replace(/_/g, ' ')} "${curr.zone_name ?? curr.zone}" avg temp rose ${drift.toFixed(1)}°C in 24h (from ${prevAvg.toFixed(1)}°C to ${currAvg.toFixed(1)}°C). Equipment may be failing — schedule maintenance before spoilage.`,
          context: { current_avg: currAvg, prev_avg: prevAvg, drift, max_temp: curr.max_temp },
          status: 'open',
          detected_at: new Date(),
        });
      }
    }
  } catch (err) { console.warn('[foodsafety] equipment_drift failed', err); }
  return alerts;
};

// 4. MISSED_CHECK — no temp log within required window
const checkMissedCheck = async (db: any, cfg: FoodSafetyConfig): Promise<FoodSafetyAlert[]> => {
  const alerts: FoodSafetyAlert[] = [];
  try {
    // Get zones that have logged temps before (active zones)
    const zonesResult = await db.query(
      `SELECT zone, zone_name, max(logged_at) AS last_check
       FROM temperature_log
       WHERE logged_at > time::now() - 30d
       GROUP BY zone`
    );
    const zoneRows = Array.isArray(zonesResult) ? zonesResult.flat() : [];
    const cutoffMs = Date.now() - cfg.checkIntervalMin * 60 * 1000;
    for (const z of zoneRows) {
      const lastCheck = z.last_check ? new Date(z.last_check) : null;
      if (!lastCheck || lastCheck.getTime() < cutoffMs) {
        if (await isRecentlyAlerted(db, 'missed_check', z.zone, 6)) continue;
        const minutesOverdue = lastCheck
          ? Math.round((Date.now() - lastCheck.getTime()) / 60000)
          : cfg.checkIntervalMin * 2;
        alerts.push({
          rule_id: 'missed_check',
          severity: minutesOverdue > cfg.checkIntervalMin * 2 ? 'critical' : 'warning',
          zone: z.zone,
          zone_name: z.zone_name,
          metric_value: minutesOverdue,
          expected_value: cfg.checkIntervalMin,
          deviation_pct: Math.round((minutesOverdue / cfg.checkIntervalMin - 1) * 100),
          estimated_risk: Math.min(100, minutesOverdue / 10),
          description: `${z.zone.replace(/_/g, ' ')} "${z.zone_name ?? z.zone}" has no temperature log for ${minutesOverdue} min (required every ${cfg.checkIntervalMin} min). HACCP compliance gap — recheck immediately.`,
          context: { last_check: lastCheck, minutes_overdue: minutesOverdue },
          status: 'open',
          detected_at: new Date(),
        });
      }
    }
  } catch (err) { console.warn('[foodsafety] missed_check failed', err); }
  return alerts;
};

// 5. REPEATED_BREACH — same zone breached 3+ times in 7 days
const checkRepeatedBreach = async (db: any, cfg: FoodSafetyConfig): Promise<FoodSafetyAlert[]> => {
  const alerts: FoodSafetyAlert[] = [];
  try {
    const result = await db.query(
      `SELECT zone, zone_name, count() AS breach_count
       FROM temperature_log
       WHERE is_breach = true AND logged_at > time::now() - 7d
       GROUP BY zone`
    );
    const rows = Array.isArray(result) ? result.flat() : [];
    for (const r of rows) {
      const count = safeNumber(r.breach_count, 0);
      if (count >= cfg.repeatedThreshold) {
        if (await isRecentlyAlerted(db, 'repeated_breach', r.zone, 24)) continue;
        alerts.push({
          rule_id: 'repeated_breach',
          severity: count >= cfg.repeatedThreshold * 2 ? 'critical' : 'warning',
          zone: r.zone,
          zone_name: r.zone_name,
          metric_value: count,
          expected_value: cfg.repeatedThreshold - 1,
          deviation_pct: Math.round((count / (cfg.repeatedThreshold - 1) - 1) * 100),
          estimated_risk: Math.min(100, count * 15),
          description: `${r.zone.replace(/_/g, ' ')} "${r.zone_name ?? r.zone}" breached ${count} times in 7 days (threshold ${cfg.repeatedThreshold}). Recurring issue — likely equipment failure, not staff error.`,
          context: { breach_count: count, threshold: cfg.repeatedThreshold },
          status: 'open',
          detected_at: new Date(),
        });
      }
    }
  } catch (err) { console.warn('[foodsafety] repeated_breach failed', err); }
  return alerts;
};

// 6. AFTER_HOURS_BREACH — breach when staff not on-site (22:00-08:00)
const checkAfterHoursBreach = async (db: any, _cfg: FoodSafetyConfig): Promise<FoodSafetyAlert[]> => {
  const alerts: FoodSafetyAlert[] = [];
  try {
    const result = await db.query(
      `SELECT * FROM temperature_log
       WHERE is_breach = true
         AND logged_at > time::now() - 7d
       ORDER BY logged_at DESC`
    );
    const rows = Array.isArray(result) ? result.flat() : [];
    for (const r of rows) {
      const hour = new Date(r.logged_at).getHours();
      const isAfterHours = hour >= 22 || hour < 8;
      if (!isAfterHours) continue;
      if (await isRecentlyAlerted(db, 'after_hours_breach', r.zone, 12)) continue;
      alerts.push({
        rule_id: 'after_hours_breach',
        severity: 'critical',
        zone: r.zone,
        zone_name: r.zone_name,
        metric_value: safeNumber(r.temperature, 0),
        expected_value: 0,
        deviation_pct: 100,
        estimated_risk: 80,
        description: `${r.zone.replace(/_/g, ' ')} "${r.zone_name ?? r.zone}" breach at ${hour}:00 (after hours, no staff on-site). Food may have been in danger zone for hours before discovery.`,
        context: { hour, temperature: r.temperature },
        status: 'open',
        detected_at: new Date(r.logged_at),
      });
    }
  } catch (err) { console.warn('[foodsafety] after_hours_breach failed', err); }
  return alerts;
};

// 7. EXPIRED_STOCK — inventory_item past expiry still in stock
const checkExpiredStock = async (db: any, _cfg: FoodSafetyConfig): Promise<FoodSafetyAlert[]> => {
  const alerts: FoodSafetyAlert[] = [];
  try {
    // Look for inventory items with expiry_date field (if exists) past now
    const result = await db.query(
      `SELECT id, name, expiry_date, batch_number FROM inventory_item
       WHERE expiry_date IS NOT NONE
         AND expiry_date < time::now()`
    );
    const rows = Array.isArray(result) ? result.flat() : [];
    for (const r of rows.slice(0, 20)) { // cap at 20 alerts
      if (await isRecentlyAlerted(db, 'expired_stock', r.id?.toString?.() ?? r.name, 24)) continue;
      const daysExpired = r.expiry_date
        ? Math.floor((Date.now() - new Date(r.expiry_date).getTime()) / (1000 * 60 * 60 * 24))
        : 0;
      alerts.push({
        rule_id: 'expired_stock',
        severity: daysExpired > 3 ? 'critical' : 'warning',
        item_id: r.id?.toString?.(),
        item_name: r.name,
        metric_value: daysExpired,
        expected_value: 0,
        deviation_pct: 100,
        estimated_risk: Math.min(100, 50 + daysExpired * 10),
        description: `Inventory item "${r.name}" expired ${daysExpired} days ago${r.batch_number ? ` (batch ${r.batch_number})` : ''} and is still in stock. Serving expired food risks customer illness + health-code fines.`,
        context: { expiry_date: r.expiry_date, batch: r.batch_number, days_expired: daysExpired },
        status: 'open',
        detected_at: new Date(),
      });
    }
  } catch (err) { console.warn('[foodsafety] expired_stock failed', err); }
  return alerts;
};

// ---------------------------------------------------------------------------
// AI enhancement
// ---------------------------------------------------------------------------

const enhanceWithAI = async (alerts: FoodSafetyAlert[]): Promise<void> => {
  const { callOpenAIChat } = await import('@/lib/openai.service.ts').catch(() => ({} as any));
  if (!callOpenAIChat || alerts.length === 0) return;

  const prompt = `You are a restaurant food safety (HACCP) compliance expert.
Analyze these food-safety alerts and provide insight + corrective-action recommendation.

Alerts (JSON):
${JSON.stringify(alerts.slice(0, 15).map(a => ({
  rule: a.rule_id,
  severity: a.severity,
  zone: a.zone_name ?? a.zone,
  item: a.item_name,
  metric: a.metric_value,
  expected: a.expected_value,
  description: a.description,
})), null, 2)}

Respond with JSON array:
[{
  "rule": "<match rule_id>",
  "insight": "<max 200 chars — root cause + risk>",
  "recommendation": "discard_food" | "repair_equipment" | "recheck_in_30min" | "call_maintenance" | "retrain_staff" | "document_haccp" | "dismiss"
}]`;

  try {
    const response = await callOpenAIChat([
      { role: 'system', content: 'You are a food safety AI. Respond only with valid JSON.' },
      { role: 'user', content: prompt },
    ], { temperature: 0.3, maxTokens: 800 });

    const text = typeof response === 'string' ? response : (response as any)?.content ?? '';
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return;
    const parsed = JSON.parse(jsonMatch[0]) as Array<{
      rule: string; insight?: string; recommendation?: FoodSafetyRecommendation;
    }>;
    for (const item of parsed) {
      const alert = alerts.find(a => a.rule_id === item.rule);
      if (alert) {
        if (item.insight) alert.ai_insight = item.insight.slice(0, 200);
        if (item.recommendation) alert.ai_recommendation = item.recommendation;
      }
    }
  } catch (err) { console.warn('[foodsafety] AI failed', err); }
};

// ---------------------------------------------------------------------------
// Main entry
// ---------------------------------------------------------------------------

export const runFoodSafetyScan = async (
  db: ReturnType<typeof useDB>,
  config: FoodSafetyConfig = DEFAULT_FOODSAFETY_CONFIG,
  onProgress?: (current: number, total: number) => void
): Promise<{ alerts: FoodSafetyAlert[]; checked: number }> => {
  const checks = [
    () => checkCriticalTempBreach(db, config),
    () => checkProlongedBreach(db, config),
    () => checkEquipmentDrift(db, config),
    () => checkMissedCheck(db, config),
    () => checkRepeatedBreach(db, config),
    () => checkAfterHoursBreach(db, config),
    () => checkExpiredStock(db, config),
  ];
  const total = checks.length;
  let allAlerts: FoodSafetyAlert[] = [];

  for (let i = 0; i < checks.length; i++) {
    if (onProgress) onProgress(i, total);
    try {
      const alerts = await checks[i]();
      allAlerts.push(...alerts);
    } catch (err) { console.warn('[foodsafety] check failed at', i, err); }
  }

  if (config.aiEnabled && allAlerts.length > 0) {
    await enhanceWithAI(allAlerts);
  }

  // Persist
  for (const alert of allAlerts) {
    try {
      await db.query(`CREATE foodsafety_alert CONTENT $data`, {
        data: { ...alert, detected_at: alert.detected_at.toISOString() },
      });
    } catch { /* non-fatal */ }
  }

  if (onProgress) onProgress(total, total);
  return { alerts: allAlerts, checked: total };
};

// ---------------------------------------------------------------------------
// Logging helper — record a temperature reading
// ---------------------------------------------------------------------------

export const logTemperature = async (
  db: ReturnType<typeof useDB>,
  log: Omit<TemperatureLog, 'id' | 'is_breach'> & { is_breach?: boolean }
): Promise<void> => {
  const cfg = DEFAULT_FOODSAFETY_CONFIG;
  const isBreachVal = log.is_breach ?? isBreach(log.temperature, log.zone, cfg);
  await db.query(`CREATE temperature_log CONTENT $data`, {
    data: {
      ...log,
      is_breach: isBreachVal,
      logged_at: (log.logged_at ?? new Date()).toISOString(),
    },
  });
};

// ---------------------------------------------------------------------------
// Read + update
// ---------------------------------------------------------------------------

export const getOpenFoodSafetyAlerts = async (
  db: ReturnType<typeof useDB>
): Promise<FoodSafetyAlert[]> => {
  try {
    const result = await db.query(
      `SELECT * FROM foodsafety_alert WHERE status = 'open'
       ORDER BY CASE severity WHEN 'critical' THEN 0 WHEN 'warning' THEN 1 ELSE 2 END,
       estimated_risk DESC`
    );
    return Array.isArray(result) ? result.flat() : [];
  } catch { return []; }
};

export const getFoodSafetySummary = async (
  db: ReturnType<typeof useDB>
): Promise<{
  total: number;
  critical: number;
  warning: number;
  activeBreaches: number;
  complianceScore: number;
}> => {
  try {
    const [alertResult, breachResult] = await Promise.all([
      db.query(
        `SELECT count() AS total,
           math::count(severity = 'critical') AS critical,
           math::count(severity = 'warning') AS warning
         FROM foodsafety_alert WHERE status = 'open' GROUP ALL`
      ),
      db.query(
        `SELECT count() AS breaches FROM temperature_log
         WHERE is_breach = true AND logged_at > time::now() - 24h`
      ),
    ]);
    const alertRows = Array.isArray(alertResult) ? alertResult.flat() : [];
    const breachRows = Array.isArray(breachResult) ? breachResult.flat() : [];
    const a = alertRows[0] ?? {};
    const b = breachRows[0] ?? {};
    const total = safeNumber(a.total, 0);
    const critical = safeNumber(a.critical, 0);
    const activeBreaches = safeNumber(b.breaches, 0);
    // Compliance score: 100 - (critical*15 + warning*5 + breaches*3)
    const complianceScore = Math.max(0, 100 - (critical * 15 + safeNumber(a.warning, 0) * 5 + activeBreaches * 3));
    return { total, critical, warning: safeNumber(a.warning, 0), activeBreaches, complianceScore };
  } catch {
    return { total: 0, critical: 0, warning: 0, activeBreaches: 0, complianceScore: 100 };
  }
};

export const updateFoodSafetyStatus = async (
  db: ReturnType<typeof useDB>, alertId: string, status: string
): Promise<void> => {
  await db.query(`UPDATE $id SET status = $status`, { id: alertId, status });
};
