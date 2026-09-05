/**
 * AI Plate Waste Predictor — predicts POST-CONSUMER plate waste (food left on
 * customer plates) before it happens, signals portion too large / recipe issue
 * / pairing mismatch / customer preference mismatch / plate composition issue.
 * Enables pre-emptive portion adjustment, recipe tweak, or menu removal.
 *
 * 141st POSR-exclusive differentiator — restaurants lose $600-2,500/mo per
 * location from post-consumer plate waste: oversized portions cost 8-15% more
 * in food cost without revenue gain; disliked sides/sauces signal recipe issues
 * that hurt repeat visits. No POS tracks what customers leave on the plate.
 *
 * Distinct from:
 *   - waste-tracking.service — tracks PRE-consumer KITCHEN waste (not plate)
 *   - waste-to-value-converter.service (98th) — REPURPOSES waste (not predict)
 *   - spoilage-prediction.service — predicts SHELF-LIFE (not consumption)
 *   - dish-profitability.service (34th) — margin snapshot (not consumption)
 *   - profitability-decay.service (120th) — margin TRAJECTORY (not portion reaction)
 *   - menu-cannibalization.service — item vs item (not consumption pattern)
 *   - menu-item-retirement.service (136th) — RETIREMENT (not portion tuning)
 *
 * 8 AI rules:
 *   1. oversized_portion — predicted waste ≥30% of portion → reduce portion size
 *   2. side_dish_rejection — side dish consistently left uneaten → substitute
 *   3. sauce_rejection — sauce consistently left → reduce amount or change recipe
 *   4. protein_overcook — protein left uneaten (likely overcooked) → temp check
 *   5. plate_composition_imbalance — plate ratio off (too much starch) → rebalance
 *   6. customer_segment_waste — segment-specific waste pattern → segment-aware portions
 *   7. time_of_day_waste — waste pattern by time (lunch smaller portions) → time-based portions
 *   8. recipe_improvement_opportunity — high waste + low satisfaction → recipe rework
 */

import { useDB } from '@/api/db/db.ts';
import { safeNumber } from '@/lib/utils.ts';

export type PlateWasteRuleId =
  | 'oversized_portion'
  | 'side_dish_rejection'
  | 'sauce_rejection'
  | 'protein_overcook'
  | 'plate_composition_imbalance'
  | 'customer_segment_waste'
  | 'time_of_day_waste'
  | 'recipe_improvement_opportunity';

export type PlateWasteAiRec =
  | 'reduce_portion'
  | 'substitute_side'
  | 'reduce_sauce'
  | 'change_sauce'
  | 'check_cook_temp'
  | 'rebalance_plate'
  | 'segment_aware_portion'
  | 'time_based_portion'
  | 'rework_recipe'
  | 'monitor'
  | 'skip';

export interface PlateWasteAlert {
  id?: string;
  rule_id: PlateWasteRuleId;
  severity: 'critical' | 'high' | 'medium' | 'low';
  dish_name?: string;
  dish_id?: string;
  component_type?: string;          // 'protein' | 'side' | 'sauce' | 'garnish' | 'starch' | 'vegetable'
  component_name?: string;
  avg_portion_size_grams?: number;
  avg_waste_grams?: number;
  waste_pct?: number;               // waste / portion × 100
  sample_size?: number;             // plates observed
  current_food_cost?: number;       // $ cost of wasted food per plate
  predicted_monthly_waste_cost?: number;
  customer_segment?: string;        // 'business' | 'family' | 'date' | 'solo' | 'celebration'
  time_of_day?: string;
  current_satisfaction?: number;    // 0-100
  est_monthly_opportunity: number;
  description: string;
  ai_insight?: string;
  ai_recommendation?: PlateWasteAiRec;
  status: 'open' | 'resolved' | 'in_progress' | 'rejected' | 'expired';
  detected_at: Date;
  expires_at?: Date;
}

