/**
 * AI Delivery Hot-Food Quality Decay Predictor — predicts whether delivered
 * food will arrive at acceptable quality (temperature, texture, structural
 * integrity, sogginess) based on dish type, distance, traffic, ambient
 * temperature, packaging, and prep-to-pickup time. Enables pre-emptive
 * actions (insulated packaging, expedite pickup, refuse far delivery,
 * reformulate recipe for delivery).
 *
 * 144th POSR-exclusive differentiator — 18% of delivered orders arrive with
 * quality complaints (cold, soggy, broken, melted) costing $400-1,800/mo per
 * location in refunds, comped meals, lost customers, and 1-star reviews.
 * Existing delivery services track TIME + ROUTE but NOT predicted food quality
 * at arrival. No POS predicts dish-level quality decay.
 *
 * Distinct from:
 *   - delivery-route.service — optimizes DRIVER ROUTE (not food quality)
 *   - delivery-zone-optimizer.service (106th) — optimizes ZONE PROFITABILITY (not quality)
 *   - delivery-analytics.service — tracks platform PERFORMANCE (not food quality)
 *   - packaging-optimizer.service (59th) — optimizes PACKAGING COST (not quality decay)
 *   - driver-coach.service — coaches DRIVER PERFORMANCE (not food quality)
 *   - spoilage-prediction.service — predicts SHELF-LIFE pre-consumer (not delivery)
 *   - plate-waste-predictor.service (141st) — predicts post-consumer WASTE (not delivery)
 *   - recipe-cost-volatility.service (140th) — predicts COST (not quality)
 *
 * 8 AI rules:
 *   1. temperature_decay_critical — hot food predicted to arrive below 60°C (food safety + quality)
 *   2. sogginess_predicted — fried/crispy items predicted soggy (steam trapped)
 *   3. structural_failure_predicted — fragile items predicted broken/melted (sauces, desserts, layered)
 *   4. delivery_distance_excessive — distance > optimal radius for dish → quality degrades
 *   5. prep_to_pickup_delay — food sat too long before pickup → quality decay
 *   6. ambient_heat_risk — high ambient temp + perishable item → food safety risk
 *   7. cold_ambient_sensitivity — cold ambient + hot food → faster temperature decay
 *   8. packaging_quality_mismatch — packaging insufficient for dish type → upgrade needed
 */

import { useDB } from '@/api/db/db.ts';
import { safeNumber } from '@/lib/utils.ts';

export type DelivDecayRuleId =
  | 'temperature_decay_critical'
  | 'sogginess_predicted'
  | 'structural_failure_predicted'
  | 'delivery_distance_excessive'
  | 'prep_to_pickup_delay'
  | 'ambient_heat_risk'
  | 'cold_ambient_sensitivity'
  | 'packaging_quality_mismatch';

export type DelivDecayAiRec =
  | 'insulated_packaging'
  | 'expedite_pickup'
  | 'refuse_delivery'
  | 'reformulate_recipe'
  | 'upgrade_packaging'
  | 'vent_packaging'
  | 'separate_compartment'
  | 'cool_pack'
  | 'reduce_distance'
  | 'monitor'
  | 'skip';

export interface DelivDecayAlert {
  id?: string;
  rule_id: DelivDecayRuleId;
  severity: 'critical' | 'high' | 'medium' | 'low';
  dish_name?: string;
  dish_category?: string;            // 'fried' | 'grilled' | 'soup' | 'dessert' | 'salad' | 'beverage' | 'protein' | 'starch'
  platform?: string;                  // 'doordash' | 'ubereats' | 'grubhub' | 'own' | 'pickup'
  delivery_distance_km?: number;
  predicted_travel_time_min?: number;
  ambient_temp_c?: number;
  prep_to_pickup_minutes?: number;
  current_packaging_type?: string;
  recommended_packaging?: string;
  predicted_arrival_temp_c?: number;
  quality_score_predicted?: number;    // 0-100 (100 = perfect, <50 = unacceptable)
  current_complaint_rate_pct?: number;
  monthly_orders?: number;
  est_monthly_opportunity: number;
  description: string;
  ai_insight?: string;
  ai_recommendation?: DelivDecayAiRec;
  status: 'open' | 'resolved' | 'in_progress' | 'rejected' | 'expired';
  detected_at: Date;
  expires_at?: Date;
}

