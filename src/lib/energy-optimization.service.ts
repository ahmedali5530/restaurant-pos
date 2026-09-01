/**
 * AI Energy Optimization service — restaurant energy waste detection.
 *
 * 8th POSR-exclusive differentiator — Toast, Square, Lightspeed have ZERO
 * energy tracking. Restaurants spend $3-5k/year on energy, ~30% wasted
 * (EPA Energy Star). POSR automates energy monitoring with 7 detection
 * rules + AI savings recommendations.
 *
 * Detection rules (7):
 *   1. AFTER_HOURS_CONSUMPTION — high usage 22:00-08:00 (equipment left on)
 *   2. PEAK_RATE_OVERSPEND — usage during peak tariff (shift to off-peak)
 *   3. WEEKEND_ANOMALY — weekend usage > 1.5x weekday avg (HVAC left on)
 *   4. BASELINE_DEVIATION — daily usage > 20% above 30-day rolling avg
 *   5. HVAC_DRIFT — gradual consumption increase over 14 days (equipment aging)
 *   6. EQUIPMENT_LEFT_ON — usage when no order/cashier activity in same hour
 *   7. TARIFF_MISMATCH — cost per kWh higher than baseline rate (wrong plan)
 */

import { useDB } from '@/api/db/db.ts';
import { safeNumber } from '@/lib/utils.ts';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type EnergySeverity = 'info' | 'warning' | 'critical';
export type EnergyRecommendation =
  | 'adjust_thermostat' | 'install_occupancy_sensor' | 'repair_hvac'
  | 'shift_to_off_peak' | 'power_down_equipment' | 'review_tariff_plan' | 'dismiss';

export type EnergyZone = 'kitchen' | 'dining' | 'hvac' | 'lighting' | 'refrigeration' | 'whole_site';

export interface EnergyLog {
  id?: string;
  zone: EnergyZone;
  kwh_consumed: number;
  cost: number;
  tariff: string;
  rate_per_kwh?: number;
  period_start: Date;
  period_end: Date;
  is_after_hours: boolean;
  logged_by?: string;
  source: string;
  branch_id?: string;
}

export interface EnergyAlert {
  id?: string;
  rule_id: string;
  severity: EnergySeverity;
  zone?: string;
  metric_value: number;
  expected_value: number;
  deviation_pct: number;
  estimated_waste: number;       // $ wasted per year if pattern continues
  description: string;
  context?: Record<string, any>;
  ai_insight?: string;
  ai_recommendation?: EnergyRecommendation;
  status: 'open' | 'investigating' | 'resolved' | 'false_positive';
  detected_at: Date;
  branch_id?: string;
}

export interface EnergyConfig {
  aiEnabled: boolean;
  lookbackDays: number;
  afterHoursStart: number;
  afterHoursEnd: number;
  baselineDeviationPct: number;
  weekendMultiplier: number;
  driftDays: number;
  peakRateThreshold: number;
  avgRatePerKwh: number;
}

export const DEFAULT_ENERGY_CONFIG: EnergyConfig = {
  aiEnabled: true,
  lookbackDays: 30,
  afterHoursStart: 22,
  afterHoursEnd: 8,
  baselineDeviationPct: 0.20,
  weekendMultiplier: 1.5,
  driftDays: 14,
  peakRateThreshold: 0.15,
  avgRatePerKwh: 0.12,
};

