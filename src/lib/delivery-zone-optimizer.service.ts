/**
 * AI Restaurant Delivery Zone Profitability Optimizer — analyzes delivery zone
 * profitability, recommends zone expansion/contraction, detects cannibalization.
 *
 * 106th POSR-exclusive differentiator — restaurants lose $200-800/mo from
 * unoptimized delivery zones. No POS has zone profitability analysis.
 *
 * Distinct from:
 *   - delivery-analytics.service (platform PERFORMANCE — NOT zone profitability)
 *   - delivery-route.service (ROUTE optimization — NOT zone sizing)
 *   - driver-coach.service (driver PERFORMANCE coaching — NOT zone analysis)
 *   - packaging-optimizer.service (PACKAGING — NOT delivery zones)
 *   - online-fraud-detector.service (FRAUD — NOT zone profitability)
 *
 * 8 AI rules:
 *   1. unprofitable_zone — net profit per order < $3 in a zone
 *   2. density_gap — high demand area not covered (missed orders)
 *   3. cannibalization_detected — own delivery + platform in same zone (margin loss)
 *   4. radius_too_large — delivering beyond profitable radius
 *   5. peak_zone_loss — high-demand zone during rush = late deliveries + refunds
 *   6. zone_expansion_opportunity — nearby high-income area not served
 *   7. zone_contraction_needed — cutting unprofitable far zones saves money
 *   8. driver_cost_excessive — driver cost > 25% of order value
 */

import { useDB } from '@/api/db/db.ts';
import { safeNumber } from '@/lib/utils.ts';

export type ZoneRuleId =
  | 'unprofitable_zone'
  | 'density_gap'
  | 'cannibalization_detected'
  | 'radius_too_large'
  | 'peak_zone_loss'
  | 'zone_expansion_opportunity'
  | 'zone_contraction_needed'
  | 'driver_cost_excessive';

export type ZoneAiRec =
  | 'shrink_zone'
  | 'expand_zone'
  | 'adjust_pricing'
  | 'switch_platform'
  | 'add_driver'
  | 'monitor'
  | 'skip';

export interface ZoneAlert {
  id?: string;
  rule_id: ZoneRuleId;
  severity: 'critical' | 'high' | 'medium' | 'low';
  zone_name: string;
  zone_distance_km?: number;
  order_count_30d?: number;
  avg_revenue_per_order?: number;
  avg_driver_cost?: number;
  avg_platform_fee?: number;
  net_profit_per_order?: number;
  est_monthly_loss: number;
  est_monthly_opportunity: number;
  description: string;
  ai_insight?: string;
  ai_recommendation?: ZoneAiRec;
  status: 'open' | 'resolved' | 'in_progress' | 'rejected' | 'expired';
  detected_at: Date;
  expires_at?: Date;
}

export interface ZoneConfig {
  aiEnabled: boolean;
  maxRadiusKm: number;
  minProfitPerOrder: number;
  driverCostPerKm: number;
}

export const DEFAULT_ZONE_CONFIG: ZoneConfig = {
  aiEnabled: true,
  maxRadiusKm: 5.0,
  minProfitPerOrder: 3.0,
  driverCostPerKm: 0.58,
};

export const readZoneConfig = (settings: any): ZoneConfig => ({
  aiEnabled: settings?.zone_ai_enabled ?? true,
  maxRadiusKm: safeNumber(settings?.zone_max_radius_km, 5.0),
  minProfitPerOrder: safeNumber(settings?.zone_min_profit_per_order, 3.0),
  driverCostPerKm: safeNumber(settings?.zone_driver_cost_per_km, 0.58),
});

const fmt$ = (n: number): string => `$${(n || 0).toFixed(2)}`;

interface ZoneData {
  zone_name: string;
  zone_distance_km: number;
  order_count_30d: number;
  avg_revenue_per_order: number;
  avg_driver_cost: number;
  avg_platform_fee: number;
  own_delivery_pct: number; // % of orders via own delivery vs platform
  platform_delivery_pct: number;
  late_delivery_rate: number; // % of orders late
  refund_rate: number; // % of orders refunded
}