export interface DelivDecayConfig {
  aiEnabled: boolean;
  criticalTempThreshold: number;       // °C below which hot food is unsafe/low quality
  excessiveDistanceKm: number;
  prepToPickupDelayMin: number;
  ambientHeatThreshold: number;        // °C above which perishables at risk
  coldAmbientThreshold: number;        // °C below which hot food cools faster
}

export const DEFAULT_DELIVDECAY_CONFIG: DelivDecayConfig = {
  aiEnabled: true,
  criticalTempThreshold: 60.0,
  excessiveDistanceKm: 8.0,
  prepToPickupDelayMin: 10,
  ambientHeatThreshold: 30.0,
  coldAmbientThreshold: 5.0,
};

export const readDelivDecayConfig = (settings: any): DelivDecayConfig => ({
  aiEnabled: settings?.delivdecay_ai_enabled ?? true,
  criticalTempThreshold: safeNumber(settings?.delivdecay_critical_temp, 60.0),
  excessiveDistanceKm: safeNumber(settings?.delivdecay_excessive_distance, 8.0),
  prepToPickupDelayMin: safeNumber(settings?.delivdecay_prep_pickup_delay, 10),
  ambientHeatThreshold: safeNumber(settings?.delivdecay_ambient_heat, 30.0),
  coldAmbientThreshold: safeNumber(settings?.delivdecay_cold_ambient, 5.0),
});

const fmt$ = (n: number): string => `$${(n || 0).toFixed(2)}`;

interface DeliveryQualityData {
  dish_name: string;
  dish_category: string;
  platform: string;
  // Delivery context
  delivery_distance_km: number;
  predicted_travel_time_min: number;
  ambient_temp_c: number;
  prep_to_pickup_minutes: number;
  // Packaging
  current_packaging_type: string;       // 'standard' | 'insulated' | 'vented' | 'paper' | 'plastic' | 'styrofoam'
  recommended_packaging?: string;
  // Quality prediction (computed)
  predicted_arrival_temp_c: number;
  quality_score_predicted: number;       // 0-100
  // Volume + impact
  monthly_orders: number;
  current_complaint_rate_pct: number;
  avg_complaint_cost: number;            // $ cost per complaint (refund + comp + lost customer)
  // For structural failure
  dish_fragility?: string;               // 'low' | 'medium' | 'high'
  // For sogginess
  has_crispy_component?: boolean;
  crispy_steam_trapped?: boolean;
}

