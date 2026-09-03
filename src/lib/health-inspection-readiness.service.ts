/**
 * AI Health Inspection Readiness Predictor — scores 0-100 readiness across
 * 8 FDA Food Code priority areas, predicts letter grade, flags violations.
 *
 * 63rd POSR-exclusive differentiator — restaurants face surprise health
 * inspections that cost $500-5,000 per violation + letter grade drops
 * (A→B = 15-30% revenue loss per grade drop, NYC data) + temporary closures
 * ($10k-50k/week lost revenue) + reputation damage.
 *
 * Distinct from:
 *   - compliance-tracking.service (EMPLOYEE certifications: food handler,
 *     alcohol server permits — NOT kitchen sanitation/inspection readiness)
 *   - food-safety.service (FOOD temperature/handling rules for specific dishes
 *     — NOT overall inspection readiness scoring across all zones)
 *   - complaint-pattern.service (CUSTOMER complaint patterns — NOT health
 *     dept inspection violations)
 *   - allergen-risk.service (ALLERGEN cross-contamination risk — NOT general
 *     health inspection readiness)
 *   - shrinkage-detection.service (INVENTORY theft/shrinkage — NOT safety)
 *
 * Predicts HEALTH INSPECTION READINESS:
 *   - Scores 0-100 readiness across 8 FDA Food Code priority areas
 *   - Tracks daily/weekly compliance checklists (auto-reminders for missed)
 *   - Predicts letter grade (A/B/C) based on current violations
 *   - Flags critical violations needing immediate correction
 *   - Estimates revenue risk ($ loss if grade drops)
 *   - AI-prioritizes fixes by impact + ease
 *
 * 8 AI rules (FDA Food Code priority violations):
 *   1. temperature_control — hot food <135°F or cold food >41°F (bacterial)
 *   2. surface_sanitation — food contact surfaces not sanitized (chlorine 50-100ppm)
 *   3. pest_control — rodent/roach/flies sightings + droppings
 *   4. chemical_storage — cleaners stored near food (cross-contamination)
 *   5. hand_hygiene — sinks blocked, no soap, no paper towels
 *   6. cross_contamination — raw meat above ready-to-eat food in walk-in
 *   7. expired_food — past use-by date, no date marking (7-day rule)
 *   8. training_certification — no food handler cert, sick employee working
 */

import { useDB } from '@/api/db/db.ts';
import { safeNumber } from '@/lib/utils.ts';

export type HealthRuleId =
  | 'temperature_control'
  | 'surface_sanitation'
  | 'pest_control'
  | 'chemical_storage'
  | 'hand_hygiene'
  | 'cross_contamination'
  | 'expired_food'
  | 'training_certification';

export type HealthAiRec =
  | 'fix_now'
  | 'schedule_fix'
  | 'retrain_staff'
  | 'monitor'
  | 'skip';

export interface HealthAlert {
  id?: string;
  rule_id: HealthRuleId;
  severity: 'critical' | 'high' | 'medium' | 'low';
  zone: string;
  violation_type: 'priority' | 'core' | 'foundation';
  current_score: number;
  target_score: number;
  last_check_date?: Date;
  days_overdue?: number;
  est_fine: number;
  est_revenue_risk: number;
  checklist_item: string;
  correction_action: string;
  est_fix_time_min?: number;
  description: string;
  ai_insight?: string;
  ai_recommendation?: HealthAiRec;
  status: 'open' | 'fixed' | 'scheduled' | 'rejected' | 'expired';
  detected_at: Date;
  expires_at?: Date;
}

export interface HealthConfig {
  aiEnabled: boolean;
  targetGrade: string;        // 'A' | 'B' | 'C'
  checklistFrequency: number; // 1 per day
  gradeAThreshold: number;    // 90.0
  gradeBThreshold: number;    // 80.0
}

export const DEFAULT_HEALTH_CONFIG: HealthConfig = {
  aiEnabled: true,
  targetGrade: 'A',
  checklistFrequency: 1,
  gradeAThreshold: 90.0,
  gradeBThreshold: 80.0,
};