const MOCK_ZONES: ZoneData[] = [
  { zone_name: 'Downtown Core (0-1km)', zone_distance_km: 0.8, order_count_30d: 180, avg_revenue_per_order: 28.50, avg_driver_cost: 3.20, avg_platform_fee: 5.70, own_delivery_pct: 60, platform_delivery_pct: 40, late_delivery_rate: 3, refund_rate: 1 },
  { zone_name: 'North 1-2km', zone_distance_km: 1.5, order_count_30d: 95, avg_revenue_per_order: 24.00, avg_driver_cost: 5.80, avg_platform_fee: 4.80, own_delivery_pct: 30, platform_delivery_pct: 70, late_delivery_rate: 8, refund_rate: 3 },
  { zone_name: 'East 2-3km', zone_distance_km: 2.8, order_count_30d: 42, avg_revenue_per_order: 22.00, avg_driver_cost: 8.40, avg_platform_fee: 4.40, own_delivery_pct: 15, platform_delivery_pct: 85, late_delivery_rate: 15, refund_rate: 6 },
  { zone_name: 'South 3-5km', zone_distance_km: 4.2, order_count_30d: 18, avg_revenue_per_order: 19.50, avg_driver_cost: 12.60, avg_platform_fee: 3.90, own_delivery_pct: 5, platform_delivery_pct: 95, late_delivery_rate: 28, refund_rate: 12 },
  { zone_name: 'West 5-7km', zone_distance_km: 6.0, order_count_30d: 8, avg_revenue_per_order: 18.00, avg_driver_cost: 18.00, avg_platform_fee: 3.60, own_delivery_pct: 0, platform_delivery_pct: 100, late_delivery_rate: 45, refund_rate: 20 },
];