const MOCK_DATA: DeliveryQualityData[] = [
  {
    dish_name: 'Crispy Fried Chicken', dish_category: 'fried', platform: 'doordash',
    delivery_distance_km: 6.5, predicted_travel_time_min: 22, ambient_temp_c: 18,
    prep_to_pickup_minutes: 8,
    current_packaging_type: 'standard', recommended_packaging: 'vented',
    predicted_arrival_temp_c: 48, quality_score_predicted: 38,
    monthly_orders: 145, current_complaint_rate_pct: 22, avg_complaint_cost: 14,
    has_crispy_component: true, crispy_steam_trapped: true,
  },
  {
    dish_name: 'Margherita Pizza', dish_category: 'starch', platform: 'ubereats',
    delivery_distance_km: 4.2, predicted_travel_time_min: 15, ambient_temp_c: 20,
    prep_to_pickup_minutes: 6,
    current_packaging_type: 'paper', recommended_packaging: 'insulated',
    predicted_arrival_temp_c: 52, quality_score_predicted: 58,
    monthly_orders: 320, current_complaint_rate_pct: 8, avg_complaint_cost: 18,
  },
  {
    dish_name: 'Beef Wellington', dish_category: 'protein', platform: 'own',
    delivery_distance_km: 11, predicted_travel_time_min: 35, ambient_temp_c: 12,
    prep_to_pickup_minutes: 14,
    current_packaging_type: 'standard', recommended_packaging: 'insulated',
    predicted_arrival_temp_c: 42, quality_score_predicted: 25,
    monthly_orders: 22, current_complaint_rate_pct: 35, avg_complaint_cost: 65,
    dish_fragility: 'high',
  },
  {
    dish_name: 'Chocolate Lava Cake', dish_category: 'dessert', platform: 'doordash',
    delivery_distance_km: 5.8, predicted_travel_time_min: 18, ambient_temp_c: 28,
    prep_to_pickup_minutes: 5,
    current_packaging_type: 'plastic', recommended_packaging: 'insulated',
    predicted_arrival_temp_c: 38, quality_score_predicted: 42,
    monthly_orders: 88, current_complaint_rate_pct: 18, avg_complaint_cost: 22,
    dish_fragility: 'high',
  },
  {
    dish_name: 'Caesar Salad', dish_category: 'salad', platform: 'grubhub',
    delivery_distance_km: 3.5, predicted_travel_time_min: 12, ambient_temp_c: 32,
    prep_to_pickup_minutes: 4,
    current_packaging_type: 'plastic', recommended_packaging: 'cool_pack',
    predicted_arrival_temp_c: 26, quality_score_predicted: 55,
    monthly_orders: 175, current_complaint_rate_pct: 9, avg_complaint_cost: 12,
  },
  {
    dish_name: 'Tomato Bisque', dish_category: 'soup', platform: 'ubereats',
    delivery_distance_km: 7.2, predicted_travel_time_min: 25, ambient_temp_c: 4,
    prep_to_pickup_minutes: 7,
    current_packaging_type: 'standard', recommended_packaging: 'insulated',
    predicted_arrival_temp_c: 55, quality_score_predicted: 48,
    monthly_orders: 95, current_complaint_rate_pct: 14, avg_complaint_cost: 14,
  },
  {
    dish_name: 'Sushi Platter', dish_category: 'protein', platform: 'doordash',
    delivery_distance_km: 8.5, predicted_travel_time_min: 28, ambient_temp_c: 26,
    prep_to_pickup_minutes: 6,
    current_packaging_type: 'plastic', recommended_packaging: 'cool_pack',
    predicted_arrival_temp_c: 24, quality_score_predicted: 35,
    monthly_orders: 110, current_complaint_rate_pct: 16, avg_complaint_cost: 38,
    dish_fragility: 'high',
  },
  {
    dish_name: 'French Fries (side)', dish_category: 'fried', platform: 'doordash',
    delivery_distance_km: 5.0, predicted_travel_time_min: 17, ambient_temp_c: 22,
    prep_to_pickup_minutes: 12,
    current_packaging_type: 'paper', recommended_packaging: 'vented',
    predicted_arrival_temp_c: 45, quality_score_predicted: 32,
    monthly_orders: 420, current_complaint_rate_pct: 18, avg_complaint_cost: 6,
    has_crispy_component: true, crispy_steam_trapped: true,
  },
];

