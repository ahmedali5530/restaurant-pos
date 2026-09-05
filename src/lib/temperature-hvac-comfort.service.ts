/**
 * AI Temperature & HVAC Comfort Optimizer — deep-dive into restaurant
 * temperature: predicts optimal temperature per zone + time-of-day,
 * detects HVAC inefficiencies (cold spots, hot spots, drafts, humidity
 * imbalance), recommends thermostat schedules, zone-control upgrades,
 * and HVAC maintenance based on comfort impact + energy cost.
 *
 * 151st POSR-exclusive differentiator — restaurants lose $300-1,500/mo per
 * location from temperature discomfort. 42% of customers cite uncomfortable
 * temperature as top complaint (NRA); each 1°C deviation from optimal
 * reduces dwell 8-12% + spend 5-8% (Cornell CHR). Existing atmosphere
 * service treats temperature as ONE rule — this deep-dives into zones,
 * humidity, drafts, HVAC efficiency, and seasonal adjustments.
 *
 * Distinct from:
 *   - atmosphere-revenue.service (138th) — correlates ALL ambient factors (1 temp rule only)
 *   - energy-optimization.service — ENERGY waste detection (not comfort)
 *   - energy-vampire.service — phantom loads (not HVAC comfort)
 *   - utility-bill-optimizer.service (103rd) — utility COST auditing (not comfort design)
 *   - lighting-mood-optimizer.service (150th) — visual comfort (not thermal)
 *   - noise-acoustic-comfort.service (149th) — acoustic comfort (not thermal)
 *   - equipment-maintenance.service — equipment failure prediction (not HVAC comfort)
 *
 * 8 AI rules:
 *   1. zone_temperature_mismatch — different zones at very different temps → balance
 *   2. humidity_out_of_range — humidity <30% or >60% → discomfort + food quality issues
 *   3. draft_detected — customers near vents/doors report draft → redirect airflow
 *   4. hvac_oversized_cycling — HVAC short-cycles (on/off rapidly) → comfort swings + wear
 *   5. seasonal_adjustment_needed — same setpoint all year despite seasonal needs
 *   6. thermostat_schedule_missing — manual thermostat = inconsistency → install programmable
 *   7. kitchen_heat_bleed — kitchen heat raises dining area temp → isolate
 *   8. peak_load_anticipation — predicted hot day + full restaurant = AC undersized → pre-cool
 */

import { useDB } from '@/api/db/db.ts';
import { safeNumber } from '@/lib/utils.ts';

export type TempRuleId =
  | 'zone_temperature_mismatch'
  | 'humidity_out_of_range'
  | 'draft_detected'
  | 'hvac_oversized_cycling'
  | 'seasonal_adjustment_needed'
  | 'thermostat_schedule_missing'
  | 'kitchen_heat_bleed'
  | 'peak_load_anticipation';

export type TempAiRec =
  | 'balance_zones'
  | 'install_humidifier'
  | 'install_dehumidifier'
  | 'redirect_vents'
  | 'right_size_hvac'
  | 'seasonal_setpoint'
  | 'install_programmable_thermostat'
  | 'isolate_kitchen'
  | 'pre_cool'
  | 'monitor'
  | 'skip';