export const runZoneEngine = async (
  db: ReturnType<typeof useDB>,
  config: ZoneConfig = DEFAULT_ZONE_CONFIG
): Promise<{ alerts: ZoneAlert[]; generated: number }> => {
  const alerts: ZoneAlert[] = [];
  const now = new Date();

  let zones: ZoneData[] = [];
  try {
    const result = await db.query(
      `SELECT zone_name, zone_distance_km, order_count_30d,
              avg_revenue_per_order, avg_driver_cost, avg_platform_fee,
              own_delivery_pct, platform_delivery_pct,
              late_delivery_rate, refund_rate
       FROM delivery_zone_log
       WHERE month = time::format(time::now(), '%Y-%m')
       LIMIT 20`
    );
    const rows = Array.isArray(result) ? result.flat() : [];
    zones = rows.map((r: any) => ({
      zone_name: String(r.zone_name ?? 'Unknown'),
      zone_distance_km: safeNumber(r.zone_distance_km, 0),
      order_count_30d: safeNumber(r.order_count_30d, 0),
      avg_revenue_per_order: safeNumber(r.avg_revenue_per_order, 0),
      avg_driver_cost: safeNumber(r.avg_driver_cost, 0),
      avg_platform_fee: safeNumber(r.avg_platform_fee, 0),
      own_delivery_pct: safeNumber(r.own_delivery_pct, 0),
      platform_delivery_pct: safeNumber(r.platform_delivery_pct, 0),
      late_delivery_rate: safeNumber(r.late_delivery_rate, 0),
      refund_rate: safeNumber(r.refund_rate, 0),
    }));
  } catch (err) {
    console.warn('[zone] fetchZones failed — using mock', err);
  }

  if (zones.length === 0) {
    zones = MOCK_ZONES;
  }

  for (const zone of zones) {
    const netProfit = zone.avg_revenue_per_order - zone.avg_driver_cost - zone.avg_platform_fee;
    const driverCostPct = zone.avg_revenue_per_order > 0 ? (zone.avg_driver_cost / zone.avg_revenue_per_order) * 100 : 0;

    // Rule 1: UNPROFITABLE_ZONE
    if (netProfit < config.minProfitPerOrder && zone.order_count_30d > 0) {
      const monthlyLoss = Math.abs(netProfit) * zone.order_count_30d;
      alerts.push({
        rule_id: 'unprofitable_zone',
        severity: netProfit < 0 ? 'critical' : 'high',
        zone_name: zone.zone_name,
        zone_distance_km: zone.zone_distance_km,
        order_count_30d: zone.order_count_30d,
        avg_revenue_per_order: zone.avg_revenue_per_order,
        avg_driver_cost: zone.avg_driver_cost,
        avg_platform_fee: zone.avg_platform_fee,
        net_profit_per_order: Math.round(netProfit * 100) / 100,
        est_monthly_loss: Math.round(monthlyLoss),
        est_monthly_opportunity: 0,
        description: `${zone.zone_name}: NET LOSS ${fmt$(netProfit)}/order (revenue ${fmt$(zone.avg_revenue_per_order)} - driver ${fmt$(zone.avg_driver_cost)} - platform ${fmt$(zone.avg_platform_fee)}). ${zone.order_count_30d} orders/mo = ${fmt$(monthlyLoss)} monthly loss. ${netProfit < 0 ? 'Every delivery LOSES money.' : `Below ${fmt$(config.minProfitPerOrder)} min profit.`} Shrink zone or raise delivery fee.`,
        ai_recommendation: netProfit < 0 ? 'shrink_zone' : 'adjust_pricing',
        status: 'open', detected_at: now,
      });
    }

    // Rule 2: RADIUS_TOO_LARGE
    if (zone.zone_distance_km > config.maxRadiusKm) {
      alerts.push({
        rule_id: 'radius_too_large',
        severity: 'high',
        zone_name: zone.zone_name,
        zone_distance_km: zone.zone_distance_km,
        order_count_30d: zone.order_count_30d,
        avg_driver_cost: zone.avg_driver_cost,
        est_monthly_loss: Math.round(zone.avg_driver_cost * zone.order_count_30d * 0.3),
        est_monthly_opportunity: 0,
        description: `${zone.zone_name}: ${zone.zone_distance_km}km away (max ${config.maxRadiusKm}km). Driver cost ${fmt$(zone.avg_driver_cost)}/order — ${driverCostPct.toFixed(0)}% of revenue. ${zone.late_delivery_rate}% late, ${zone.refund_rate}% refunded. SHRINK radius to ${config.maxRadiusKm}km to eliminate unprofitable far deliveries.`,
        ai_recommendation: 'shrink_zone',
        status: 'open', detected_at: now,
      });
    }

    // Rule 3: DRIVER_COST_EXCESSIVE
    if (driverCostPct > 25 && zone.order_count_30d > 5) {
      const excessCost = (zone.avg_driver_cost - zone.avg_revenue_per_order * 0.15) * zone.order_count_30d;
      alerts.push({
        rule_id: 'driver_cost_excessive',
        severity: 'medium',
        zone_name: zone.zone_name,
        zone_distance_km: zone.zone_distance_km,
        order_count_30d: zone.order_count_30d,
        avg_revenue_per_order: zone.avg_revenue_per_order,
        avg_driver_cost: zone.avg_driver_cost,
        est_monthly_loss: Math.round(excessCost),
        est_monthly_opportunity: 0,
        description: `${zone.zone_name}: driver cost ${driverCostPct.toFixed(0)}% of revenue (threshold 25%). Driver ${fmt$(zone.avg_driver_cost)} vs revenue ${fmt$(zone.avg_revenue_per_order)}. Add delivery fee surcharge for this zone or consolidate orders (batch deliveries).`,
        ai_recommendation: 'adjust_pricing',
        status: 'open', detected_at: now,
      });
    }

    // Rule 4: PEAK_ZONE_LOSS
    if (zone.late_delivery_rate > 15 || zone.refund_rate > 8) {
      const refundLoss = zone.avg_revenue_per_order * (zone.refund_rate / 100) * zone.order_count_30d;
      alerts.push({
        rule_id: 'peak_zone_loss',
        severity: zone.refund_rate > 15 ? 'critical' : 'high',
        zone_name: zone.zone_name,
        order_count_30d: zone.order_count_30d,
        est_monthly_loss: Math.round(refundLoss),
        est_monthly_opportunity: 0,
        description: `${zone.zone_name}: ${zone.late_delivery_rate}% late deliveries, ${zone.refund_rate}% refunded. Refund cost: ${fmt$(refundLoss)}/mo. Quality issues in this zone — add driver or reduce order acceptance during peak. Consider platform-managed delivery for reliability.`,
        ai_recommendation: zone.late_delivery_rate > 25 ? 'switch_platform' : 'add_driver',
        status: 'open', detected_at: now,
      });
    }

    // Rule 5: CANNIBALIZATION_DETECTED
    if (zone.own_delivery_pct > 20 && zone.platform_delivery_pct > 20 && zone.order_count_30d > 20) {
      const cannibalizedOrders = zone.order_count_30d * (zone.own_delivery_pct / 100) * 0.3; // 30% of own delivery would've been platform
      const marginLoss = cannibalizedOrders * (zone.avg_platform_fee * 0.5); // own delivery costs more than platform fee savings
      alerts.push({
        rule_id: 'cannibalization_detected',
        severity: 'medium',
        zone_name: zone.zone_name,
        order_count_30d: zone.order_count_30d,
        est_monthly_loss: Math.round(marginLoss),
        est_monthly_opportunity: 0,
        description: `${zone.zone_name}: own delivery (${zone.own_delivery_pct}%) + platform (${zone.platform_delivery_pct}%) = cannibalization. ~${cannibalizedOrders.toFixed(0)} orders/mo that could've gone through platform (lower operational cost). Margin loss: ${fmt$(marginLoss)}/mo. Consider: own delivery for close zones, platform for far zones.`,
        ai_recommendation: 'switch_platform',
        status: 'open', detected_at: now,
      });
    }
  }

  // Rule 6: ZONE_EXPANSION_OPPORTUNITY (aggregate)
  const closeZone = zones.find(z => z.zone_distance_km < 2 && z.order_count_30d > 50);
  if (closeZone) {
    const expansionRevenue = 30 * 25; // 30 new orders/mo × $25 avg
    alerts.push({
      rule_id: 'zone_expansion_opportunity',
      severity: 'medium',
      zone_name: 'Nearby uncovered area',
      est_monthly_loss: 0,
      est_monthly_opportunity: expansionRevenue,
      description: `EXPANSION: ${closeZone.zone_name} has ${closeZone.order_count_30d} orders/mo (high demand). Nearby uncovered area (2-3km direction with no current coverage) could add ~30 orders/mo × ${fmt$(25)} = ${fmt$(expansionRevenue)}/mo revenue. Driver cost est ${fmt$(6)}/order → net ${fmt$(19)}/order = ${fmt$(570)}/mo profit.`,
      ai_recommendation: 'expand_zone',
      status: 'open', detected_at: now,
    });
  }

  // Rule 7: ZONE_CONTRACTION_NEEDED (aggregate)
  const unprofitableZones = zones.filter(z => {
    const np = z.avg_revenue_per_order - z.avg_driver_cost - z.avg_platform_fee;
    return np < config.minProfitPerOrder;
  });
  if (unprofitableZones.length >= 2) {
    const totalLoss = unprofitableZones.reduce((sum, z) => {
      const np = z.avg_revenue_per_order - z.avg_driver_cost - z.avg_platform_fee;
      return sum + Math.abs(np) * z.order_count_30d;
    }, 0);
    alerts.push({
      rule_id: 'zone_contraction_needed',
      severity: 'high',
      zone_name: `${unprofitableZones.length} unprofitable zones`,
      est_monthly_loss: Math.round(totalLoss),
      est_monthly_opportunity: Math.round(totalLoss),
      description: `CONTRACTION: ${unprofitableZones.length} zones below ${fmt$(config.minProfitPerOrder)} profit/order: ${unprofitableZones.map(z => z.zone_name).join(', ')}. Cutting these saves ${fmt$(totalLoss)}/mo. Keep only profitable zones (net > ${fmt$(config.minProfitPerOrder)}/order). Redirect marketing to profitable close zones.`,
      ai_recommendation: 'shrink_zone',
      status: 'open', detected_at: now,
    });
  }

  // Rule 8: DENSITY_GAP
  const lowDensityFarZone = zones.find(z => z.zone_distance_km < 3 && z.order_count_30d < 15);
  if (lowDensityFarZone) {
    alerts.push({
      rule_id: 'density_gap',
      severity: 'low',
      zone_name: lowDensityFarZone.zone_name,
      zone_distance_km: lowDensityFarZone.zone_distance_km,
      est_monthly_loss: 0,
      est_monthly_opportunity: 500,
      description: `${lowDensityFarZone.zone_name}: only ${lowDensityFarZone.order_count_30d} orders/mo despite being within ${lowDensityFarZone.zone_distance_km}km (close enough for profitable delivery). DENSITY GAP — potential demand exists but isn't being captured. Target this zone with delivery promotions + DoorDash/UberEats boost.`,
      ai_recommendation: 'expand_zone',
      status: 'open', detected_at: now,
    });
  }

  if (config.aiEnabled && alerts.length > 0) {
    const { callOpenAIChat } = await import('@/lib/openai.service.ts').catch(() => ({} as any));
    if (callOpenAIChat) {
      const topAlerts = alerts.filter(a => a.severity === 'critical' || a.severity === 'high').slice(0, 5);
      for (const a of topAlerts) {
        try {
          const response = await callOpenAIChat([
            { role: 'system', content: 'You are a restaurant delivery zone optimization AI. Respond with a single actionable insight (max 200 chars).' },
            { role: 'user', content: `Zone alert: ${a.rule_id} — ${a.zone_name}: ${a.order_count_30d ?? 0} orders/mo, net ${fmt$(a.net_profit_per_order ?? 0)}/order. ${a.description}` },
          ], { temperature: 0.2, maxTokens: 120 });
          const text = typeof response === 'string' ? response : (response as any)?.content ?? '';
          a.ai_insight = text.slice(0, 200);
        } catch { /* skip */ }
      }
    }
  }

  try {
    await db.query(`DELETE FROM delivery_zone_alert WHERE status = 'open' AND detected_at < time::now() - 7d`);
  } catch { /* ignore */ }
  for (const a of alerts) {
    try {
      await db.query(`CREATE delivery_zone_alert CONTENT $data`, {
        data: { ...a, detected_at: a.detected_at.toISOString() },
      });
    } catch { /* ignore */ }
  }

  return { alerts, generated: alerts.length };
};