export interface PlateWasteConfig {
  aiEnabled: boolean;
  wasteThresholdPct: number;        // % waste to trigger alert
  sampleSizeThreshold: number;      // min plates observed
  costThresholdPerPlate: number;    // $ waste per plate to trigger
}

export const DEFAULT_PLATEWASTE_CONFIG: PlateWasteConfig = {
  aiEnabled: true,
  wasteThresholdPct: 20.0,
  sampleSizeThreshold: 10,
  costThresholdPerPlate: 0.50,
};

export const readPlateWasteConfig = (settings: any): PlateWasteConfig => ({
  aiEnabled: settings?.platewaste_ai_enabled ?? true,
  wasteThresholdPct: safeNumber(settings?.platewaste_threshold_pct, 20.0),
  sampleSizeThreshold: safeNumber(settings?.platewaste_sample_min, 10),
  costThresholdPerPlate: safeNumber(settings?.platewaste_cost_threshold, 0.50),
});

const fmt$ = (n: number): string => `$${(n || 0).toFixed(2)}`;

interface PlateWasteData {
  dish_name: string;
  dish_id: string;
  component_type: string;
  component_name: string;
  avg_portion_size_grams: number;
  avg_waste_grams: number;
  waste_pct: number;
  sample_size: number;
  // Cost
  food_cost_per_gram: number;       // $ cost of this component per gram
  current_food_cost_waste: number;  // $ wasted per plate
  // Volume
  monthly_plates_sold: number;
  predicted_monthly_waste_cost: number;
  // Context
  customer_segment: string;          // 'all' or specific segment
  time_of_day: string;               // 'all' or specific
  current_satisfaction: number;
  // For imbalance rule
  plate_composition?: {              // optional, only on main protein rows
    protein_pct?: number;
    starch_pct?: number;
    vegetable_pct?: number;
    sauce_pct?: number;
    garnish_pct?: number;
  };
  // For protein overcook
  protein_doneness?: string;          // 'rare' | 'medium' | 'well'
  protein_target_temp_c?: number;
  protein_actual_temp_c?: number;
  // For recipe improvement
  repeat_visit_pct?: number;         // % customers who return after ordering this dish
}