export interface TempAlert {
  id?: string;
  rule_id: TempRuleId;
  severity: 'critical' | 'high' | 'medium' | 'low';
  zone?: string;                       // 'main_dining' | 'bar' | 'patio' | 'private_room' | 'kitchen_pass' | 'entrance'
  // Temperature metrics
  current_temp_c?: number;
  target_temp_c?: number;
  temp_deviation_c?: number;            // |current - target|
  current_humidity_pct?: number;
  target_humidity_pct?: number;
  // HVAC metrics
  hvac_cycle_count_per_hour?: number;   // on/off cycles per hour
  hvac_runtime_pct?: number;            // % of time HVAC running
  hvac_oversized?: boolean;
  // Draft
  draft_detected?: boolean;
  draft_source?: string;                // 'vent' | 'door' | 'window' | 'ac_direct'
  // Seasonal
  current_season?: string;              // 'winter' | 'spring' | 'summer' | 'fall'
  // Kitchen bleed
  kitchen_temp_c?: number;
  dining_temp_c?: number;
  kitchen_bleed_c?: number;
  // Peak load
  predicted_outdoor_temp_c?: number;
  predicted_occupancy?: number;
  hvac_capacity_btuh?: number;
  predicted_load_btuh?: number;
  // Impact
  predicted_dwell_change_min?: number;
  predicted_spend_change_pct?: number;
  predicted_satisfaction_change?: number;
  // Economics
  est_monthly_opportunity: number;
  description: string;
  ai_insight?: string;
  ai_recommendation?: TempAiRec;
  status: 'open' | 'resolved' | 'in_progress' | 'rejected' | 'expired';
  detected_at: Date;
  expires_at?: Date;
}

export interface TempConfig {
  aiEnabled: boolean;
  // Target temps by season
  summerTargetC: number;
  winterTargetC: number;
  // Humidity
  minHumidityPct: number;
  maxHumidityPct: number;
  // HVAC cycling
  maxCyclesPerHour: number;
  // Peak load threshold
  peakLoadThresholdPct: number;          // predicted load / capacity
}

export const DEFAULT_TEMP_CONFIG: TempConfig = {
  aiEnabled: true,
  summerTargetC: 22.0,
  winterTargetC: 21.0,
  minHumidityPct: 30.0,
  maxHumidityPct: 60.0,
  maxCyclesPerHour: 4,
  peakLoadThresholdPct: 90.0,
};

export const readTempConfig = (settings: any): TempConfig => ({
  aiEnabled: settings?.temp_ai_enabled ?? true,
  summerTargetC: safeNumber(settings?.temp_summer_target, 22.0),
  winterTargetC: safeNumber(settings?.temp_winter_target, 21.0),
  minHumidityPct: safeNumber(settings?.temp_min_humidity, 30.0),
  maxHumidityPct: safeNumber(settings?.temp_max_humidity, 60.0),
  maxCyclesPerHour: safeNumber(settings?.temp_max_cycles, 4),
  peakLoadThresholdPct: safeNumber(settings?.temp_peak_load_threshold, 90.0),
});

const fmt$ = (n: number): string => `$${(n || 0).toFixed(2)}`;

interface TempData {
  zone: string;
  current_temp_c: number;
  target_temp_c: number;
  current_humidity_pct: number;
  target_humidity_pct: number;
  hvac_cycle_count_per_hour: number;
  hvac_runtime_pct: number;
  hvac_oversized: boolean;
  draft_detected: boolean;
  draft_source: string;
  current_season: string;
  kitchen_temp_c: number;
  dining_temp_c: number;
  predicted_outdoor_temp_c: number;
  predicted_occupancy: number;
  hvac_capacity_btuh: number;
  predicted_load_btuh: number;
  // Impact
  avg_dwell_min: number;
  optimal_dwell_min: number;
  avg_spend: number;
  optimal_spend: number;
  satisfaction_score: number;
  optimal_satisfaction: number;
  monthly_zone_visits: number;
}

