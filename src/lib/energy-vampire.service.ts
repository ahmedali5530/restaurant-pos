/**
 * AI Energy Vampire Detector — phantom/standby load detection.
 *
 * 50th POSR-exclusive differentiator — restaurants waste 5-10% of electricity
 * on "vampire" / "phantom" loads (DOE Energy Star, NRCan). $300-$1,200/year
 * per location lost to displays glowing, idle kitchen equipment, chargers,
 * smart appliances that never truly sleep, old equipment with broken sleep.
 *
 * Distinct from:
 *   - energy-optimization.service (AFTER_HOURS_CONSUMPTION = equipment LEFT ON;
 *     EQUIPMENT_LEFT_ON = usage when no orders — neither detects STANDBY
 *     phantom load when equipment is OFF)
 *   - food-safety.service (HACCP temp logs — not energy)
 *
 * This service detects BASELINE LOAD when restaurant is CLOSED, identifies
 * which devices contribute to phantom drain, calculates annual waste, CO2,
 * recommends smart plugs / timers / replacement with payback calculation.
 */

import { useDB } from '@/api/db/db.ts';
import { safeNumber } from '@/lib/utils.ts';

export type VampireRuleId =
  | 'standby_phantom_load'
  | 'always_on_candidate'
  | 'inefficient_aging'
  | 'unplug_opportunity'
  | 'smart_plug_roi';

export type VampireAiRec =
  | 'install_smart_plug'
  | 'unplug_overnight'
  | 'replace_equipment'
  | 'enable_sleep_mode'
  | 'monitor';

export interface EnergyVampireAlert {
  id?: string;
  rule_id: VampireRuleId;
  severity: 'critical' | 'high' | 'medium' | 'low';
  equipment_name?: string;
  location?: string;
  standby_watts: number;
  annual_kwh: number;
  annual_cost: number;
  co2_kg_per_year: number;
  smart_plug_cost?: number;
  payback_months?: number;
  description: string;
  ai_insight?: string;
  ai_recommendation?: VampireAiRec;
  status: 'open' | 'mitigated' | 'declined' | 'expired';
  detected_at: Date;
  expires_at?: Date;
}

export interface VampireConfig {
  aiEnabled: boolean;
  electricityRate: number;
  minStandbyWatts: number;
  closedHoursStart: number;
}

export const DEFAULT_VAMPIRE_CONFIG: VampireConfig = {
  aiEnabled: true,
  electricityRate: 0.12,
  minStandbyWatts: 5,
  closedHoursStart: 23,
};

export const readVampireConfig = (settings: any): VampireConfig => ({
  aiEnabled: settings?.vampire_ai_enabled ?? true,
  electricityRate: safeNumber(settings?.vampire_electricity_rate, 0.12),
  minStandbyWatts: safeNumber(settings?.vampire_min_standby_watts, 5),
  closedHoursStart: safeNumber(settings?.vampire_closed_hours_start, 23),
});

const fmt$ = (n: number): string => `$${(n || 0).toFixed(2)}`;

// CO2 emissions: 0.42 kg CO2 per kWh (US grid average)
const CO2_PER_KWH = 0.42;
// Smart plug cost: $25 retail
const SMART_PLUG_COST = 25;
// Restaurant open hours per year: ~4500 (12h × 365)
const OPEN_HOURS_PER_YEAR = 4380;
// Total hours per year
const HOURS_PER_YEAR = 8760;

// Common restaurant vampire equipment catalog
// (used when no individual device monitoring exists — heuristic estimates)
const VAMPIRE_EQUIPMENT_CATALOG = [
  { name: 'POS Terminals (5×)', location: 'Front Counter', watts: 35, count: 5 },
  { name: 'Kitchen Display Monitors (3×)', location: 'Kitchen', watts: 25, count: 3 },
  { name: 'Microwave (standby clock)', location: 'Kitchen', watts: 3, count: 1 },
  { name: 'Coffee Machine (idle warmer)', location: 'Kitchen', watts: 45, count: 1 },
  { name: 'Ice Maker (always-on compressor)', location: 'Bar', watts: 80, count: 1 },
  { name: 'POS Printer (5×)', location: 'Front Counter', watts: 8, count: 5 },
  { name: 'Wi-Fi Router + Modem', location: 'Office', watts: 12, count: 1 },
  { name: 'Security Camera DVR', location: 'Office', watts: 35, count: 1 },
  { name: 'Sound System (idle)', location: 'Dining Area', watts: 18, count: 1 },
  { name: 'Bluetooth Speaker (charging)', location: 'Bar', watts: 5, count: 1 },
  { name: 'Tablet Chargers (4×)', location: 'Front Counter', watts: 4, count: 4 },
  { name: 'Fridge Display LED (always-on)', location: 'Bar', watts: 15, count: 1 },
];