export const readEnergyConfig = (settings: any): EnergyConfig => ({
  aiEnabled: settings?.energy_ai_enabled ?? true,
  lookbackDays: safeNumber(settings?.energy_lookback_days, 30),
  afterHoursStart: safeNumber(settings?.energy_after_hours_start, 22),
  afterHoursEnd: safeNumber(settings?.energy_after_hours_end, 8),
  baselineDeviationPct: safeNumber(settings?.energy_baseline_deviation_pct, 0.20),
  weekendMultiplier: safeNumber(settings?.energy_weekend_multiplier, 1.5),
  driftDays: safeNumber(settings?.energy_drift_days, 14),
  peakRateThreshold: safeNumber(settings?.energy_peak_rate_threshold, 0.15),
  avgRatePerKwh: safeNumber(settings?.energy_avg_rate_per_kwh, 0.12),
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const isRecentlyAlerted = async (
  db: ReturnType<typeof useDB>,
  ruleId: string,
  zone: string,
  hours = 24
): Promise<boolean> => {
  try {
    const result = await db.query(
      `SELECT id FROM energy_alert
       WHERE rule_id = $ruleId AND zone = $zone
         AND detected_at > time::now() - ${hours}h
       LIMIT 1`,
      { ruleId, zone }
    );
    return Array.isArray(result) && result.flat().length > 0;
  } catch { return false; }
};

const annualizeWaste = (dailyWaste: number): number => dailyWaste * 365;

// ---------------------------------------------------------------------------
// Detection rules
// ---------------------------------------------------------------------------

// 1. AFTER_HOURS_CONSUMPTION — high usage 22:00-08:00
const checkAfterHoursConsumption = async (db: any, cfg: EnergyConfig): Promise<EnergyAlert[]> => {
  const alerts: EnergyAlert[] = [];
  try {
    // Sum after-hours kWh per zone in last 7 days
    const result = await db.query(
      `SELECT zone,
         math::sum(kwh_consumed) AS kwh,
         math::sum(cost) AS cost
       FROM energy_log
       WHERE is_after_hours = true
         AND period_start > time::now() - 7d
       GROUP BY zone`
    );
    const rows = Array.isArray(result) ? result.flat() : [];
    // Baseline: how much should be running overnight? Refrigeration only (~5% of daily)
    const dailyResult = await db.query(
      `SELECT math::sum(kwh_consumed) AS daily_kwh, math::sum(cost) AS daily_cost
       FROM energy_log
       WHERE period_start > time::now() - 7d`
    );
    const dailyRows = Array.isArray(dailyResult) ? dailyResult.flat() : [];
    const totalDailyKwh = safeNumber(dailyRows[0]?.daily_kwh, 0);

    for (const r of rows) {
      const afterHoursKwh = safeNumber(r.kwh, 0);
      const afterHoursCost = safeNumber(r.cost, 0);
      if (afterHoursKwh < 5) continue; // negligible
      // Expectation: overnight should be ~5% of daily total (refrigeration only)
      const expected = totalDailyKwh * 0.05 * (7 / 7); // 5% over 7 days
      if (afterHoursKwh > expected * 2) {
        if (await isRecentlyAlerted(db, 'after_hours_consumption', r.zone, 24)) continue;
        const waste = afterHoursCost * 0.6; // estimate 60% is waste
        alerts.push({
          rule_id: 'after_hours_consumption',
          severity: waste > 50 ? 'critical' : 'warning',
          zone: r.zone,
          metric_value: afterHoursKwh,
          expected_value: expected,
          deviation_pct: expected > 0 ? Math.round((afterHoursKwh / expected - 1) * 100) : 100,
          estimated_waste: annualizeWaste(waste / 7),
          description: `Zone "${r.zone}" consumed ${afterHoursKwh.toFixed(1)} kWh during after-hours (${cfg.afterHoursStart}:00-${cfg.afterHoursEnd}:00) over last 7 days — cost ${formatCurrency(afterHoursCost)}. Likely refrigeration + equipment left on.`,
          context: { kwh: afterHoursKwh, cost: afterHoursCost, expected, period_days: 7 },
          status: 'open',
          detected_at: new Date(),
        });
      }
    }
  } catch (err) { console.warn('[energy] after_hours_consumption failed', err); }
  return alerts;
};

// 2. PEAK_RATE_OVERSPEND — too much consumption during peak tariff
const checkPeakRateOverspend = async (db: any, cfg: EnergyConfig): Promise<EnergyAlert[]> => {
  const alerts: EnergyAlert[] = [];
  try {
    const result = await db.query(
      `SELECT
         math::sum(kwh_consumed) AS total_kwh,
         math::sum(kwh_consumed * (tariff = 'peak')) AS peak_kwh,
         math::sum(cost) AS total_cost,
         math::sum(cost * (tariff = 'peak')) AS peak_cost
       FROM energy_log
       WHERE period_start > time::now() - 30d`
    );
    const rows = Array.isArray(result) ? result.flat() : [];
    const r = rows[0] ?? {};
    const totalKwh = safeNumber(r.total_kwh, 0);
    const peakKwh = safeNumber(r.peak_kwh, 0);
    const peakCost = safeNumber(r.peak_cost, 0);
    if (totalKwh === 0) return alerts;
    const peakPct = peakKwh / totalKwh;
    if (peakPct > cfg.peakRateThreshold) {
      if (await isRecentlyAlerted(db, 'peak_rate_overspend', 'whole_site', 24)) return alerts;
      // Estimate waste: 30% of peak could shift to off-peak at ~50% lower rate
      const shiftableKwh = peakKwh * 0.30;
      const offPeakRate = cfg.avgRatePerKwh * 0.5;
      const waste = shiftableKwh * (cfg.avgRatePerKwh * 1.5 - offPeakRate);
      alerts.push({
        rule_id: 'peak_rate_overspend',
        severity: waste > 100 ? 'critical' : 'warning',
        zone: 'whole_site',
        metric_value: peakPct,
        expected_value: cfg.peakRateThreshold,
        deviation_pct: Math.round((peakPct / cfg.peakRateThreshold - 1) * 100),
        estimated_waste: annualizeWaste(waste / 30),
        description: `${(peakPct * 100).toFixed(0)}% of electricity consumed during peak tariff (threshold ${(cfg.peakRateThreshold * 100).toFixed(0)}%) — ${formatCurrency(peakCost)} spent on peak-rate power. Shifting prep work to off-peak hours would save substantially.`,
        context: { peak_kwh: peakKwh, total_kwh: totalKwh, peak_cost: peakCost, shiftable_kwh: shiftableKwh },
        status: 'open',
        detected_at: new Date(),
      });
    }
  } catch (err) { console.warn('[energy] peak_rate_overspend failed', err); }
  return alerts;
};

// 3. WEEKEND_ANOMALY — weekend usage > 1.5x weekday avg
const checkWeekendAnomaly = async (db: any, cfg: EnergyConfig): Promise<EnergyAlert[]> => {
  const alerts: EnergyAlert[] = [];
  try {
    // Get daily totals for last 30 days
    const result = await db.query(
      `SELECT
         time::day(period_start) AS day,
         math::sum(kwh_consumed) AS kwh,
         math::sum(cost) AS cost
       FROM energy_log
       WHERE period_start > time::now() - 30d
       GROUP BY time::day(period_start)`
    );
    const rows = Array.isArray(result) ? result.flat() : [];
    if (rows.length < 14) return alerts; // not enough data
    let weekdayKwh = 0, weekdayDays = 0;
    let weekendKwh = 0, weekendDays = 0;
    for (const r of rows) {
      const dow = new Date(r.day).getDay();
      const isWeekend = dow === 0 || dow === 6;
      if (isWeekend) { weekendKwh += safeNumber(r.kwh, 0); weekendDays++; }
      else { weekdayKwh += safeNumber(r.kwh, 0); weekdayDays++; }
    }
    if (weekdayDays === 0 || weekendDays === 0) return alerts;
    const weekdayAvg = weekdayKwh / weekdayDays;
    const weekendAvg = weekendKwh / weekendDays;
    if (weekendAvg > weekdayAvg * cfg.weekendMultiplier) {
      if (await isRecentlyAlerted(db, 'weekend_anomaly', 'whole_site', 48)) return alerts;
      const wastePerWeekend = (weekendAvg - weekdayAvg) * 0.5; // half the excess is waste
      const waste = (wastePerWeekend * (cfg.avgRatePerKwh)) * (weekendDays / 30 * 365 / 2);
      alerts.push({
        rule_id: 'weekend_anomaly',
        severity: waste > 200 ? 'critical' : 'warning',
        zone: 'whole_site',
        metric_value: weekendAvg,
        expected_value: weekdayAvg,
        deviation_pct: Math.round((weekendAvg / weekdayAvg - 1) * 100),
        estimated_waste: waste,
        description: `Weekend avg consumption ${weekendAvg.toFixed(0)} kWh is ${(weekendAvg / weekdayAvg).toFixed(1)}x weekday avg (${weekdayAvg.toFixed(0)} kWh). HVAC/lighting likely running at weekday levels when occupancy is lower.`,
        context: { weekday_avg: weekdayAvg, weekend_avg: weekendAvg, ratio: weekendAvg / weekdayAvg },
        status: 'open',
        detected_at: new Date(),
      });
    }
  } catch (err) { console.warn('[energy] weekend_anomaly failed', err); }
  return alerts;
};

// 4. BASELINE_DEVIATION — daily usage > 20% above 30-day rolling avg
const checkBaselineDeviation = async (db: any, cfg: EnergyConfig): Promise<EnergyAlert[]> => {
  const alerts: EnergyAlert[] = [];
  try {
    const result = await db.query(
      `SELECT
         time::day(period_start) AS day,
         math::sum(kwh_consumed) AS kwh,
         math::sum(cost) AS cost
       FROM energy_log
       WHERE period_start > time::now() - ${cfg.lookbackDays}d
       GROUP BY time::day(period_start)
       ORDER BY day DESC
       LIMIT 30`
    );
    const rows = Array.isArray(result) ? result.flat() : [];
    if (rows.length < 14) return alerts;
    // Baseline = mean of all but most recent day
    const baseline = rows.slice(1).reduce((s, r) => s + safeNumber(r.kwh, 0), 0) / (rows.length - 1);
    const today = rows[0];
    const todayKwh = safeNumber(today?.kwh, 0);
    if (todayKwh > baseline * (1 + cfg.baselineDeviationPct)) {
      if (await isRecentlyAlerted(db, 'baseline_deviation', 'whole_site', 24)) return alerts;
      const waste = (todayKwh - baseline) * safeNumber(today?.cost, 0) / Math.max(1, todayKwh);
      alerts.push({
        rule_id: 'baseline_deviation',
        severity: todayKwh > baseline * 1.5 ? 'critical' : 'warning',
        zone: 'whole_site',
        metric_value: todayKwh,
        expected_value: baseline,
        deviation_pct: Math.round((todayKwh / baseline - 1) * 100),
        estimated_waste: annualizeWaste(waste),
        description: `Today's consumption ${todayKwh.toFixed(0)} kWh is ${Math.round((todayKwh / baseline - 1) * 100)}% above the ${cfg.lookbackDays}-day rolling average (${baseline.toFixed(0)} kWh). Investigate equipment left on or HVAC malfunction.`,
        context: { today_kwh: todayKwh, baseline, deviation_pct: Math.round((todayKwh / baseline - 1) * 100) },
        status: 'open',
        detected_at: new Date(),
      });
    }
  } catch (err) { console.warn('[energy] baseline_deviation failed', err); }
  return alerts;
};

// 5. HVAC_DRIFT — gradual consumption increase over 14 days (equipment aging)
const checkHvacDrift = async (db: any, cfg: EnergyConfig): Promise<EnergyAlert[]> => {
  const alerts: EnergyAlert[] = [];
  try {
    const result = await db.query(
      `SELECT
         time::day(period_start) AS day,
         math::sum(kwh_consumed) AS kwh
       FROM energy_log
       WHERE zone = 'hvac'
         AND period_start > time::now() - ${cfg.driftDays}d
       GROUP BY time::day(period_start)
       ORDER BY day ASC`
    );
    const rows = Array.isArray(result) ? result.flat() : [];
    if (rows.length < 7) return alerts;
    // Compute linear regression slope (simple)
    const n = rows.length;
    const xs = rows.map((_, i) => i);
    const ys = rows.map(r => safeNumber(r.kwh, 0));
    const sumX = xs.reduce((a, b) => a + b, 0);
    const sumY = ys.reduce((a, b) => a + b, 0);
    const sumXY = xs.reduce((s, x, i) => s + x * ys[i], 0);
    const sumXX = xs.reduce((s, x) => s + x * x, 0);
    const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
    const avgKwh = sumY / n;
    // If slope > 2% of avg per day, alert
    if (slope > avgKwh * 0.02) {
      if (await isRecentlyAlerted(db, 'hvac_drift', 'hvac', 72)) return alerts;
      const wastePerDay = slope * 14; // kWh gained over 14 days
      const waste = wastePerDay * cfg.avgRatePerKwh * 26; // 26 bi-weekly periods in a year
      alerts.push({
        rule_id: 'hvac_drift',
        severity: slope > avgKwh * 0.05 ? 'critical' : 'warning',
        zone: 'hvac',
        metric_value: slope,
        expected_value: 0,
        deviation_pct: Math.round((slope / Math.max(0.1, avgKwh * 0.02) - 1) * 100),
        estimated_waste: waste,
        description: `HVAC consumption rising ${slope.toFixed(1)} kWh/day over ${cfg.driftDays} days (current avg ${avgKwh.toFixed(0)} kWh/day). Trend suggests equipment aging, filter clogging, or refrigerant leak — schedule maintenance before failure.`,
        context: { slope, avg_kwh: avgKwh, window_days: cfg.driftDays, trend_per_day_pct: slope / avgKwh },
        status: 'open',
        detected_at: new Date(),
      });
    }
  } catch (err) { console.warn('[energy] hvac_drift failed', err); }
  return alerts;
};

// 6. EQUIPMENT_LEFT_ON — usage spikes when no order/cashier activity in same hour
const checkEquipmentLeftOn = async (db: any, _cfg: EnergyConfig): Promise<EnergyAlert[]> => {
  const alerts: EnergyAlert[] = [];
  try {
    // Find hours with energy consumption but no orders
    const energyResult = await db.query(
      `SELECT
         time::hour(period_start) AS hour,
         math::sum(kwh_consumed) AS kwh,
         math::sum(cost) AS cost
       FROM energy_log
       WHERE period_start > time::now() - 7d
         AND is_after_hours = true
       GROUP BY time::hour(period_start)
       ORDER BY hour DESC
       LIMIT 24`
    );
    const energyRows = Array.isArray(energyResult) ? energyResult.flat() : [];
    if (energyRows.length === 0) return alerts;

    // For each after-hours energy spike, check if any orders in same hour
    for (const e of energyRows.slice(0, 5)) {
      const hour = new Date(e.hour);
      const hourEnd = new Date(hour.getTime() + 60 * 60 * 1000);
      const orderResult = await db.query(
        `SELECT count() AS order_count FROM order
         WHERE created_at >= $start AND created_at < $end
           AND status = 'Paid'`,
        { start: hour.toISOString(), end: hourEnd.toISOString() }
      );
      const orderRows = Array.isArray(orderResult) ? orderResult.flat() : [];
      const orderCount = safeNumber(orderRows[0]?.order_count, 0);
      const kwh = safeNumber(e.kwh, 0);
      const cost = safeNumber(e.cost, 0);
      // If kWh > 3 but no orders, equipment running without business reason
      if (kwh > 3 && orderCount === 0) {
        if (await isRecentlyAlerted(db, 'equipment_left_on', 'whole_site', 24)) continue;
        alerts.push({
          rule_id: 'equipment_left_on',
          severity: kwh > 10 ? 'critical' : 'warning',
          zone: 'whole_site',
          metric_value: kwh,
          expected_value: 0,
          deviation_pct: 100,
          estimated_waste: annualizeWaste(cost / 7),
          description: `${kwh.toFixed(1)} kWh consumed between ${hour.getHours()}:00-${(hour.getHours() + 1) % 24}:00 with zero orders in same hour. Equipment (HVAC/lights/kitchen) likely left on with no business reason.`,
          context: { hour: hour.toISOString(), kwh, cost, orders_in_hour: orderCount },
          status: 'open',
          detected_at: new Date(),
        });
      }
    }
  } catch (err) { console.warn('[energy] equipment_left_on failed', err); }
  return alerts;
};

// 7. TARIFF_MISMATCH — cost per kWh higher than baseline rate (wrong plan)
const checkTariffMismatch = async (db: any, cfg: EnergyConfig): Promise<EnergyAlert[]> => {
  const alerts: EnergyAlert[] = [];
  try {
    const result = await db.query(
      `SELECT
         math::sum(kwh_consumed) AS total_kwh,
         math::sum(cost) AS total_cost
       FROM energy_log
       WHERE period_start > time::now() - 30d`
    );
    const rows = Array.isArray(result) ? result.flat() : [];
    const r = rows[0] ?? {};
    const totalKwh = safeNumber(r.total_kwh, 0);
    const totalCost = safeNumber(r.total_cost, 0);
    if (totalKwh < 100) return alerts;
    const effectiveRate = totalCost / totalKwh;
    // If effective rate > 25% above baseline rate, suspect wrong plan
    if (effectiveRate > cfg.avgRatePerKwh * 1.25) {
      if (await isRecentlyAlerted(db, 'tariff_mismatch', 'whole_site', 72)) return alerts;
      const waste = (effectiveRate - cfg.avgRatePerKwh) * totalKwh;
      alerts.push({
        rule_id: 'tariff_mismatch',
        severity: waste > 200 ? 'critical' : 'warning',
        zone: 'whole_site',
        metric_value: effectiveRate,
        expected_value: cfg.avgRatePerKwh,
        deviation_pct: Math.round((effectiveRate / cfg.avgRatePerKwh - 1) * 100),
        estimated_waste: annualizeWaste(waste / 30),
        description: `Effective rate ${formatCurrency(effectiveRate)}/kWh is ${Math.round((effectiveRate / cfg.avgRatePerKwh - 1) * 100)}% above baseline (${formatCurrency(cfg.avgRatePerKwh)}/kWh). Current tariff plan may be wrong — review with utility provider.`,
        context: { effective_rate: effectiveRate, baseline_rate: cfg.avgRatePerKwh, total_kwh: totalKwh, total_cost: totalCost },
        status: 'open',
        detected_at: new Date(),
      });
    }
  } catch (err) { console.warn('[energy] tariff_mismatch failed', err); }
  return alerts;
};

// Helper: local currency formatter
const formatCurrency = (n: number): string => `$${(n || 0).toFixed(2)}`;

// ---------------------------------------------------------------------------
// AI enhancement
// ---------------------------------------------------------------------------

const enhanceWithAI = async (alerts: EnergyAlert[]): Promise<void> => {
  const { callOpenAIChat } = await import('@/lib/openai.service.ts').catch(() => ({} as any));
  if (!callOpenAIChat || alerts.length === 0) return;

  const prompt = `You are a restaurant energy efficiency expert.
Analyze these energy-waste alerts and provide insight + savings recommendation.

Alerts (JSON):
${JSON.stringify(alerts.slice(0, 12).map(a => ({
  rule: a.rule_id,
  severity: a.severity,
  zone: a.zone,
  metric: a.metric_value,
  expected: a.expected_value,
  waste: a.estimated_waste,
  description: a.description,
})), null, 2)}

Respond with JSON array:
[{
  "rule": "<match rule_id>",
  "insight": "<max 200 chars — root cause + savings opportunity>",
  "recommendation": "adjust_thermostat" | "install_occupancy_sensor" | "repair_hvac" | "shift_to_off_peak" | "power_down_equipment" | "review_tariff_plan" | "dismiss"
}]`;

  try {
    const response = await callOpenAIChat([
      { role: 'system', content: 'You are an energy optimization AI. Respond only with valid JSON.' },
      { role: 'user', content: prompt },
    ], { temperature: 0.3, maxTokens: 800 });

    const text = typeof response === 'string' ? response : (response as any)?.content ?? '';
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return;
    const parsed = JSON.parse(jsonMatch[0]) as Array<{
      rule: string; insight?: string; recommendation?: EnergyRecommendation;
    }>;
    for (const item of parsed) {
      const alert = alerts.find(a => a.rule_id === item.rule);
      if (alert) {
        if (item.insight) alert.ai_insight = item.insight.slice(0, 200);
        if (item.recommendation) alert.ai_recommendation = item.recommendation;
      }
    }
  } catch (err) { console.warn('[energy] AI failed', err); }
};

// ---------------------------------------------------------------------------
// Main entry
// ---------------------------------------------------------------------------

export const runEnergyScan = async (
  db: ReturnType<typeof useDB>,
  config: EnergyConfig = DEFAULT_ENERGY_CONFIG,
  onProgress?: (current: number, total: number) => void
): Promise<{ alerts: EnergyAlert[]; checked: number }> => {
  const checks = [
    () => checkAfterHoursConsumption(db, config),
    () => checkPeakRateOverspend(db, config),
    () => checkWeekendAnomaly(db, config),
    () => checkBaselineDeviation(db, config),
    () => checkHvacDrift(db, config),
    () => checkEquipmentLeftOn(db, config),
    () => checkTariffMismatch(db, config),
  ];
  const total = checks.length;
  let allAlerts: EnergyAlert[] = [];

  for (let i = 0; i < checks.length; i++) {
    if (onProgress) onProgress(i, total);
    try {
      const alerts = await checks[i]();
      allAlerts.push(...alerts);
    } catch (err) { console.warn('[energy] check failed at', i, err); }
  }

  if (config.aiEnabled && allAlerts.length > 0) {
    await enhanceWithAI(allAlerts);
  }

  // Persist
  for (const alert of allAlerts) {
    try {
      await db.query(`CREATE energy_alert CONTENT $data`, {
        data: { ...alert, detected_at: alert.detected_at.toISOString() },
      });
    } catch { /* non-fatal */ }
  }

  if (onProgress) onProgress(total, total);
  return { alerts: allAlerts, checked: total };
};

// ---------------------------------------------------------------------------
// Logging helper
// ---------------------------------------------------------------------------

export const logEnergyReading = async (
  db: ReturnType<typeof useDB>,
  log: Omit<EnergyLog, 'id' | 'is_after_hours'> & { is_after_hours?: boolean }
): Promise<void> => {
  const cfg = DEFAULT_ENERGY_CONFIG;
  const hour = new Date(log.period_start).getHours();
  const isAfterHours = hour >= cfg.afterHoursStart || hour < cfg.afterHoursEnd;
  await db.query(`CREATE energy_log CONTENT $data`, {
    data: {
      ...log,
      is_after_hours: log.is_after_hours ?? isAfterHours,
      period_start: log.period_start.toISOString(),
      period_end: log.period_end.toISOString(),
    },
  });
};

// ---------------------------------------------------------------------------
// Read + update
// ---------------------------------------------------------------------------

export const getOpenEnergyAlerts = async (
  db: ReturnType<typeof useDB>
): Promise<EnergyAlert[]> => {
  try {
    const result = await db.query(
      `SELECT * FROM energy_alert WHERE status = 'open'
       ORDER BY CASE severity WHEN 'critical' THEN 0 WHEN 'warning' THEN 1 ELSE 2 END,
       estimated_waste DESC`
    );
    return Array.isArray(result) ? result.flat() : [];
  } catch { return []; }
};

export const getEnergySummary = async (
  db: ReturnType<typeof useDB>
): Promise<{
  totalAlerts: number;
  critical: number;
  warning: number;
  totalWaste: number;
  potentialSavings: number;
}> => {
  try {
    const result = await db.query(
      `SELECT count() AS total,
         math::count(severity = 'critical') AS critical,
         math::count(severity = 'warning') AS warning,
         math::sum(estimated_waste) AS total_waste
       FROM energy_alert WHERE status = 'open' GROUP ALL`
    );
    const rows = Array.isArray(result) ? result.flat() : [];
    const row = rows[0] ?? {};
    const totalWaste = safeNumber(row.total_waste, 0);
    // Potential savings: assume 60% of waste is recoverable
    return {
      totalAlerts: safeNumber(row.total, 0),
      critical: safeNumber(row.critical, 0),
      warning: safeNumber(row.warning, 0),
      totalWaste,
      potentialSavings: totalWaste * 0.6,
    };
  } catch {
    return { totalAlerts: 0, critical: 0, warning: 0, totalWaste: 0, potentialSavings: 0 };
  }
};

export const updateEnergyStatus = async (
  db: ReturnType<typeof useDB>, alertId: string, status: string
): Promise<void> => {
  await db.query(`UPDATE $id SET status = $status`, { id: alertId, status });
};