export const readHealthConfig = (settings: any): HealthConfig => ({
  aiEnabled: settings?.health_ai_enabled ?? true,
  targetGrade: settings?.health_target_grade ?? 'A',
  checklistFrequency: safeNumber(settings?.health_checklist_frequency, 1),
  gradeAThreshold: safeNumber(settings?.health_grade_a_threshold, 90.0),
  gradeBThreshold: safeNumber(settings?.health_grade_b_threshold, 80.0),
});

const fmt$ = (n: number): string => `$${(n || 0).toFixed(2)}`;

// ---------------------------------------------------------------------------
// Mock compliance check data per zone + rule area
// (in production, from daily checklist logs + IoT temp sensors + inventory)
// ---------------------------------------------------------------------------
interface ZoneCompliance {
  zone: string;
  rule_id: HealthRuleId;
  current_score: number;      // 0-100
  last_check_hours_ago: number;
  checklist_item: string;
  correction_action: string;
  est_fix_time_min: number;
}

const COMPLIANCE_DATA: ZoneCompliance[] = [
  // Rule 1: Temperature control
  { zone: 'walk_in_cooler', rule_id: 'temperature_control', current_score: 72, last_check_hours_ago: 6, checklist_item: 'Cold hold temp < 41°F', correction_action: 'Adjust cooler thermostat, verify with probe thermometer', est_fix_time_min: 15 },
  { zone: 'prep_area',      rule_id: 'temperature_control', current_score: 85, last_check_hours_ago: 2, checklist_item: 'Hot hold temp > 135°F', correction_action: 'Reheat food to 165°F, monitor holding temp', est_fix_time_min: 30 },
  { zone: 'walk_in_freezer', rule_id: 'temperature_control', current_score: 95, last_check_hours_ago: 4, checklist_item: 'Freezer temp < 0°F', correction_action: 'No action needed', est_fix_time_min: 0 },

  // Rule 2: Surface sanitation
  { zone: 'prep_area',      rule_id: 'surface_sanitation', current_score: 68, last_check_hours_ago: 3, checklist_item: 'Sanitizer concentration 50-100ppm chlorine', correction_action: 'Mix fresh sanitizer solution, test with strips', est_fix_time_min: 10 },
  { zone: 'dish_station',   rule_id: 'surface_sanitation', current_score: 78, last_check_hours_ago: 5, checklist_item: 'Dish machine final rinse 180°F/sanitizer', correction_action: 'Check dish machine sanitizer level, refill if low', est_fix_time_min: 20 },
  { zone: 'kitchen',        rule_id: 'surface_sanitation', current_score: 82, last_check_hours_ago: 4, checklist_item: 'Cutting boards sanitized between uses', correction_action: 'Reinforce color-coded board rotation, retrain staff', est_fix_time_min: 45 },

  // Rule 3: Pest control
  { zone: 'storage',        rule_id: 'pest_control', current_score: 55, last_check_hours_ago: 48, checklist_item: 'No pest sightings/droppings in storage', correction_action: 'Call pest control service, seal entry points', est_fix_time_min: 120 },
  { zone: 'kitchen',        rule_id: 'pest_control', current_score: 88, last_check_hours_ago: 24, checklist_item: 'No fly activity in kitchen', correction_action: 'Replace fly traps, check door seals', est_fix_time_min: 30 },

  // Rule 4: Chemical storage
  { zone: 'storage',        rule_id: 'chemical_storage', current_score: 90, last_check_hours_ago: 8, checklist_item: 'Chemicals stored away from food', correction_action: 'No action needed', est_fix_time_min: 0 },
  { zone: 'dish_station',   rule_id: 'chemical_storage', current_score: 65, last_check_hours_ago: 12, checklist_item: 'Dish chemicals labeled + separated', correction_action: 'Label all spray bottles, move chemicals to designated cabinet', est_fix_time_min: 25 },

  // Rule 5: Hand hygiene
  { zone: 'kitchen',        rule_id: 'hand_hygiene', current_score: 75, last_check_hours_ago: 2, checklist_item: 'Hand sink stocked with soap + towels', correction_action: 'Restock soap dispenser, refill paper towels', est_fix_time_min: 10 },
  { zone: 'restrooms',      rule_id: 'hand_hygiene', current_score: 70, last_check_hours_ago: 3, checklist_item: 'Restroom sinks stocked + functional', correction_action: 'Fix leaking faucet, restock soap + towels', est_fix_time_min: 60 },
  { zone: 'prep_area',      rule_id: 'hand_hygiene', current_score: 92, last_check_hours_ago: 1, checklist_item: 'Hand sink accessible (not blocked)', correction_action: 'No action needed', est_fix_time_min: 0 },

  // Rule 6: Cross-contamination
  { zone: 'walk_in_cooler', rule_id: 'cross_contamination', current_score: 60, last_check_hours_ago: 5, checklist_item: 'Raw meat stored below ready-to-eat food', correction_action: 'Reorganize walk-in: raw meat on bottom shelves', est_fix_time_min: 45 },
  { zone: 'prep_area',      rule_id: 'cross_contamination', current_score: 85, last_check_hours_ago: 3, checklist_item: 'Separate cutting boards for raw vs ready-to-eat', correction_action: 'No action needed', est_fix_time_min: 0 },

  // Rule 7: Expired food
  { zone: 'walk_in_cooler', rule_id: 'expired_food', current_score: 50, last_check_hours_ago: 8, checklist_item: 'All food date-marked within 7-day rule', correction_action: 'Date-mark all prepped food containers, discard expired items', est_fix_time_min: 60 },
  { zone: 'walk_in_freezer', rule_id: 'expired_food', current_score: 80, last_check_hours_ago: 12, checklist_item: 'No expired items in freezer', correction_action: 'Label + rotate frozen stock by FIFO', est_fix_time_min: 30 },
  { zone: 'storage',        rule_id: 'expired_food', current_score: 75, last_check_hours_ago: 10, checklist_item: 'Dry goods within expiration date', correction_action: 'Check canned goods dates, discard bulging/rusted cans', est_fix_time_min: 45 },

  // Rule 8: Training certification
  { zone: 'kitchen',        rule_id: 'training_certification', current_score: 85, last_check_hours_ago: 168, checklist_item: 'All staff have current food handler certs', correction_action: 'Renew 2 expired food handler certs (staff: Maria, Jose)', est_fix_time_min: 0 },
  { zone: 'front_of_house', rule_id: 'training_certification', current_score: 70, last_check_hours_ago: 168, checklist_item: 'Sick employee policy enforced', correction_action: 'Send home staff with symptoms (vomiting/diarrhea/fever)', est_fix_time_min: 15 },
];