const MOCK_DATA: PlateWasteData[] = [
  {
    dish_name: 'Ribeye Steak Frites', dish_id: 'ribeye_01',
    component_type: 'starch', component_name: 'French fries',
    avg_portion_size_grams: 280, avg_waste_grams: 110, waste_pct: 39.3,
    sample_size: 87, food_cost_per_gram: 0.0042, current_food_cost_waste: 0.46,
    monthly_plates_sold: 240, predicted_monthly_waste_cost: 110.4,
    customer_segment: 'all', time_of_day: 'all', current_satisfaction: 82,
  },
  {
    dish_name: 'Margherita Pizza', dish_id: 'marg_01',
    component_type: 'starch', component_name: 'Pizza crust (edges)',
    avg_portion_size_grams: 180, avg_waste_grams: 65, waste_pct: 36.1,
    sample_size: 142, food_cost_per_gram: 0.0018, current_food_cost_waste: 0.12,
    monthly_plates_sold: 380, predicted_monthly_waste_cost: 45.6,
    customer_segment: 'all', time_of_day: 'all', current_satisfaction: 88,
  },
  {
    dish_name: 'Salmon Niçoise', dish_id: 'salmon_nis_01',
    component_type: 'protein', component_name: 'Salmon fillet',
    avg_portion_size_grams: 200, avg_waste_grams: 48, waste_pct: 24.0,
    sample_size: 56, food_cost_per_gram: 0.064, current_food_cost_waste: 3.07,
    monthly_plates_sold: 95, predicted_monthly_waste_cost: 291.7,
    customer_segment: 'all', time_of_day: 'lunch', current_satisfaction: 71,
    protein_doneness: 'medium_well', protein_target_temp_c: 50, protein_actual_temp_c: 65,
  },
  {
    dish_name: 'Pasta Carbonara', dish_id: 'carb_01',
    component_type: 'sauce', component_name: 'Carbonara sauce',
    avg_portion_size_grams: 120, avg_waste_grams: 42, waste_pct: 35.0,
    sample_size: 78, food_cost_per_gram: 0.012, current_food_cost_waste: 0.50,
    monthly_plates_sold: 180, predicted_monthly_waste_cost: 90.5,
    customer_segment: 'all', time_of_day: 'all', current_satisfaction: 74,
  },
  {
    dish_name: 'Grilled Chicken Bowl', dish_id: 'chick_bowl_01',
    component_type: 'starch', component_name: 'Brown rice',
    avg_portion_size_grams: 220, avg_waste_grams: 95, waste_pct: 43.2,
    sample_size: 64, food_cost_per_gram: 0.0035, current_food_cost_waste: 0.33,
    monthly_plates_sold: 210, predicted_monthly_waste_cost: 70.0,
    customer_segment: 'all', time_of_day: 'all', current_satisfaction: 79,
    plate_composition: { protein_pct: 25, starch_pct: 50, vegetable_pct: 15, sauce_pct: 7, garnish_pct: 3 },
  },
  {
    dish_name: 'Truffle Risotto', dish_id: 'truff_ris_01',
    component_type: 'protein', component_name: 'Risotto base',
    avg_portion_size_grams: 350, avg_waste_grams: 130, waste_pct: 37.1,
    sample_size: 42, food_cost_per_gram: 0.0089, current_food_cost_waste: 1.16,
    monthly_plates_sold: 75, predicted_monthly_waste_cost: 86.7,
    customer_segment: 'all', time_of_day: 'dinner', current_satisfaction: 76,
    repeat_visit_pct: 18,
  },
  {
    dish_name: 'Margherita Pizza', dish_id: 'marg_01',
    component_type: 'vegetable', component_name: 'Fresh basil garnish',
    avg_portion_size_grams: 8, avg_waste_grams: 5, waste_pct: 62.5,
    sample_size: 142, food_cost_per_gram: 0.085, current_food_cost_waste: 0.43,
    monthly_plates_sold: 380, predicted_monthly_waste_cost: 162.6,
    customer_segment: 'all', time_of_day: 'all', current_satisfaction: 88,
  },
  {
    dish_name: 'Big Breakfast Platter', dish_id: 'breakfast_01',
    component_type: 'starch', component_name: 'Hash browns',
    avg_portion_size_grams: 200, avg_waste_grams: 75, waste_pct: 37.5,
    sample_size: 95, food_cost_per_gram: 0.0038, current_food_cost_waste: 0.29,
    monthly_plates_sold: 280, predicted_monthly_waste_cost: 80.0,
    customer_segment: 'solo', time_of_day: 'breakfast', current_satisfaction: 81,
  },
];