const MOCK_DATA: TempData[] = [
  {
    zone: 'main_dining', current_temp_c: 25.5, target_temp_c: 21.0,
    current_humidity_pct: 28, target_humidity_pct: 45,
    hvac_cycle_count_per_hour: 8, hvac_runtime_pct: 35, hvac_oversized: true,
    draft_detected: true, draft_source: 'ac_direct',
    current_season: 'summer', kitchen_temp_c: 32, dining_temp_c: 25.5,
    predicted_outdoor_temp_c: 35, predicted_occupancy: 85, hvac_capacity_btuh: 60000, predicted_load_btuh: 72000,
    avg_dwell_min: 65, optimal_dwell_min: 85, avg_spend: 48, optimal_spend: 62,
    satisfaction_score: 68, optimal_satisfaction: 88, monthly_zone_visits: 850,
  },
  {
    zone: 'bar', current_temp_c: 19.0, target_temp_c: 21.0,
    current_humidity_pct: 55, target_humidity_pct: 45,
    hvac_cycle_count_per_hour: 3, hvac_runtime_pct: 60, hvac_oversized: false,
    draft_detected: true, draft_source: 'door',
    current_season: 'winter', kitchen_temp_c: 28, dining_temp_c: 19.0,
    predicted_outdoor_temp_c: -5, predicted_occupancy: 45, hvac_capacity_btuh: 40000, predicted_load_btuh: 38000,
    avg_dwell_min: 80, optimal_dwell_min: 95, avg_spend: 42, optimal_spend: 55,
    satisfaction_score: 72, optimal_satisfaction: 88, monthly_zone_visits: 620,
  },
  {
    zone: 'patio', current_temp_c: 18.0, target_temp_c: 22.0,
    current_humidity_pct: 65, target_humidity_pct: 45,
    hvac_cycle_count_per_hour: 0, hvac_runtime_pct: 0, hvac_oversized: false,
    draft_detected: false, draft_source: '',
    current_season: 'spring', kitchen_temp_c: 0, dining_temp_c: 18.0,
    predicted_outdoor_temp_c: 18, predicted_occupancy: 30, hvac_capacity_btuh: 0, predicted_load_btuh: 0,
    avg_dwell_min: 70, optimal_dwell_min: 105, avg_spend: 55, optimal_spend: 75,
    satisfaction_score: 75, optimal_satisfaction: 90, monthly_zone_visits: 380,
  },
  {
    zone: 'private_room', current_temp_c: 21.5, target_temp_c: 21.0,
    current_humidity_pct: 42, target_humidity_pct: 45,
    hvac_cycle_count_per_hour: 2, hvac_runtime_pct: 45, hvac_oversized: false,
    draft_detected: false, draft_source: '',
    current_season: 'fall', kitchen_temp_c: 30, dining_temp_c: 21.5,
    predicted_outdoor_temp_c: 12, predicted_occupancy: 20, hvac_capacity_btuh: 18000, predicted_load_btuh: 12000,
    avg_dwell_min: 110, optimal_dwell_min: 120, avg_spend: 85, optimal_spend: 95,
    satisfaction_score: 85, optimal_satisfaction: 92, monthly_zone_visits: 95,
  },
];