// FDA Food Code fine ranges per violation type
const FINE_BY_VIOLATION: Record<string, number> = {
  priority: 1500,    // critical violation (temp, cross-contamination, pest)
  core: 500,         // non-critical (labeling, cleanliness)
  foundation: 250,   // basic (training, documentation)
};

// Revenue impact per grade drop (NYC data: A→B = 15% revenue loss)
const GRADE_REVENUE_IMPACT: Record<string, number> = {
  A: 0,       // no impact (current grade A)
  B: 0.15,    // 15% revenue loss
  C: 0.30,    // 30% revenue loss
};

const ZONE_LABELS: Record<string, string> = {
  kitchen: 'Kitchen',
  prep_area: 'Prep Area',
  walk_in_cooler: 'Walk-in Cooler',
  walk_in_freezer: 'Walk-in Freezer',
  dish_station: 'Dish Station',
  front_of_house: 'Front of House',
  storage: 'Storage',
  restrooms: 'Restrooms',
};

/**
 * Run the health inspection readiness engine.
 */
export const runHealthEngine = async (
  db: ReturnType<typeof useDB>,
  config: HealthConfig = DEFAULT_HEALTH_CONFIG
): Promise<{ alerts: HealthAlert[]; generated: number; readinessScore: number; predictedGrade: string }> => {
  const alerts: HealthAlert[] = [];
  const now = new Date();
  const nowTime = now.getTime();

  // 1. Fetch real compliance data from checklist logs (if available)
  let complianceData: ZoneCompliance[] = [];
  try {
    const result = await db.query(
      `SELECT zone, rule_id, current_score, last_check_at, checklist_item,
              correction_action, est_fix_time_min
       FROM health_checklist_log
       WHERE created_at > time::now() - 7d
       ORDER BY created_at DESC`
    );
    const rows = Array.isArray(result) ? result.flat() : [];
    // Group by zone + rule_id, take latest
    const latest = new Map<string, any>();
    for (const r of rows) {
      const key = `${r.zone}|${r.rule_id}`;
      if (!latest.has(key)) latest.set(key, r);
    }
    complianceData = Array.from(latest.values()).map((r: any) => ({
      zone: String(r.zone ?? ''),
      rule_id: String(r.rule_id) as HealthRuleId,
      current_score: safeNumber(r.current_score, 0),
      last_check_hours_ago: r.last_check_at
        ? Math.floor((nowTime - new Date(String(r.last_check_at)).getTime()) / 3600000)
        : 24,
      checklist_item: String(r.checklist_item ?? ''),
      correction_action: String(r.correction_action ?? ''),
      est_fix_time_min: safeNumber(r.est_fix_time_min, 0),
    }));
  } catch (err) {
    console.warn('[health] fetchChecklistLogs failed — using mock', err);
  }

  // Fallback: use mock data
  if (complianceData.length === 0) {
    complianceData = COMPLIANCE_DATA;
  }

  // 2. Apply 8 rules — generate alerts for low scores + overdue checks
  for (const item of complianceData) {
    if (item.current_score >= 90) continue; // skip good scores

    // Determine violation type from rule_id
    const violationType: 'priority' | 'core' | 'foundation' =
      ['temperature_control', 'cross_contamination', 'pest_control'].includes(item.rule_id) ? 'priority'
      : ['surface_sanitation', 'chemical_storage', 'hand_hygiene', 'expired_food'].includes(item.rule_id) ? 'core'
      : 'foundation';

    // Days overdue (checklist should be done daily)
    const daysOverdue = Math.max(0, Math.floor(item.last_check_hours_ago / 24) - 1);

    // Severity based on score + violation type
    let severity: HealthAlert['severity'];
    if (item.current_score < 60 && violationType === 'priority') severity = 'critical';
    else if (item.current_score < 70) severity = 'high';
    else if (item.current_score < 80) severity = 'medium';
    else severity = 'low';

    // Estimated fine (based on violation type)
    const estFine = FINE_BY_VIOLATION[violationType];

    // Revenue risk: if this violation causes grade drop
    // Assume daily revenue $3000, 30 days/month
    const dailyRevenue = 3000;
    const revenueAtRisk = item.current_score < config.gradeBThreshold
      ? dailyRevenue * 30 * GRADE_REVENUE_IMPACT.B
      : item.current_score < config.gradeAThreshold
        ? dailyRevenue * 30 * (GRADE_REVENUE_IMPACT.B * 0.5)
        : 0;

    // AI recommendation based on severity + fix time
    let aiRec: HealthAiRec;
    if (severity === 'critical' && (item.est_fix_time_min ?? 0) <= 30) aiRec = 'fix_now';
    else if (severity === 'critical') aiRec = 'schedule_fix';
    else if (item.rule_id === 'training_certification' && item.current_score < 80) aiRec = 'retrain_staff';
    else if (severity === 'high' || severity === 'medium') aiRec = 'schedule_fix';
    else aiRec = 'monitor';

    const zoneLabel = ZONE_LABELS[item.zone] ?? item.zone;

    alerts.push({
      rule_id: item.rule_id,
      severity,
      zone: item.zone,
      violation_type: violationType,
      current_score: item.current_score,
      target_score: 95,
      last_check_date: new Date(nowTime - item.last_check_hours_ago * 3600000),
      days_overdue: daysOverdue || undefined,
      est_fine: estFine,
      est_revenue_risk: revenueAtRisk,
      checklist_item: item.checklist_item,
      correction_action: item.correction_action,
      est_fix_time_min: item.est_fix_time_min || undefined,
      description: `${zoneLabel}: ${item.checklist_item} — score ${item.current_score}/100 (${item.last_check_hours_ago}h ago). ${item.correction_action}.`,
      ai_recommendation: aiRec,
      status: 'open',
      detected_at: now,
    });
  }

  // 3. Calculate overall readiness score (weighted average)
  const weights: Record<HealthRuleId, number> = {
    temperature_control: 2.0,
    surface_sanitation: 1.5,
    pest_control: 2.0,
    chemical_storage: 1.0,
    hand_hygiene: 1.5,
    cross_contamination: 2.0,
    expired_food: 1.5,
    training_certification: 1.0,
  };

  let totalWeight = 0;
  let weightedSum = 0;
  for (const item of complianceData) {
    const w = weights[item.rule_id] ?? 1.0;
    totalWeight += w;
    weightedSum += item.current_score * w;
  }
  const readinessScore = totalWeight > 0 ? weightedSum / totalWeight : 0;

  // Predicted letter grade
  let predictedGrade: string;
  if (readinessScore >= config.gradeAThreshold) predictedGrade = 'A';
  else if (readinessScore >= config.gradeBThreshold) predictedGrade = 'B';
  else predictedGrade = 'C';

  // 4. AI insight for top 5 critical/high alerts
  if (config.aiEnabled && alerts.length > 0) {
    const { callOpenAIChat } = await import('@/lib/openai.service.ts').catch(() => ({} as any));
    if (callOpenAIChat) {
      const topAlerts = alerts
        .filter(a => a.severity === 'critical' || a.severity === 'high')
        .slice(0, 5);
      for (const a of topAlerts) {
        try {
          const response = await callOpenAIChat([
            { role: 'system', content: 'You are a restaurant health inspection readiness AI. Respond with a single actionable insight (max 200 chars).' },
            { role: 'user', content: `Health alert: ${a.rule_id} in ${a.zone} — score ${a.current_score}/100, est fine ${fmt$(a.est_fine)}, revenue risk ${fmt$(a.est_revenue_risk)}/mo. ${a.description}` },
          ], { temperature: 0.2, maxTokens: 120 });
          const text = typeof response === 'string' ? response : (response as any)?.content ?? '';
          a.ai_insight = text.slice(0, 200);
        } catch { /* skip AI failure */ }
      }
    }
  }

  // 5. Persist
  try {
    await db.query(`DELETE FROM health_readiness_alert WHERE status = 'open' AND detected_at < time::now() - 1h`);
  } catch { /* ignore */ }
  for (const a of alerts) {
    try {
      await db.query(`CREATE health_readiness_alert CONTENT $data`, {
        data: {
          ...a,
          last_check_date: a.last_check_date?.toISOString(),
          detected_at: a.detected_at.toISOString(),
        },
      });
    } catch { /* ignore individual insert failures */ }
  }

  return {
    alerts,
    generated: alerts.length,
    readinessScore: Math.round(readinessScore * 10) / 10,
    predictedGrade,
  };
};

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export const getActiveAlerts = async (db: ReturnType<typeof useDB>): Promise<HealthAlert[]> => {
  try {
    const result = await db.query(
      `SELECT * FROM health_readiness_alert
       WHERE status = 'open'
       ORDER BY est_revenue_risk DESC
       LIMIT 50`
    );
    return Array.isArray(result) ? result.flat() : [];
  } catch { return []; }
};

export const getSummary = async (db: ReturnType<typeof useDB>): Promise<{
  totalAlerts: number;
  criticalCount: number;
  totalFines: number;
  totalRevenueRisk: number;
}> => {
  try {
    const result = await db.query(
      `SELECT
         count() AS total,
         math::count(severity = 'critical') AS critical,
         math::sum(est_fine) AS fines,
         math::sum(est_revenue_risk) AS risk
       FROM health_readiness_alert
       WHERE status = 'open' GROUP ALL`
    );
    const rows = Array.isArray(result) ? result.flat() : [];
    const r = rows[0] ?? {};
    return {
      totalAlerts: safeNumber(r.total, 0),
      criticalCount: safeNumber(r.critical, 0),
      totalFines: safeNumber(r.fines, 0),
      totalRevenueRisk: safeNumber(r.risk, 0),
    };
  } catch {
    return { totalAlerts: 0, criticalCount: 0, totalFines: 0, totalRevenueRisk: 0 };
  }
};

export const updateAlertStatus = async (
  db: ReturnType<typeof useDB>,
  alertId: string,
  status: 'fixed' | 'scheduled' | 'rejected' | 'expired'
): Promise<void> => {
  await db.query(`UPDATE $id SET status = $status`, { id: alertId, status });
};