export const runPlateWasteEngine = async (
  db: ReturnType<typeof useDB>,
  config: PlateWasteConfig = DEFAULT_PLATEWASTE_CONFIG
): Promise<{ alerts: PlateWasteAlert[]; generated: number }> => {
  const alerts: PlateWasteAlert[] = [];
  const now = new Date();

  let data: PlateWasteData[] = [];
  try {
    const result = await db.query(
      `SELECT dish_name, dish_id, component_type, component_name,
              avg_portion_size_grams, avg_waste_grams, waste_pct, sample_size,
              food_cost_per_gram, current_food_cost_waste, monthly_plates_sold,
              predicted_monthly_waste_cost, customer_segment, time_of_day,
              current_satisfaction, plate_composition, protein_doneness,
              protein_target_temp_c, protein_actual_temp_c, repeat_visit_pct
       FROM plate_waste_log
       WHERE status = 'active'
       LIMIT 50`
    );
    const rows = Array.isArray(result) ? result.flat() : [];
    data = rows.map((r: any) => ({
      dish_name: String(r.dish_name ?? ''),
      dish_id: String(r.dish_id ?? ''),
      component_type: String(r.component_type ?? 'side'),
      component_name: String(r.component_name ?? ''),
      avg_portion_size_grams: safeNumber(r.avg_portion_size_grams, 0),
      avg_waste_grams: safeNumber(r.avg_waste_grams, 0),
      waste_pct: safeNumber(r.waste_pct, 0),
      sample_size: safeNumber(r.sample_size, 0),
      food_cost_per_gram: safeNumber(r.food_cost_per_gram, 0),
      current_food_cost_waste: safeNumber(r.current_food_cost_waste, 0),
      monthly_plates_sold: safeNumber(r.monthly_plates_sold, 0),
      predicted_monthly_waste_cost: safeNumber(r.predicted_monthly_waste_cost, 0),
      customer_segment: String(r.customer_segment ?? 'all'),
      time_of_day: String(r.time_of_day ?? 'all'),
      current_satisfaction: safeNumber(r.current_satisfaction, 0),
      plate_composition: r.plate_composition ?? undefined,
      protein_doneness: r.protein_doneness ?? undefined,
      protein_target_temp_c: r.protein_target_temp_c != null ? safeNumber(r.protein_target_temp_c, 0) : undefined,
      protein_actual_temp_c: r.protein_actual_temp_c != null ? safeNumber(r.protein_actual_temp_c, 0) : undefined,
      repeat_visit_pct: r.repeat_visit_pct != null ? safeNumber(r.repeat_visit_pct, 0) : undefined,
    }));
  } catch (err) {
    console.warn('[platewaste] fetchData failed — using mock', err);
  }

  if (data.length === 0) {
    data = MOCK_DATA;
  }

  for (const d of data) {
    // Skip if sample size too small for confident prediction
    if (d.sample_size < config.sampleSizeThreshold) continue;

    const monthlyOpp = Math.round(d.predicted_monthly_waste_cost);

    // Rule 1: OVERSIZED_PORTION
    if (d.waste_pct >= 30 && d.component_type !== 'garnish') {
      const recommendedReduction = Math.round(d.avg_portion_size_grams * (d.waste_pct - 15) / 100);
      alerts.push({
        rule_id: 'oversized_portion',
        severity: d.waste_pct >= 40 ? 'critical' : 'high',
        dish_name: d.dish_name,
        component_type: d.component_type,
        component_name: d.component_name,
        avg_portion_size_grams: d.avg_portion_size_grams,
        avg_waste_grams: d.avg_waste_grams,
        waste_pct: d.waste_pct,
        sample_size: d.sample_size,
        current_food_cost: d.current_food_cost_waste,
        predicted_monthly_waste_cost: d.predicted_monthly_waste_cost,
        est_monthly_opportunity: monthlyOpp,
        description: `OVERSIZED PORTION: ${d.dish_name} — ${d.component_name} (${d.component_type}) portion ${d.avg_portion_size_grams}g but customers waste ${d.avg_waste_grams}g (${d.waste_pct.toFixed(0)}% — threshold 30%). Sample: ${d.sample_size} plates. ${d.waste_pct >= 40 ? 'CRITICAL: 40%+ waste means portions are dramatically oversized. ' : ''}ACTION: reduce portion by ~${recommendedReduction}g (target waste ≤15%). Food cost saving: ${fmt$(d.current_food_cost_waste * 0.6)}/plate × ${d.monthly_plates_sold}/mo = ${fmt$(monthlyOpp * 0.6)}/mo. Smaller portions also improve perceived value + speed up service. Most customers won't notice a 15-20% reduction — but you save on every plate. Cost of inaction: ${fmt$(monthlyOpp)}/mo wasted.`,
        ai_recommendation: 'reduce_portion',
        status: 'open', detected_at: now,
      });
    }

    // Rule 2: SIDE_DISH_REJECTION
    if (d.component_type === 'starch' || d.component_type === 'vegetable') {
      if (d.waste_pct >= 30 && d.sample_size >= 20) {
        alerts.push({
          rule_id: 'side_dish_rejection',
          severity: d.waste_pct >= 40 ? 'high' : 'medium',
          dish_name: d.dish_name,
          component_type: d.component_type,
          component_name: d.component_name,
          avg_portion_size_grams: d.avg_portion_size_grams,
          waste_pct: d.waste_pct,
          sample_size: d.sample_size,
          current_food_cost: d.current_food_cost_waste,
          predicted_monthly_waste_cost: d.predicted_monthly_waste_cost,
          est_monthly_opportunity: monthlyOpp,
          description: `SIDE DISH REJECTION: ${d.dish_name} — ${d.component_name} (${d.component_type}) consistently wasted (${d.waste_pct.toFixed(0)}%, sample ${d.sample_size}). This isn't portion size — customers are REJECTING this side (taste/texture/appearance issue). ACTION: substitute side dish OR reformulate recipe. Common substitutions: roasted vegetables instead of fries, side salad instead of potatoes, fruit instead of toast. Chef should sample + improve. Side dish rejection also hurts overall dish satisfaction (current: ${d.current_satisfaction}/100). Customers judge the WHOLE plate — bad side = bad review. Save ${fmt$(monthlyOpp)}/mo in food cost + boost satisfaction.`,
          ai_recommendation: 'substitute_side',
          status: 'open', detected_at: now,
        });
      }
    }

    // Rule 3: SAUCE_REJECTION
    if (d.component_type === 'sauce' && d.waste_pct >= 25) {
      alerts.push({
        rule_id: 'sauce_rejection',
        severity: d.waste_pct >= 35 ? 'high' : 'medium',
        dish_name: d.dish_name,
        component_type: d.component_type,
        component_name: d.component_name,
        avg_portion_size_grams: d.avg_portion_size_grams,
        waste_pct: d.waste_pct,
        sample_size: d.sample_size,
        current_food_cost: d.current_food_cost_waste,
        predicted_monthly_waste_cost: d.predicted_monthly_waste_cost,
        est_monthly_opportunity: monthlyOpp,
        description: `SAUCE REJECTION: ${d.dish_name} — ${d.component_name} left uneaten (${d.waste_pct.toFixed(0)}% of ${d.avg_portion_size_grams}g portion, sample ${d.sample_size}). Sauce rejection signals: too spicy/salty/bland, wrong flavor pairing, or too much sauce (over-saucing). ACTION: ${d.waste_pct >= 40 ? 'CHANGE SAUCE RECIPE — try milder version, different acidity, or alternative pairing. ' : 'REDUCE SAUCE PORTION by 30-40% OR offer sauce on side. '}'Sauce defines dish identity — wrong sauce = bad dish. Test 2-3 variations with chef tasting panel. Save ${fmt$(monthlyOpp)}/mo in sauce cost + significantly improve dish reviews. Sauce rejection often correlates with low repeat orders.`,
        ai_recommendation: d.waste_pct >= 40 ? 'change_sauce' : 'reduce_sauce',
        status: 'open', detected_at: now,
      });
    }

    // Rule 4: PROTEIN_OVERCOOK
    if (d.component_type === 'protein' && d.waste_pct >= 20) {
      const overcooked = d.protein_actual_temp_c != null && d.protein_target_temp_c != null
        && d.protein_actual_temp_c > d.protein_target_temp_c + 5;
      alerts.push({
        rule_id: 'protein_overcook',
        severity: d.waste_pct >= 30 ? 'high' : 'medium',
        dish_name: d.dish_name,
        component_type: d.component_type,
        component_name: d.component_name,
        avg_portion_size_grams: d.avg_portion_size_grams,
        waste_pct: d.waste_pct,
        sample_size: d.sample_size,
        current_food_cost: d.current_food_cost_waste,
        predicted_monthly_waste_cost: d.predicted_monthly_waste_cost,
        est_monthly_opportunity: monthlyOpp,
        description: `PROTEIN OVERCOOK suspected: ${d.dish_name} — ${d.component_name} wasted ${d.waste_pct.toFixed(0)}% (sample ${d.sample_size}). Protein is the most expensive component — when customers leave it, the cause is almost always COOKING QUALITY (overcooked = dry/tough, undercooked = unappetizing). ${overcooked ? `Temp check: target ${d.protein_target_temp_c}°C but actual ${d.protein_actual_temp_c}°C — OVERCOOKED by ${d.protein_actual_temp_c - d.protein_target_temp_c}°C. ` : 'Verify cook temp with probe thermometer. '}'ACTION: retrain cooks on doneness temps, calibrate grill thermometers, use sous-vide for consistency. ${d.protein_doneness ? `Currently cooked to: ${d.protein_doneness}. ` : ''}Protein waste is the most expensive waste — ${fmt$(d.current_food_cost_waste)}/plate × ${d.monthly_plates_sold}/mo = ${fmt$(monthlyOpp)}/mo. Customers who get a dry/overcooked protein rarely return.`,
        ai_recommendation: 'check_cook_temp',
        status: 'open', detected_at: now,
      });
    }

    // Rule 5: PLATE_COMPOSITION_IMBALANCE
    if (d.plate_composition && d.component_type === 'starch') {
      const c = d.plate_composition;
      const starchPct = c.starch_pct ?? 0;
      const proteinPct = c.protein_pct ?? 0;
      const vegPct = c.vegetable_pct ?? 0;
      if (starchPct >= 45 && d.waste_pct >= 30) {
        alerts.push({
          rule_id: 'plate_composition_imbalance',
          severity: 'medium',
          dish_name: d.dish_name,
          component_type: d.component_type,
          component_name: d.component_name,
          avg_portion_size_grams: d.avg_portion_size_grams,
          waste_pct: d.waste_pct,
          sample_size: d.sample_size,
          est_monthly_opportunity: Math.round(monthlyOpp * 0.5),
          description: `PLATE COMPOSITION IMBALANCE: ${d.dish_name} — starch is ${starchPct}% of plate (target 25-30%), protein ${proteinPct}% (target 35-40%), vegetables ${vegPct}% (target 30-35%). Customer waste pattern (${d.waste_pct.toFixed(0)}% of starch) signals they want LESS starch + MORE protein/veg. ACTION: rebalance plate — reduce starch from ${starchPct}% to 28%, increase protein from ${proteinPct}% to 38%, increase vegetables from ${vegPct}% to 34%. Better balance = higher perceived value + less waste + better reviews. Cost neutral (starch is cheap, protein costs more but customers finish it). Save ${fmt$(monthlyOpp * 0.5)}/mo in waste + boost satisfaction.`,
          ai_recommendation: 'rebalance_plate',
          status: 'open', detected_at: now,
        });
      }
    }

    // Rule 6: CUSTOMER_SEGMENT_WASTE
    if (d.customer_segment !== 'all' && d.customer_segment !== '' && d.waste_pct >= 25) {
      alerts.push({
        rule_id: 'customer_segment_waste',
        severity: 'medium',
        dish_name: d.dish_name,
        component_type: d.component_type,
        component_name: d.component_name,
        waste_pct: d.waste_pct,
        sample_size: d.sample_size,
        customer_segment: d.customer_segment,
        est_monthly_opportunity: Math.round(monthlyOpp * 0.7),
        description: `CUSTOMER SEGMENT WASTE: ${d.dish_name} — ${d.component_name} wasted ${d.waste_pct.toFixed(0)}% specifically by ${d.customer_segment} customers (sample ${d.sample_size}). Different segments have different appetites/preferences: solo diners want smaller portions, business diners eat efficiently, families waste more (kids picky), date couples share. ACTION: offer segment-aware portion sizes — ${d.customer_segment === 'solo' ? 'add "small portion" option (-25% size, -15% price) for solo diners. ' : d.customer_segment === 'family' ? 'add "kids portion" for children + smaller "lite" version for adults. ' : 'train servers to suggest portion size based on party type. '}'Segment-aware portions save ${fmt$(monthlyOpp * 0.7)}/mo + improve perceived customization.`,
        ai_recommendation: 'segment_aware_portion',
        status: 'open', detected_at: now,
      });
    }

    // Rule 7: TIME_OF_DAY_WASTE
    if (d.time_of_day !== 'all' && d.time_of_day !== '' && d.waste_pct >= 25) {
      const segmentMsg = d.time_of_day === 'lunch' ? 'lunch customers want LIGHTER meals — large portions feel heavy + slow them down' : d.time_of_day === 'breakfast' ? 'breakfast customers want smaller, faster meals' : d.time_of_day === 'dinner' ? 'dinner customers expect fuller portions' : 'this time slot';
      alerts.push({
        rule_id: 'time_of_day_waste',
        severity: 'medium',
        dish_name: d.dish_name,
        component_type: d.component_type,
        component_name: d.component_name,
        waste_pct: d.waste_pct,
        sample_size: d.sample_size,
        time_of_day: d.time_of_day,
        est_monthly_opportunity: Math.round(monthlyOpp * 0.6),
        description: `TIME-OF-DAY WASTE: ${d.dish_name} — ${d.component_name} wasted ${d.waste_pct.toFixed(0)}% during ${d.time_of_day} (sample ${d.sample_size}). ${segmentMsg}. ACTION: implement time-based portion sizes — same dish, smaller portion during ${d.time_of_day}. ${d.time_of_day === 'lunch' ? 'Lunch portion: 25% smaller, $2-3 cheaper, faster turnover. ' : d.time_of_day === 'breakfast' ? 'Breakfast portion: 20% smaller, $1-2 cheaper. ' : 'Adjust portion size by 15-20% for this time slot. '}'Time-based portions save ${fmt$(monthlyOpp * 0.6)}/mo + speed up service during peak ${d.time_of_day} hours.`,
        ai_recommendation: 'time_based_portion',
        status: 'open', detected_at: now,
      });
    }

    // Rule 8: RECIPE_IMPROVEMENT_OPPORTUNITY
    if (d.waste_pct >= 25 && d.current_satisfaction < 80 && (d.repeat_visit_pct != null && d.repeat_visit_pct < 25)) {
      alerts.push({
        rule_id: 'recipe_improvement_opportunity',
        severity: 'high',
        dish_name: d.dish_name,
        component_type: d.component_type,
        component_name: d.component_name,
        waste_pct: d.waste_pct,
        sample_size: d.sample_size,
        current_satisfaction: d.current_satisfaction,
        est_monthly_opportunity: Math.round(monthlyOpp * 1.5),
        description: `RECIPE IMPROVEMENT OPPORTUNITY: ${d.dish_name} — triple signal of waste (${d.waste_pct.toFixed(0)}%) + low satisfaction (${d.current_satisfaction}/100) + low repeat rate (${d.repeat_visit_pct}% return). This dish is FAILING on multiple dimensions. ${d.component_type === 'protein' ? 'Protein preparation is the likely culprit. ' : d.component_type === 'sauce' ? 'Sauce recipe needs rework. ' : d.component_type === 'starch' ? 'Starch preparation (over/undercooked, wrong seasoning). ' : 'Component needs recipe rework. '}'ACTION: chef-driven recipe rework — blind taste test 3 variations with staff + loyal customers; replace underperforming version. ${d.repeat_visit_pct < 15 ? 'CRITICAL: <15% repeat rate means customers actively AVOID reordering — dish is hurting menu perception. Consider removing if rework fails. ' : 'Recipe rework typically takes 2-3 iterations. '}'Save ${fmt$(monthlyOpp * 1.5)}/mo (waste + recovered repeat business). Recipe quality is the #1 driver of customer retention.`,
        ai_recommendation: 'rework_recipe',
        status: 'open', detected_at: now,
      });
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
              { role: 'system', content: 'You are a restaurant kitchen operations + recipe optimization AI. Given plate waste data, recommend ONE specific action with expected savings (max 200 chars, imperative voice).' },
              { role: 'user', content: `Dish: ${a.dish_name ?? 'n/a'}. Component: ${a.component_name ?? 'n/a'} (${a.component_type ?? 'n/a'}). Portion: ${a.avg_portion_size_grams ?? 0}g. Waste: ${a.avg_waste_grams ?? 0}g (${a.waste_pct ?? 0}%). Sample: ${a.sample_size ?? 0} plates. Cost/plate wasted: ${fmt$(a.current_food_cost ?? 0)}. Monthly waste cost: ${fmt$(a.predicted_monthly_waste_cost ?? 0)}. Satisfaction: ${a.current_satisfaction ?? 0}/100. Segment: ${a.customer_segment ?? 'all'}. Time: ${a.time_of_day ?? 'all'}. Context: ${a.description}` },
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
    await db.query(`DELETE FROM plate_waste_alert WHERE status = 'open' AND detected_at < time::now() - 24h`);
  } catch { /* ignore */ }
  for (const a of alerts) {
    try {
      await db.query(`CREATE plate_waste_alert CONTENT $data`, {
        data: { ...a, detected_at: a.detected_at.toISOString() },
      });
    } catch { /* ignore */ }
  }

  return { alerts, generated: alerts.length };
};

export const getActiveAlerts = async (db: ReturnType<typeof useDB>): Promise<PlateWasteAlert[]> => {
  try {
    const result = await db.query(
      `SELECT * FROM plate_waste_alert WHERE status = 'open'
       ORDER BY est_monthly_opportunity DESC LIMIT 50`
    );
    return Array.isArray(result) ? result.flat() : [];
  } catch { return []; }
};

export const getSummary = async (db: ReturnType<typeof useDB>): Promise<{
  totalAlerts: number; criticalCount: number; totalOpportunity: number;
  dishesAffected: number; avgWastePct: number; totalMonthlyWasteCost: number;
}> => {
  try {
    const result = await db.query(
      `SELECT count() AS total, math::count(severity = 'critical') AS critical,
              math::sum(est_monthly_opportunity WHERE est_monthly_opportunity > 0) AS opportunity,
              math::count(dish_name != NONE) AS dishes,
              math::mean(waste_pct WHERE waste_pct != NONE) AS avgwaste,
              math::sum(predicted_monthly_waste_cost WHERE predicted_monthly_waste_cost != NONE) AS totalcost
       FROM plate_waste_alert WHERE status = 'open' GROUP ALL`
    );
    const rows = Array.isArray(result) ? result.flat() : [];
    const r = rows[0] ?? {};
    return {
      totalAlerts: safeNumber(r.total, 0), criticalCount: safeNumber(r.critical, 0),
      totalOpportunity: safeNumber(r.opportunity, 0),
      dishesAffected: safeNumber(r.dishes, 0),
      avgWastePct: safeNumber(r.avgwaste, 0),
      totalMonthlyWasteCost: safeNumber(r.totalcost, 0),
    };
  } catch {
    return { totalAlerts: 0, criticalCount: 0, totalOpportunity: 0, dishesAffected: 0, avgWastePct: 0, totalMonthlyWasteCost: 0 };
  }
};

export const updateAlertStatus = async (
  db: ReturnType<typeof useDB>, alertId: string,
  status: 'resolved' | 'in_progress' | 'rejected' | 'expired'
): Promise<void> => {
  await db.query(`UPDATE $id SET status = $status`, { id: alertId, status });
};