// ---------------------------------------------------------------------------
// Engine
// ---------------------------------------------------------------------------

/**
 * Run the energy vampire detector engine.
 * Without per-device sub-metering, uses the equipment catalog + open-hours
 * to estimate phantom drain per device. When individual device monitoring
 * is added (energy_log table with device_id), this can be enhanced.
 */
export const runVampireEngine = async (
  db: ReturnType<typeof useDB>,
  config: VampireConfig = DEFAULT_VAMPIRE_CONFIG
): Promise<{ alerts: EnergyVampireAlert[]; generated: number }> => {
  const alerts: EnergyVampireAlert[] = [];
  const now = new Date();

  // 1. Try to fetch actual energy logs (if device-level metering exists)
  let actualDevices: Array<{ device_name: string; location: string; avg_watts_closed: number }> = [];
  try {
    const result = await db.query(
      `SELECT
         device_name,
         location,
         math::mean(value) AS avg_watts_closed
       FROM energy_log
       WHERE time::hour(recorded_at) >= ${config.closedHoursStart}
          OR time::hour(recorded_at) < 6
       GROUP BY device_name, location
       LIMIT 50`
    );
    const rows = Array.isArray(result) ? result.flat() : [];
    actualDevices = rows.map((r: any) => ({
      device_name: String(r.device_name ?? 'Unknown Device'),
      location: String(r.location ?? '—'),
      avg_watts_closed: safeNumber(r.avg_watts_closed, 0),
    })).filter(d => d.avg_watts_closed >= config.minStandbyWatts);
  } catch (err) {
    // energy_log table may not exist — fall back to catalog
    console.warn('[vampire] fetchActualDevices failed, using catalog', err);
  }

  // 2. If no actual data, use catalog (heuristic estimates)
  const devices = actualDevices.length > 0
    ? actualDevices.map(d => ({ name: d.device_name, location: d.location, watts: d.avg_watts_closed, count: 1 }))
    : VAMPIRE_EQUIPMENT_CATALOG.map(e => ({ name: e.name, location: e.location, watts: e.watts, count: e.count }));

  // 3. Generate alerts per device
  for (const device of devices) {
    const totalWatts = device.watts * device.count;
    if (totalWatts < config.minStandbyWatts) continue;

    // Annual kWh wasted: watts × closed_hours_per_year / 1000
    // Closed hours = total hours - open hours
    const closedHoursPerYear = HOURS_PER_YEAR - OPEN_HOURS_PER_YEAR;
    const annualKwh = (totalWatts * closedHoursPerYear) / 1000;
    const annualCost = annualKwh * config.electricityRate;
    const co2Kg = annualKwh * CO2_PER_KWH;

    // Skip if too small to bother
    if (annualCost < 1) continue;

    // Smart plug ROI
    const smartPlugTotalCost = SMART_PLUG_COST * Math.max(1, Math.ceil(device.count / 2)); // 1 plug per 2 devices
    const paybackMonths = annualCost > 0 ? (smartPlugTotalCost / annualCost) * 12 : 0;

    // Determine rule based on wattage
    let ruleId: VampireRuleId;
    let severity: 'critical' | 'high' | 'medium' | 'low';
    let aiRec: VampireAiRec;
    let desc = '';

    if (totalWatts >= 80) {
      // High draw — always-on compressor type
      ruleId = 'always_on_candidate';
      severity = annualCost > 200 ? 'critical' : 'high';
      aiRec = 'enable_sleep_mode';
      desc = `${device.name} draws ${totalWatts}W in standby — ${annualKwh.toFixed(0)} kWh/yr wasted = ${fmt$(annualCost)}/yr (${co2Kg.toFixed(0)} kg CO2). Critical vampire: investigate sleep mode or timer.`;
    } else if (totalWatts >= 30) {
      // Medium draw — POS terminals, displays
      ruleId = 'standby_phantom_load';
      severity = annualCost > 100 ? 'high' : 'medium';
      aiRec = 'install_smart_plug';
      desc = `${device.name} draws ${totalWatts}W standby — ${annualKwh.toFixed(0)} kWh/yr = ${fmt$(annualCost)}/yr (${co2Kg.toFixed(0)} kg CO2). Smart plug pays back in ${paybackMonths.toFixed(1)} months.`;
    } else if (totalWatts >= 10) {
      // Low-medium draw — routers, sound systems
      ruleId = 'unplug_opportunity';
      severity = 'medium';
      aiRec = 'unplug_overnight';
      desc = `${device.name} draws ${totalWatts}W — ${annualKwh.toFixed(0)} kWh/yr = ${fmt$(annualCost)}/yr. Unplug overnight when not in use.`;
    } else if (totalWatts >= 5) {
      // Small draw — chargers, small displays
      ruleId = 'unplug_opportunity';
      severity = 'low';
      aiRec = 'unplug_overnight';
      desc = `${device.name} draws ${totalWatts}W — ${annualKwh.toFixed(0)} kWh/yr = ${fmt$(annualCost)}/yr. Easy fix: power strip with switch.`;
    } else {
      continue; // too small
    }

    alerts.push({
      rule_id: ruleId,
      severity,
      equipment_name: device.name,
      location: device.location,
      standby_watts: Math.round(totalWatts * 10) / 10,
      annual_kwh: Math.round(annualKwh * 10) / 10,
      annual_cost: Math.round(annualCost * 100) / 100,
      co2_kg_per_year: Math.round(co2Kg * 10) / 10,
      smart_plug_cost: ruleId === 'standby_phantom_load' || ruleId === 'always_on_candidate'
        ? Math.round(smartPlugTotalCost * 100) / 100
        : undefined,
      payback_months: ruleId === 'standby_phantom_load' || ruleId === 'always_on_candidate'
        ? Math.round(paybackMonths * 10) / 10
        : undefined,
      description: desc,
      ai_recommendation: aiRec,
      status: 'open',
      detected_at: now,
    });
  }

  // 4. Generate aggregate smart_plug_roi alert if total waste is significant
  const totalAnnualCost = alerts.reduce((s, a) => s + a.annual_cost, 0);
  if (totalAnnualCost > 200) {
    const totalKwh = alerts.reduce((s, a) => s + a.annual_kwh, 0);
    const totalCo2 = alerts.reduce((s, a) => s + a.co2_kg_per_year, 0);
    const recommendedPlugs = Math.ceil(alerts.filter(a => a.rule_id === 'standby_phantom_load' || a.rule_id === 'always_on_candidate').length / 2);
    const totalPlugCost = recommendedPlugs * SMART_PLUG_COST;
    const blendedPayback = totalAnnualCost > 0 ? (totalPlugCost / totalAnnualCost) * 12 : 0;

    alerts.unshift({
      rule_id: 'smart_plug_roi',
      severity: 'critical',
      equipment_name: `Aggregate (${alerts.length} devices)`,
      location: 'Whole Restaurant',
      standby_watts: Math.round(alerts.reduce((s, a) => s + a.standby_watts, 0) * 10) / 10,
      annual_kwh: Math.round(totalKwh * 10) / 10,
      annual_cost: Math.round(totalAnnualCost * 100) / 100,
      co2_kg_per_year: Math.round(totalCo2 * 10) / 10,
      smart_plug_cost: Math.round(totalPlugCost * 100) / 100,
      payback_months: Math.round(blendedPayback * 10) / 10,
      description: `TOTAL VAMPIRE WASTE: ${totalKwh.toFixed(0)} kWh/yr = ${fmt$(totalAnnualCost)}/yr (${totalCo2.toFixed(0)} kg CO2). Install ${recommendedPlugs} smart plugs (${fmt$(totalPlugCost)}) → payback in ${blendedPayback.toFixed(1)} months.`,
      ai_recommendation: 'install_smart_plug',
      status: 'open',
      detected_at: now,
    });
  }

  // 5. AI insight for top 5 critical/high alerts
  if (config.aiEnabled && alerts.length > 0) {
    const { callOpenAIChat } = await import('@/lib/openai.service.ts').catch(() => ({} as any));
    if (callOpenAIChat) {
      const topAlerts = alerts
        .filter(a => a.severity === 'critical' || a.severity === 'high')
        .slice(0, 5);
      for (const a of topAlerts) {
        try {
          const response = await callOpenAIChat([
            { role: 'system', content: 'You are a restaurant energy efficiency AI. Respond with a single actionable insight (max 200 chars).' },
            { role: 'user', content: `Device "${a.equipment_name}" at ${a.location}: ${a.standby_watts}W standby draw → ${a.annual_kwh.toFixed(0)} kWh/yr = ${fmt$(a.annual_cost)}/yr (${a.co2_kg_per_year.toFixed(0)} kg CO2). Smart plug cost ${a.smart_plug_cost ? fmt$(a.smart_plug_cost) : 'N/A'}, payback ${a.payback_months?.toFixed(1) ?? 'N/A'} months.` },
          ], { temperature: 0.3, maxTokens: 120 });
          const text = typeof response === 'string' ? response : (response as any)?.content ?? '';
          a.ai_insight = text.slice(0, 200);
        } catch { /* skip AI failure */ }
      }
    }
  }

  // 6. Persist
  try {
    await db.query(`DELETE FROM energy_vampire_alert WHERE status = 'open' AND detected_at < time::now() - 1h`);
  } catch { /* ignore */ }
  for (const a of alerts) {
    try {
      await db.query(`CREATE energy_vampire_alert CONTENT $data`, {
        data: { ...a, detected_at: a.detected_at.toISOString() },
      });
    } catch { /* ignore individual insert failures */ }
  }

  return { alerts, generated: alerts.length };
};

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export const getActiveAlerts = async (db: ReturnType<typeof useDB>): Promise<EnergyVampireAlert[]> => {
  try {
    const result = await db.query(
      `SELECT * FROM energy_vampire_alert
       WHERE status = 'open'
       ORDER BY annual_cost DESC
       LIMIT 50`
    );
    return Array.isArray(result) ? result.flat() : [];
  } catch { return []; }
};