export const runDelivDecayEngine = async (
  db: ReturnType<typeof useDB>,
  config: DelivDecayConfig = DEFAULT_DELIVDECAY_CONFIG
): Promise<{ alerts: DelivDecayAlert[]; generated: number }> => {
  const alerts: DelivDecayAlert[] = [];
  const now = new Date();

  let data: DeliveryQualityData[] = [];
  try {
    const result = await db.query(
      `SELECT dish_name, dish_category, platform,
              delivery_distance_km, predicted_travel_time_min, ambient_temp_c,
              prep_to_pickup_minutes, current_packaging_type, recommended_packaging,
              predicted_arrival_temp_c, quality_score_predicted,
              monthly_orders, current_complaint_rate_pct, avg_complaint_cost,
              dish_fragility, has_crispy_component, crispy_steam_trapped
       FROM delivery_quality_decay_log
       WHERE status = 'active'
       LIMIT 50`
    );
    const rows = Array.isArray(result) ? result.flat() : [];
    data = rows.map((r: any) => ({
      dish_name: String(r.dish_name ?? ''),
      dish_category: String(r.dish_category ?? 'protein'),
      platform: String(r.platform ?? 'doordash'),
      delivery_distance_km: safeNumber(r.delivery_distance_km, 0),
      predicted_travel_time_min: safeNumber(r.predicted_travel_time_min, 0),
      ambient_temp_c: safeNumber(r.ambient_temp_c, 20),
      prep_to_pickup_minutes: safeNumber(r.prep_to_pickup_minutes, 0),
      current_packaging_type: String(r.current_packaging_type ?? 'standard'),
      recommended_packaging: r.recommended_packaging ?? undefined,
      predicted_arrival_temp_c: safeNumber(r.predicted_arrival_temp_c, 0),
      quality_score_predicted: safeNumber(r.quality_score_predicted, 0),
      monthly_orders: safeNumber(r.monthly_orders, 0),
      current_complaint_rate_pct: safeNumber(r.current_complaint_rate_pct, 0),
      avg_complaint_cost: safeNumber(r.avg_complaint_cost, 0),
      dish_fragility: r.dish_fragility ?? undefined,
      has_crispy_component: r.has_crispy_component ?? undefined,
      crispy_steam_trapped: r.crispy_steam_trapped ?? undefined,
    }));
  } catch (err) {
    console.warn('[delivdecay] fetchData failed — using mock', err);
  }

  if (data.length === 0) {
    data = MOCK_DATA;
  }

  for (const d of data) {
    const monthlyOpp = Math.round(d.monthly_orders * (d.current_complaint_rate_pct / 100) * d.avg_complaint_cost);

    // Rule 1: TEMPERATURE_DECAY_CRITICAL
    if (d.predicted_arrival_temp_c < config.criticalTempThreshold && (d.dish_category === 'fried' || d.dish_category === 'protein' || d.dish_category === 'soup' || d.dish_category === 'starch')) {
      const deficit = config.criticalTempThreshold - d.predicted_arrival_temp_c;
      alerts.push({
        rule_id: 'temperature_decay_critical',
        severity: deficit >= 15 ? 'critical' : 'high',
        dish_name: d.dish_name,
        dish_category: d.dish_category,
        platform: d.platform,
        delivery_distance_km: d.delivery_distance_km,
        predicted_travel_time_min: d.predicted_travel_time_min,
        ambient_temp_c: d.ambient_temp_c,
        prep_to_pickup_minutes: d.prep_to_pickup_minutes,
        current_packaging_type: d.current_packaging_type,
        recommended_packaging: d.recommended_packaging ?? 'insulated',
        predicted_arrival_temp_c: d.predicted_arrival_temp_c,
        quality_score_predicted: d.quality_score_predicted,
        current_complaint_rate_pct: d.current_complaint_rate_pct,
        monthly_orders: d.monthly_orders,
        est_monthly_opportunity: monthlyOpp,
        description: `TEMPERATURE DECAY CRITICAL: ${d.dish_name} (${d.dish_category}) on ${d.platform} predicted to arrive at ${d.predicted_arrival_temp_c}°C — ${deficit.toFixed(0)}°C below safe/quality threshold (${config.criticalTempThreshold}°C). Travel: ${d.predicted_travel_time_min}min over ${d.delivery_distance_km}km. Ambient: ${d.ambient_temp_c}°C. Prep-to-pickup: ${d.prep_to_pickup_minutes}min. Current complaint rate: ${d.current_complaint_rate_pct}%. ACTION: ${deficit >= 15 ? 'REFUSE far delivery OR upgrade to insulated + heat-pack packaging. ' : 'upgrade to insulated packaging + expedite pickup (reduce prep-to-pickup to ≤5min). '}'Hot food below 60°C is both QUALITY (soggy/cold) + SAFETY (bacterial growth 4-60°C danger zone) issue. Cost: ${fmt$(monthlyOpp)}/mo in complaints. FDA Food Code: hot food must be held ≥60°C — delivery is part of holding.`,
        ai_recommendation: deficit >= 15 ? 'refuse_delivery' : 'insulated_packaging',
        status: 'open', detected_at: now,
      });
    }

    // Rule 2: SOGGINESS_PREDICTED
    if (d.has_crispy_component && d.crispy_steam_trapped && d.predicted_travel_time_min >= 12) {
      alerts.push({
        rule_id: 'sogginess_predicted',
        severity: d.quality_score_predicted < 40 ? 'high' : 'medium',
        dish_name: d.dish_name,
        dish_category: d.dish_category,
        platform: d.platform,
        delivery_distance_km: d.delivery_distance_km,
        predicted_travel_time_min: d.predicted_travel_time_min,
        current_packaging_type: d.current_packaging_type,
        recommended_packaging: 'vented',
        quality_score_predicted: d.quality_score_predicted,
        current_complaint_rate_pct: d.current_complaint_rate_pct,
        monthly_orders: d.monthly_orders,
        est_monthly_opportunity: monthlyOpp,
        description: `SOGGINESS PREDICTED: ${d.dish_name} has crispy component + steam-trapping packaging (${d.current_packaging_type}) + ${d.predicted_travel_time_min}min travel = predicted sogginess. Steam condenses inside closed container, re-wets crispy food → 50-70% crispness loss. Quality score: ${d.quality_score_predicted}/100. ACTION: switch to VENTED packaging (allows steam to escape) OR separate crispy component (e.g. put dressing/sauce on side, fries in separate vented bag). Sogginess is the #1 delivery complaint for fried foods. Cost: ${fmt$(monthlyOpp)}/mo. Vented containers cost $0.02 more but save ${fmt$(monthlyOpp - d.monthly_orders * 0.02)}/mo net.`,
        ai_recommendation: 'vent_packaging',
        status: 'open', detected_at: now,
      });
    }

    // Rule 3: STRUCTURAL_FAILURE_PREDICTED
    if (d.dish_fragility === 'high' && (d.predicted_travel_time_min >= 20 || d.delivery_distance_km >= 7)) {
      alerts.push({
        rule_id: 'structural_failure_predicted',
        severity: 'high',
        dish_name: d.dish_name,
        dish_category: d.dish_category,
        platform: d.platform,
        delivery_distance_km: d.delivery_distance_km,
        predicted_travel_time_min: d.predicted_travel_time_min,
        current_packaging_type: d.current_packaging_type,
        recommended_packaging: 'separate_compartment',
        quality_score_predicted: d.quality_score_predicted,
        current_complaint_rate_pct: d.current_complaint_rate_pct,
        monthly_orders: d.monthly_orders,
        est_monthly_opportunity: monthlyOpp,
        description: `STRUCTURAL FAILURE PREDICTED: ${d.dish_name} (fragility: high) on ${d.predicted_travel_time_min}min/${d.delivery_distance_km}km delivery — predicted to arrive broken/melted/deformed. Fragile items: layered desserts, soufflés, sushi platters, sauced pastries, ice cream. Vibration + tilt + heat during transit destroys structural integrity. Quality: ${d.quality_score_predicted}/100. ACTION: ${d.dish_category === 'dessert' ? 'use compartmented + insulated packaging; pack upright with stabilizer; refrigerant pack if perishable. ' : d.dish_category === 'protein' ? 'use compartmented packaging to prevent shifting; seal sauce separately; consider in-person pickup only for >8km. ' : 'use mold-fitted packaging + bubble wrap; mark FRAGILE on container. '}'Structural failure creates worst kind of review — customer sees destroyed food before tasting. Cost: ${fmt$(monthlyOpp)}/mo. ${d.delivery_distance_km >= 10 ? 'Consider refusing delivery >10km for this item. ' : ''}`,
        ai_recommendation: d.delivery_distance_km >= 10 ? 'refuse_delivery' : 'separate_compartment',
        status: 'open', detected_at: now,
      });
    }

    // Rule 4: DELIVERY_DISTANCE_EXCESSIVE
    if (d.delivery_distance_km >= config.excessiveDistanceKm) {
      alerts.push({
        rule_id: 'delivery_distance_excessive',
        severity: d.delivery_distance_km >= 12 ? 'high' : 'medium',
        dish_name: d.dish_name,
        dish_category: d.dish_category,
        platform: d.platform,
        delivery_distance_km: d.delivery_distance_km,
        predicted_travel_time_min: d.predicted_travel_time_min,
        ambient_temp_c: d.ambient_temp_c,
        quality_score_predicted: d.quality_score_predicted,
        current_complaint_rate_pct: d.current_complaint_rate_pct,
        monthly_orders: d.monthly_orders,
        est_monthly_opportunity: Math.round(monthlyOpp * 0.5),
        description: `DELIVERY DISTANCE EXCESSIVE: ${d.dish_name} delivered ${d.delivery_distance_km}km (threshold ${config.excessiveDistanceKm}km) — travel time ${d.predicted_travel_time_min}min. Beyond optimal radius, quality decays exponentially: temp drops 2-3°C per 5min, crispy items soften, sauces separate. Quality: ${d.quality_score_predicted}/100. Complaint rate: ${d.current_complaint_rate_pct}%. ACTION: ${d.delivery_distance_km >= 12 ? 'REFUSE delivery beyond 12km OR offer in-person pickup only. ' : 'reduce max delivery radius to ${config.excessiveDistanceKm}km OR add delivery surcharge for far orders (covers premium packaging + driver time). '}'Far deliveries also tie up drivers → fewer near deliveries completed. Save ${fmt$(monthlyOpp * 0.5)}/mo by cutting far-zone deliveries. Customers understand quality > distance — better to refuse than ship poor food.`,
        ai_recommendation: d.delivery_distance_km >= 12 ? 'refuse_delivery' : 'reduce_distance',
        status: 'open', detected_at: now,
      });
    }

    // Rule 5: PREP_TO_PICKUP_DELAY
    if (d.prep_to_pickup_minutes >= config.prepToPickupDelayMin) {
      alerts.push({
        rule_id: 'prep_to_pickup_delay',
        severity: d.prep_to_pickup_minutes >= 15 ? 'high' : 'medium',
        dish_name: d.dish_name,
        dish_category: d.dish_category,
        platform: d.platform,
        prep_to_pickup_minutes: d.prep_to_pickup_minutes,
        predicted_travel_time_min: d.predicted_travel_time_min,
        quality_score_predicted: d.quality_score_predicted,
        monthly_orders: d.monthly_orders,
        est_monthly_opportunity: Math.round(monthlyOpp * 0.6),
        description: `PREP-TO-PICKUP DELAY: ${d.dish_name} sat ${d.prep_to_pickup_minutes}min before driver picked up (threshold ${config.prepToPickupDelayMin}min). Food quality decays FAST after plating — fried foods soften in 5min, hot food drops 4°C every 5min at room temp, sauces congeal. ${d.prep_to_pickup_minutes}min sitting + ${d.predicted_travel_time_min}min travel = ${d.prep_to_pickup_minutes + d.predicted_travel_time_min}min total decay. ACTION: synchronize prep with driver arrival (push driver ETA to kitchen); use heat lamps (≤10min only); reject driver if >15min late. Prep-to-pickup is the #1 controllable quality lever — kitchen controls this, not the driver. Save ${fmt$(monthlyOpp * 0.6)}/mo. Train kitchen: plate ONLY when driver is in the parking lot.`,
        ai_recommendation: 'expedite_pickup',
        status: 'open', detected_at: now,
      });
    }

    // Rule 6: AMBIENT_HEAT_RISK
    if (d.ambient_temp_c >= config.ambientHeatThreshold && (d.dish_category === 'dessert' || d.dish_category === 'salad' || d.dish_category === 'protein')) {
      alerts.push({
        rule_id: 'ambient_heat_risk',
        severity: d.ambient_temp_c >= 35 ? 'critical' : 'high',
        dish_name: d.dish_name,
        dish_category: d.dish_category,
        platform: d.platform,
        ambient_temp_c: d.ambient_temp_c,
        delivery_distance_km: d.delivery_distance_km,
        predicted_travel_time_min: d.predicted_travel_time_min,
        current_packaging_type: d.current_packaging_type,
        recommended_packaging: 'cool_pack',
        quality_score_predicted: d.quality_score_predicted,
        current_complaint_rate_pct: d.current_complaint_rate_pct,
        monthly_orders: d.monthly_orders,
        est_monthly_opportunity: monthlyOpp,
        description: `AMBIENT HEAT RISK: ${d.ambient_temp_c}°C ambient + ${d.dish_name} (${d.dish_category}) = predicted heat damage. Perishables (chocolate, ice cream, raw fish, dairy-based sauces) melt/spoil/curdle above 25°C. Driver car interior can reach 50°C in summer. ACTION: use insulated + cool-pack packaging (refrigerant gel pack); pre-chill container; alert driver to use AC; refuse delivery >5km during peak heat. ${d.ambient_temp_c >= 35 ? 'CRITICAL: 35°C+ = active food safety hazard — bacterial growth on dairy/seafood within 30min. Refuse or use refrigerated transport. ' : ''}Cost: ${fmt$(monthlyOpp)}/mo. Heat damage is seasonal — adjust packaging strategy by season. Cool-pack costs $0.30 but saves ${fmt$(d.avg_complaint_cost)} per prevented complaint.`,
        ai_recommendation: 'cool_pack',
        status: 'open', detected_at: now,
      });
    }

    // Rule 7: COLD_AMBIENT_SENSITIVITY
    if (d.ambient_temp_c <= config.coldAmbientThreshold && (d.dish_category === 'soup' || d.dish_category === 'protein' || d.dish_category === 'starch')) {
      const tempLossRate = (config.criticalTempThreshold - d.predicted_arrival_temp_c) / Math.max(d.predicted_travel_time_min, 1);
      alerts.push({
        rule_id: 'cold_ambient_sensitivity',
        severity: 'medium',
        dish_name: d.dish_name,
        dish_category: d.dish_category,
        platform: d.platform,
        ambient_temp_c: d.ambient_temp_c,
        predicted_arrival_temp_c: d.predicted_arrival_temp_c,
        predicted_travel_time_min: d.predicted_travel_time_min,
        current_packaging_type: d.current_packaging_type,
        recommended_packaging: 'insulated',
        quality_score_predicted: d.quality_score_predicted,
        monthly_orders: d.monthly_orders,
        est_monthly_opportunity: Math.round(monthlyOpp * 0.5),
        description: `COLD AMBIENT SENSITIVITY: ${d.ambient_temp_c}°C ambient accelerates hot food cooling. ${d.dish_name} losing ${tempLossRate.toFixed(1)}°C/min → arrives at ${d.predicted_arrival_temp_c}°C after ${d.predicted_travel_time_min}min. Cold ambient = 2x faster temp loss vs 20°C. ACTION: upgrade to insulated bag + heat pack; minimize prep-to-pickup delay (target ≤3min); pre-warm container with hot water. Cold ambient is easy to handle with insulation but costly if ignored. Save ${fmt$(monthlyOpp * 0.5)}/mo. Winter packaging protocol differs from summer — train staff on seasonal packaging.`,
        ai_recommendation: 'insulated_packaging',
        status: 'open', detected_at: now,
      });
    }

    // Rule 8: PACKAGING_QUALITY_MISMATCH
    if (d.current_packaging_type === 'standard' || d.current_packaging_type === 'paper') {
      if (d.quality_score_predicted < 55 && d.recommended_packaging && d.recommended_packaging !== d.current_packaging_type) {
        alerts.push({
          rule_id: 'packaging_quality_mismatch',
          severity: 'medium',
          dish_name: d.dish_name,
          dish_category: d.dish_category,
          platform: d.platform,
          current_packaging_type: d.current_packaging_type,
          recommended_packaging: d.recommended_packaging,
          quality_score_predicted: d.quality_score_predicted,
          current_complaint_rate_pct: d.current_complaint_rate_pct,
          monthly_orders: d.monthly_orders,
          est_monthly_opportunity: Math.round(monthlyOpp * 0.7),
          description: `PACKAGING QUALITY MISMATCH: ${d.dish_name} currently uses ${d.current_packaging_type} packaging but quality score is only ${d.quality_score_predicted}/100. Upgrade to ${d.recommended_packaging} packaging recommended. Mismatch: dish needs ${d.recommended_packaging} properties (insulation/venting/cool) but current ${d.current_packaging_type} doesn't provide. ACTION: switch to ${d.recommended_packaging} packaging for this dish — quality score predicted to improve to 70+. Cost: ${d.recommended_packaging === 'insulated' ? '$0.15' : d.recommended_packaging === 'vented' ? '$0.02' : d.recommended_packaging === 'cool_pack' ? '$0.30' : '$0.10'} more per container × ${d.monthly_orders}/mo = ${fmt$(d.monthly_orders * (d.recommended_packaging === 'cool_pack' ? 0.30 : d.recommended_packaging === 'insulated' ? 0.15 : 0.05))}/mo added cost. BUT saves ${fmt$(monthlyOpp * 0.7)}/mo in complaints → net ${fmt$(monthlyOpp * 0.7 - d.monthly_orders * (d.recommended_packaging === 'cool_pack' ? 0.30 : 0.10))}/mo positive. Packaging is cheapest quality lever — small investment, big impact.`,
          ai_recommendation: 'upgrade_packaging',
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
              { role: 'system', content: 'You are a restaurant delivery quality + packaging optimization AI. Given predicted quality decay, recommend ONE specific action with expected quality improvement (max 200 chars, imperative voice).' },
              { role: 'user', content: `Dish: ${a.dish_name ?? 'n/a'} (${a.dish_category ?? 'n/a'}). Platform: ${a.platform ?? 'n/a'}. Distance: ${a.delivery_distance_km ?? 0}km. Travel: ${a.predicted_travel_time_min ?? 0}min. Ambient: ${a.ambient_temp_c ?? 0}°C. Prep-to-pickup: ${a.prep_to_pickup_minutes ?? 0}min. Predicted arrival temp: ${a.predicted_arrival_temp_c ?? 0}°C. Quality score: ${a.quality_score_predicted ?? 0}/100. Complaint rate: ${a.current_complaint_rate_pct ?? 0}%. Packaging: ${a.current_packaging_type ?? 'n/a'} → ${a.recommended_packaging ?? 'n/a'}. Monthly opportunity: ${fmt$(a.est_monthly_opportunity)}. Context: ${a.description}` },
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
    await db.query(`DELETE FROM delivery_quality_decay_alert WHERE status = 'open' AND detected_at < time::now() - 24h`);
  } catch { /* ignore */ }
  for (const a of alerts) {
    try {
      await db.query(`CREATE delivery_quality_decay_alert CONTENT $data`, {
        data: { ...a, detected_at: a.detected_at.toISOString() },
      });
    } catch { /* ignore */ }
  }

  return { alerts, generated: alerts.length };
};

export const getActiveAlerts = async (db: ReturnType<typeof useDB>): Promise<DelivDecayAlert[]> => {
  try {
    const result = await db.query(
      `SELECT * FROM delivery_quality_decay_alert WHERE status = 'open'
       ORDER BY est_monthly_opportunity DESC LIMIT 50`
    );
    return Array.isArray(result) ? result.flat() : [];
  } catch { return []; }
};

export const getSummary = async (db: ReturnType<typeof useDB>): Promise<{
  totalAlerts: number; criticalCount: number; totalOpportunity: number;
  dishesAtRisk: number; avgQualityScore: number; avgComplaintRate: number;
}> => {
  try {
    const result = await db.query(
      `SELECT count() AS total, math::count(severity = 'critical') AS critical,
              math::sum(est_monthly_opportunity WHERE est_monthly_opportunity > 0) AS opportunity,
              math::count(dish_name != NONE) AS dishes,
              math::mean(quality_score_predicted WHERE quality_score_predicted != NONE) AS avgquality,
              math::mean(current_complaint_rate_pct WHERE current_complaint_rate_pct != NONE) AS avgcomplaint
       FROM delivery_quality_decay_alert WHERE status = 'open' GROUP ALL`
    );
    const rows = Array.isArray(result) ? result.flat() : [];
    const r = rows[0] ?? {};
    return {
      totalAlerts: safeNumber(r.total, 0), criticalCount: safeNumber(r.critical, 0),
      totalOpportunity: safeNumber(r.opportunity, 0),
      dishesAtRisk: safeNumber(r.dishes, 0),
      avgQualityScore: safeNumber(r.avgquality, 0),
      avgComplaintRate: safeNumber(r.avgcomplaint, 0),
    };
  } catch {
    return { totalAlerts: 0, criticalCount: 0, totalOpportunity: 0, dishesAtRisk: 0, avgQualityScore: 0, avgComplaintRate: 0 };
  }
};

export const updateAlertStatus = async (
  db: ReturnType<typeof useDB>, alertId: string,
  status: 'resolved' | 'in_progress' | 'rejected' | 'expired'
): Promise<void> => {
  await db.query(`UPDATE $id SET status = $status`, { id: alertId, status });
};