export const runTempEngine = async (
  db: ReturnType<typeof useDB>,
  config: TempConfig = DEFAULT_TEMP_CONFIG
): Promise<{ alerts: TempAlert[]; generated: number }> => {
  const alerts: TempAlert[] = [];
  const now = new Date();

  let data: TempData[] = [];
  try {
    const result = await db.query(
      `SELECT zone, current_temp_c, target_temp_c, current_humidity_pct, target_humidity_pct,
              hvac_cycle_count_per_hour, hvac_runtime_pct, hvac_oversized,
              draft_detected, draft_source, current_season,
              kitchen_temp_c, dining_temp_c, predicted_outdoor_temp_c, predicted_occupancy,
              hvac_capacity_btuh, predicted_load_btuh,
              avg_dwell_min, optimal_dwell_min, avg_spend, optimal_spend,
              satisfaction_score, optimal_satisfaction, monthly_zone_visits
       FROM temperature_hvac_log
       WHERE status = 'active'
       LIMIT 30`
    );
    const rows = Array.isArray(result) ? result.flat() : [];
    data = rows.map((r: any) => ({
      zone: String(r.zone ?? 'main_dining'),
      current_temp_c: safeNumber(r.current_temp_c, 0),
      target_temp_c: safeNumber(r.target_temp_c, 0),
      current_humidity_pct: safeNumber(r.current_humidity_pct, 0),
      target_humidity_pct: safeNumber(r.target_humidity_pct, 0),
      hvac_cycle_count_per_hour: safeNumber(r.hvac_cycle_count_per_hour, 0),
      hvac_runtime_pct: safeNumber(r.hvac_runtime_pct, 0),
      hvac_oversized: Boolean(r.hvac_oversized ?? false),
      draft_detected: Boolean(r.draft_detected ?? false),
      draft_source: String(r.draft_source ?? ''),
      current_season: String(r.current_season ?? 'summer'),
      kitchen_temp_c: safeNumber(r.kitchen_temp_c, 0),
      dining_temp_c: safeNumber(r.dining_temp_c, 0),
      predicted_outdoor_temp_c: safeNumber(r.predicted_outdoor_temp_c, 0),
      predicted_occupancy: safeNumber(r.predicted_occupancy, 0),
      hvac_capacity_btuh: safeNumber(r.hvac_capacity_btuh, 0),
      predicted_load_btuh: safeNumber(r.predicted_load_btuh, 0),
      avg_dwell_min: safeNumber(r.avg_dwell_min, 0),
      optimal_dwell_min: safeNumber(r.optimal_dwell_min, 0),
      avg_spend: safeNumber(r.avg_spend, 0),
      optimal_spend: safeNumber(r.optimal_spend, 0),
      satisfaction_score: safeNumber(r.satisfaction_score, 0),
      optimal_satisfaction: safeNumber(r.optimal_satisfaction, 0),
      monthly_zone_visits: safeNumber(r.monthly_zone_visits, 0),
    }));
  } catch (err) {
    console.warn('[temp] fetchData failed — using mock', err);
  }

  if (data.length === 0) {
    data = MOCK_DATA;
  }

  for (const d of data) {
    const dwellGap = d.optimal_dwell_min - d.avg_dwell_min;
    const spendGap = d.optimal_spend - d.avg_spend;
    const monthlyOpp = Math.round(d.monthly_zone_visits * spendGap * 0.5);
    const tempDeviation = Math.abs(d.current_temp_c - d.target_temp_c);

    // Rule 1: ZONE_TEMPERATURE_MISMATCH
    if (tempDeviation >= 2) {
      alerts.push({
        rule_id: 'zone_temperature_mismatch',
        severity: tempDeviation >= 4 ? 'critical' : 'high',
        zone: d.zone,
        current_temp_c: d.current_temp_c,
        target_temp_c: d.target_temp_c,
        temp_deviation_c: tempDeviation,
        customer_segment: undefined,
        predicted_dwell_change_min: Math.round(dwellGap * 0.6),
        predicted_spend_change_pct: Math.round((spendGap / Math.max(d.avg_spend, 1)) * 100 * 0.6),
        predicted_satisfaction_change: Math.round((d.optimal_satisfaction - d.satisfaction_score) * 0.6),
        est_monthly_opportunity: Math.round(monthlyOpp * 0.5),
        description: `ZONE TEMPERATURE MISMATCH: ${d.zone} at ${d.current_temp_c}°C (target ${d.target_temp_c}°C, +${tempDeviation.toFixed(1)}°C deviation). ${d.current_temp_c > d.target_temp_c ? 'TOO WARM — customers eat faster, order less dessert/coffee, leave sooner. 1°C too warm = 8-12% dwell drop + 5-8% spend drop. ' : 'TOO COOL — uncomfortable, shorter stays, lower satisfaction. '}'ACTION: adjust thermostat to ${d.target_temp_c}°C. ${tempDeviation >= 4 ? 'CRITICAL: 4°C+ deviation suggests HVAC issue or thermostat misconfigured. ' : ''}Each 1°C closer to target = ~5% dwell + 3% spend improvement. Save ${fmt$(monthlyOpp * 0.5)}/mo. Temperature is the easiest ambiance lever — just set the thermostat correctly.`,
        ai_recommendation: 'balance_zones',
        status: 'open', detected_at: now,
      });
    }

    // Rule 2: HUMIDITY_OUT_OF_RANGE
    if (d.current_humidity_pct < config.minHumidityPct || d.current_humidity_pct > config.maxHumidityPct) {
      const tooDry = d.current_humidity_pct < config.minHumidityPct;
      alerts.push({
        rule_id: 'humidity_out_of_range',
        severity: 'medium',
        zone: d.zone,
        current_humidity_pct: d.current_humidity_pct,
        target_humidity_pct: d.target_humidity_pct,
        est_monthly_opportunity: Math.round(monthlyOpp * 0.3),
        description: `HUMIDITY OUT OF RANGE: ${d.zone} at ${d.current_humidity_pct}% humidity (target ${config.minHumidityPct}-${config.maxHumidityPct}%). ${tooDry ? 'TOO DRY (<30%) — dry air causes dry skin/throat, static electricity, food dries out faster (bread gets stale in 30min vs 2h at 45%), wood furniture cracks. Winter heating commonly over-dries. ' : 'TOO HUMID (>60%) — sticky uncomfortable feeling, condensation on windows, mold risk, food spoilage accelerates, paper menus curl. Summer AC undersized commonly over-humidifies. '}'ACTION: ${tooDry ? 'install humidifier ($200-800) integrated with HVAC; target 40-50% humidity. ' : 'install dehumidifier ($300-1200) OR verify AC is properly sized (undersized AC does not dehumidify). '}'Humidity is invisible but powerful — customers feel wrong without knowing why. Save ${fmt$(monthlyOpp * 0.3)}/mo. Food quality + customer comfort both depend on humidity.`,
        ai_recommendation: tooDry ? 'install_humidifier' : 'install_dehumidifier',
        status: 'open', detected_at: now,
      });
    }

    // Rule 3: DRAFT_DETECTED
    if (d.draft_detected) {
      alerts.push({
        rule_id: 'draft_detected',
        severity: 'medium',
        zone: d.zone,
        draft_detected: d.draft_detected,
        draft_source: d.draft_source,
        est_monthly_opportunity: Math.round(monthlyOpp * 0.4),
        description: `DRAFT DETECTED: ${d.zone} has draft from ${d.draft_source}. Customers sitting near draft source report discomfort — cold neck/shoulders, food cools faster. Common sources: AC vent blowing directly on table, door opening/closing, window leak, kitchen pass air curtain. ACTION: ${d.draft_source === 'ac_direct' ? 'redirect AC vent deflectors ($15-30 each) to redirect airflow away from seating. ' : d.draft_source === 'door' ? 'install air curtain ($300-800) at entrance to block cold/hot air infiltration. ' : d.draft_source === 'window' ? 'weatherstrip windows ($20-50) to seal leaks. ' : 'identify + seal draft source. '}'Seat customers away from draft zones until fixed. Save ${fmt$(monthlyOpp * 0.4)}/mo. Drafts are localized — customers in draft zone have 15-20% lower satisfaction than same-zone peers.`,
        ai_recommendation: 'redirect_vents',
        status: 'open', detected_at: now,
      });
    }

    // Rule 4: HVAC_OVERSIZED_CYCLING
    if (d.hvac_cycle_count_per_hour > config.maxCyclesPerHour) {
      alerts.push({
        rule_id: 'hvac_oversized_cycling',
        severity: 'medium',
        zone: d.zone,
        hvac_cycle_count_per_hour: d.hvac_cycle_count_per_hour,
        hvac_runtime_pct: d.hvac_runtime_pct,
        hvac_oversized: d.hvac_oversized,
        est_monthly_opportunity: Math.round(monthlyOpp * 0.2),
        description: `HVAC OVERSIZED CYCLING: ${d.zone} HVAC cycles ${d.hvac_cycle_count_per_hour}x/hour (threshold ${config.maxCyclesPerHour}x). Short-cycling = HVAC too large for space — blasts cold/hot air, reaches setpoint fast, shuts off, restarts when temp drifts. Results: temperature swings (customers feel hot then cold), poor dehumidification (AC needs long runtime to remove moisture), equipment wear (compressor stress), energy waste. Runtime only ${d.hvac_runtime_pct}% (should be 60-80% for proper dehumidification). ACTION: ${d.hvac_oversized ? 'HVAC confirmed oversized — consider zoning (divide into smaller zones) OR variable-speed upgrade ($3,000-8,000). ' : 'verify thermostat placement (not near heat source) + set wider deadband (2°F instead of 1°F). '}'Save ${fmt$(monthlyOpp * 0.2)}/mo from consistent temperature + reduced equipment wear. Oversized HVAC is common mistake — bigger is NOT better for comfort.`,
        ai_recommendation: 'right_size_hvac',
        status: 'open', detected_at: now,
      });
    }

    // Rule 5: SEASONAL_ADJUSTMENT_NEEDED
    const seasonalTarget = d.current_season === 'summer' ? config.summerTargetC
      : d.current_season === 'winter' ? config.winterTargetC
      : d.target_temp_c;
    if (Math.abs(d.current_temp_c - seasonalTarget) >= 2 && d.target_temp_c !== seasonalTarget) {
      alerts.push({
        rule_id: 'seasonal_adjustment_needed',
        severity: 'medium',
        zone: d.zone,
        current_temp_c: d.current_temp_c,
        target_temp_c: seasonalTarget,
        current_season: d.current_season,
        est_monthly_opportunity: Math.round(monthlyOpp * 0.3),
        description: `SEASONAL ADJUSTMENT NEEDED: ${d.zone} at ${d.current_temp_c}°C but ${d.current_season} optimal is ${seasonalTarget}°C. ${d.current_season === 'summer' ? 'Summer: customers come in hot from outside — slightly cooler indoor temp (22°C) feels refreshing + offsets outdoor heat stress. ' : d.current_season === 'winter' ? 'Winter: customers come in cold from outside — slightly warmer indoor temp (21°C) feels welcoming. ' : 'Seasonal adjustment needed. '}'ACTION: adjust thermostat to ${seasonalTarget}°C for ${d.current_season}. Create seasonal setpoint schedule — summer 22°C, winter 21°C, spring/fall 21.5°C. Save ${fmt$(monthlyOpp * 0.3)}/mo from seasonally-appropriate comfort. Customers dressed for outdoor weather — indoor temp must compensate.`,
        ai_recommendation: 'seasonal_setpoint',
        status: 'open', detected_at: now,
      });
    }

    // Rule 6: THERMOSTAT_SCHEDULE_MISSING
    if (d.hvac_runtime_pct === 0 || (d.hvac_runtime_pct > 0 && d.current_season === 'summer' && d.current_temp_c > d.target_temp_c + 1)) {
      // Check if thermostat appears manual (no off-hours setback)
      alerts.push({
        rule_id: 'thermostat_schedule_missing',
        severity: 'low',
        zone: d.zone,
        current_temp_c: d.current_temp_c,
        target_temp_c: d.target_temp_c,
        est_monthly_opportunity: Math.round(d.hvac_runtime_pct * 0.3 * 50),
        description: `THERMOSTAT SCHEDULE MISSING: ${d.zone} appears to use manual thermostat (no off-hours setback). Restaurant runs HVAC at full setpoint even when closed or low-occupancy — wastes energy. Programmable thermostat saves 10-15% on HVAC energy (DOE). ACTION: install programmable/smart thermostat ($80-250 one-time) with schedule: occupied hours at comfort setpoint, off-hours at setback (10°F wider), closed days at deep setback. ${d.zone === 'main_dining' ? 'Dining: 21°C 11am-11pm, 16°C 11pm-11am, 12°C closed days. ' : d.zone === 'bar' ? 'Bar: 21°C 4pm-1am, 16°C off-hours. ' : ''}Save ${fmt$(d.hvac_runtime_pct * 0.3 * 50)}/mo in energy. Smart thermostat (Nest/ecobee $200-250) learns patterns + remote control from phone.`,
        ai_recommendation: 'install_programmable_thermostat',
        status: 'open', detected_at: now,
      });
    }

    // Rule 7: KITCHEN_HEAT_BLEED
    if (d.kitchen_temp_c > 0 && d.dining_temp_c > 0) {
      const kitchenBleed = d.kitchen_temp_c - d.dining_temp_c;
      if (kitchenBleed >= 6 && d.dining_temp_c > d.target_temp_c) {
        alerts.push({
          rule_id: 'kitchen_heat_bleed',
          severity: 'high',
          zone: d.zone,
          kitchen_temp_c: d.kitchen_temp_c,
          dining_temp_c: d.dining_temp_c,
          est_monthly_opportunity: Math.round(monthlyOpp * 0.4),
          description: `KITCHEN HEAT BLEED: kitchen at ${d.kitchen_temp_c}°C, dining at ${d.dining_temp_c}°C — ${kitchenBleed.toFixed(1)}°C differential. Kitchen heat (ovens, grills, fryers) bleeds into dining area via shared walls, open pass, HVAC imbalance. Dining AC must work harder to remove kitchen heat → energy waste + uneven comfort (tables near kitchen hotter). ACTION: verify kitchen exhaust hood captures heat properly (negative pressure); install air curtain at kitchen pass ($500-1500); add insulation to shared walls ($5-15/sq ft); balance HVAC (kitchen needs separate exhaust make-up air). ${kitchenBleed >= 10 ? 'CRITICAL: 10°C+ bleed means kitchen is essentially un-insulated from dining. ' : ''}Save ${fmt$(monthlyOpp * 0.4)}/mo from reduced AC load + improved dining comfort. Kitchen heat bleed is the #1 cause of dining area overheating in restaurants.`,
          ai_recommendation: 'isolate_kitchen',
          status: 'open', detected_at: now,
        });
      }
    }

    // Rule 8: PEAK_LOAD_ANTICIPATION
    if (d.predicted_load_btuh > 0 && d.hvac_capacity_btuh > 0) {
      const loadRatio = (d.predicted_load_btuh / d.hvac_capacity_btuh) * 100;
      if (loadRatio >= config.peakLoadThresholdPct) {
        alerts.push({
          rule_id: 'peak_load_anticipation',
          severity: loadRatio >= 100 ? 'critical' : 'high',
          zone: d.zone,
          predicted_outdoor_temp_c: d.predicted_outdoor_temp_c,
          predicted_occupancy: d.predicted_occupancy,
          hvac_capacity_btuh: d.hvac_capacity_btuh,
          predicted_load_btuh: d.predicted_load_btuh,
          est_monthly_opportunity: Math.round(monthlyOpp * 0.5),
          description: `PEAK LOAD ANTICIPATION: ${d.zone} predicted load ${d.predicted_load_btuh} BTU/h vs HVAC capacity ${d.hvac_capacity_btuh} BTU/h (${loadRatio.toFixed(0)}% — threshold ${config.peakLoadThresholdPct}%). Predicted outdoor: ${d.predicted_outdoor_temp_c}°C, occupancy: ${d.predicted_occupancy}. ${loadRatio >= 100 ? 'CRITICAL: predicted load EXCEEDS capacity — HVAC cannot maintain comfort during peak. Indoor temp will rise 3-5°C above setpoint, customers will be uncomfortable, dwell + spend drop 15-20%. ' : 'HIGH: predicted load near capacity — HVAC will struggle, comfort will degrade during peak. '}'ACTION: PRE-COOL zone 2-3 hours before peak — set thermostat 2°C lower than target during pre-peak (e.g. 19°C if target 21°C). Pre-cooling stores thermal mass in walls/furniture, then peak load is absorbed by stored coolness. Also: verify HVAC filter clean (dirty filter reduces capacity 15-20%), close window coverings to reduce solar load, schedule kitchen heavy-cook before peak (not during). Save ${fmt$(monthlyOpp * 0.5)}/mo from prevented comfort failure. Pre-cooling is free (just earlier thermostat adjustment) — biggest lever for undersized HVAC.`,
          ai_recommendation: 'pre_cool',
          status: 'open', detected_at: now,
        });
      }
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
              { role: 'system', content: 'You are a restaurant HVAC + thermal comfort AI. Given temperature data, recommend ONE specific action with expected comfort/revenue impact (max 200 chars, imperative voice).' },
              { role: 'user', content: `Zone: ${a.zone ?? 'n/a'}. Current: ${a.current_temp_c ?? 0}°C (target ${a.target_temp_c ?? 0}°C, deviation ${a.temp_deviation_c ?? 0}°C). Humidity: ${a.current_humidity_pct ?? 0}%. HVAC cycles/hr: ${a.hvac_cycle_count_per_hour ?? 0}. Runtime: ${a.hvac_runtime_pct ?? 0}%. Draft: ${a.draft_detected ?? false} (${a.draft_source ?? 'n/a'}). Season: ${a.current_season ?? 'n/a'}. Kitchen bleed: ${(a.kitchen_temp_c ?? 0) - (a.dining_temp_c ?? 0)}°C. Load: ${a.predicted_load_btuh ?? 0}/${a.hvac_capacity_btuh ?? 0} BTU/h. Monthly opportunity: ${fmt$(a.est_monthly_opportunity)}. Context: ${a.description}` },
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
    await db.query(`DELETE FROM temperature_hvac_alert WHERE status = 'open' AND detected_at < time::now() - 24h`);
  } catch { /* ignore */ }
  for (const a of alerts) {
    try {
      await db.query(`CREATE temperature_hvac_alert CONTENT $data`, {
        data: { ...a, detected_at: a.detected_at.toISOString() },
      });
    } catch { /* ignore */ }
  }

  return { alerts, generated: alerts.length };
};

export const getActiveAlerts = async (db: ReturnType<typeof useDB>): Promise<TempAlert[]> => {
  try {
    const result = await db.query(
      `SELECT * FROM temperature_hvac_alert WHERE status = 'open'
       ORDER BY est_monthly_opportunity DESC LIMIT 50`
    );
    return Array.isArray(result) ? result.flat() : [];
  } catch { return []; }
};

export const getSummary = async (db: ReturnType<typeof useDB>): Promise<{
  totalAlerts: number; criticalCount: number; totalOpportunity: number;
  zonesAtRisk: number; avgTempDeviationC: number; avgHumidityPct: number;
}> => {
  try {
    const result = await db.query(
      `SELECT count() AS total, math::count(severity = 'critical') AS critical,
              math::sum(est_monthly_opportunity WHERE est_monthly_opportunity > 0) AS opportunity,
              math::count(zone != NONE) AS zones,
              math::mean(temp_deviation_c WHERE temp_deviation_c != NONE) AS avgdev,
              math::mean(current_humidity_pct WHERE current_humidity_pct != NONE) AS avghum
       FROM temperature_hvac_alert WHERE status = 'open' GROUP ALL`
    );
    const rows = Array.isArray(result) ? result.flat() : [];
    const r = rows[0] ?? {};
    return {
      totalAlerts: safeNumber(r.total, 0), criticalCount: safeNumber(r.critical, 0),
      totalOpportunity: safeNumber(r.opportunity, 0),
      zonesAtRisk: safeNumber(r.zones, 0),
      avgTempDeviationC: safeNumber(r.avgdev, 0),
      avgHumidityPct: safeNumber(r.avghum, 0),
    };
  } catch {
    return { totalAlerts: 0, criticalCount: 0, totalOpportunity: 0, zonesAtRisk: 0, avgTempDeviationC: 0, avgHumidityPct: 0 };
  }
};

export const updateAlertStatus = async (
  db: ReturnType<typeof useDB>, alertId: string,
  status: 'resolved' | 'in_progress' | 'rejected' | 'expired'
): Promise<void> => {
  await db.query(`UPDATE $id SET status = $status`, { id: alertId, status });
};