export const getSummary = async (db: ReturnType<typeof useDB>): Promise<{
  deviceCount: number;
  totalAnnualCost: number;
  totalAnnualKwh: number;
  totalCo2: number;
  totalSmartPlugPayback: number;
}> => {
  try {
    const result = await db.query(
      `SELECT
         count() AS total,
         math::sum(annual_kwh) AS kwh,
         math::sum(annual_cost) AS cost,
         math::sum(co2_kg_per_year) AS co2,
         math::mean(payback_months) AS payback
       FROM energy_vampire_alert
       WHERE status = 'open' GROUP ALL`
    );
    const rows = Array.isArray(result) ? result.flat() : [];
    const r = rows[0] ?? {};
    return {
      deviceCount: safeNumber(r.total, 0),
      totalAnnualCost: safeNumber(r.cost, 0),
      totalAnnualKwh: safeNumber(r.kwh, 0),
      totalCo2: safeNumber(r.co2, 0),
      totalSmartPlugPayback: safeNumber(r.payback, 0),
    };
  } catch {
    return { deviceCount: 0, totalAnnualCost: 0, totalAnnualKwh: 0, totalCo2: 0, totalSmartPlugPayback: 0 };
  }
};

export const updateAlertStatus = async (
  db: ReturnType<typeof useDB>,
  alertId: string,
  status: 'mitigated' | 'declined' | 'expired'
): Promise<void> => {
  await db.query(`UPDATE $id SET status = $status`, { id: alertId, status });
};