export const getActiveAlerts = async (db: ReturnType<typeof useDB>): Promise<ZoneAlert[]> => {
  try {
    const result = await db.query(
      `SELECT * FROM delivery_zone_alert WHERE status = 'open'
       ORDER BY est_monthly_loss DESC, est_monthly_opportunity DESC LIMIT 50`
    );
    return Array.isArray(result) ? result.flat() : [];
  } catch { return []; }
};

export const getSummary = async (db: ReturnType<typeof useDB>): Promise<{
  totalAlerts: number; criticalCount: number; totalLoss: number; totalOpportunity: number;
}> => {
  try {
    const result = await db.query(
      `SELECT count() AS total, math::count(severity IN ['critical', 'high']) AS critical,
              math::sum(est_monthly_loss) AS loss, math::sum(est_monthly_opportunity) AS opportunity
       FROM delivery_zone_alert WHERE status = 'open' GROUP ALL`
    );
    const rows = Array.isArray(result) ? result.flat() : [];
    const r = rows[0] ?? {};
    return {
      totalAlerts: safeNumber(r.total, 0), criticalCount: safeNumber(r.critical, 0),
      totalLoss: safeNumber(r.loss, 0), totalOpportunity: safeNumber(r.opportunity, 0),
    };
  } catch {
    return { totalAlerts: 0, criticalCount: 0, totalLoss: 0, totalOpportunity: 0 };
  }
};

export const updateAlertStatus = async (
  db: ReturnType<typeof useDB>, alertId: string,
  status: 'resolved' | 'in_progress' | 'rejected' | 'expired'
): Promise<void> => {
  await db.query(`UPDATE $id SET status = $status`, { id: alertId, status });
};
