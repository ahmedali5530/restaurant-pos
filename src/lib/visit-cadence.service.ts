/**
 * AI Customer Visit Cadence Prediction service — predict WHEN customers return.
 *
 * 21st POSR-exclusive differentiator — Toast, Square, Lightspeed have visit
 * FREQUENCY (count) but NO cadence TIMING prediction. Sending a re-engagement
 * message too early wastes spend; too late loses the customer. POSR predicts
 * the expected return date per customer based on historical inter-visit
 * intervals + AI recommendations for optimal re-engagement timing.
 *
 * Distinct from:
 *   - churn.service (predicts IF customer will leave)
 *   - clv-trajectory.service (predicts VALUE direction)
 *   - winback.service (targets already-left customers)
 *   - noshow-prediction.service (predicts reservation attendance)
 * This service predicts the TIMING of next visit — when will they return?
 *
 * Algorithm:
 *   1. For each customer with 3+ orders:
 *      - Compute inter-visit intervals (days between consecutive orders)
 *      - median_interval = median of intervals (robust to outliers)
 *      - mean_interval = average
 *      - last_visit = most recent order date
 *      - days_since_last = today - last_visit
 *      - expected_return = last_visit + median_interval
 *      - overdue_days = today - expected_return
 *   2. Cadence classification: regular / occasional / infrequent / one_time
 *   3. Overdue status: on_track / due_soon / overdue / significantly_overdue
 *   4. AI recommendation: send_reminder | loyalty_nudge | win_back_campaign |
 *      no_action | schedule_staff
 */

import { useDB } from '@/api/db/db.ts';
import { safeNumber } from '@/lib/utils.ts';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CadenceType = 'regular' | 'occasional' | 'infrequent' | 'one_time';
export type OverdueStatus = 'on_track' | 'due_soon' | 'overdue' | 'significantly_overdue';
export type CadenceRecommendation =
  | 'send_reminder' | 'loyalty_nudge' | 'win_back_campaign' | 'no_action' | 'schedule_staff';

export interface VisitCadence {
  id?: string;
  customer?: string;
  customer_name: string;
  total_visits: number;
  median_interval_days: number;
  mean_interval_days: number;
  interval_stddev: number;
  last_visit_date: Date;
  days_since_last_visit: number;
  expected_return_date: Date;
  overdue_days: number;
  overdue_pct: number;
  cadence_type: CadenceType;
  overdue_status: OverdueStatus;
  consistency_score: number;        // 0-1
  est_return_probability: number;  // 0-1
  est_next_visit_value: number;
  ai_insight?: string;
  ai_recommendation?: CadenceRecommendation;
  action_taken: string;
  analyzed_at: Date;
  branch_id?: string;
}

export interface CadenceConfig {
  aiEnabled: boolean;
  lookbackDays: number;
  minVisits: number;
  regularMaxDays: number;
  occasionalMaxDays: number;
  significantOverdueMultiplier: number;
}

export const DEFAULT_CADENCE_CONFIG: CadenceConfig = {
  aiEnabled: true,
  lookbackDays: 365,
  minVisits: 3,
  regularMaxDays: 7,
  occasionalMaxDays: 21,
  significantOverdueMultiplier: 1.5,
};

export const readCadenceConfig = (settings: any): CadenceConfig => ({
  aiEnabled: settings?.cadence_ai_enabled ?? true,
  lookbackDays: safeNumber(settings?.cadence_lookback_days, 365),
  minVisits: safeNumber(settings?.cadence_min_visits, 3),
  regularMaxDays: safeNumber(settings?.cadence_regular_max_days, 7),
  occasionalMaxDays: safeNumber(settings?.cadence_occasional_max_days, 21),
  significantOverdueMultiplier: safeNumber(settings?.cadence_significant_overdue_multiplier, 1.5),
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const formatCurrency = (n: number): string => `$${(n || 0).toFixed(2)}`;

const classifyCadence = (medianInterval: number, cfg: CadenceConfig): CadenceType => {
  if (medianInterval <= 0) return 'one_time';
  if (medianInterval <= cfg.regularMaxDays) return 'regular';
  if (medianInterval <= cfg.occasionalMaxDays) return 'occasional';
  return 'infrequent';
};

const classifyOverdue = (
  daysSinceLast: number,
  medianInterval: number,
  cfg: CadenceConfig
): OverdueStatus => {
  if (medianInterval <= 0) return 'on_track';
  const overdueDays = daysSinceLast - medianInterval;
  if (overdueDays <= -2) return 'on_track'; // more than 2 days before expected
  if (overdueDays <= 0) return 'due_soon'; // within 2 days of expected
  if (overdueDays <= medianInterval * (cfg.significantOverdueMultiplier - 1)) return 'overdue';
  return 'significantly_overdue';
};

// Compute median of an array
const median = (arr: number[]): number => {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
};

// Compute std dev
const stdDev = (arr: number[], mean: number): number => {
  if (arr.length === 0) return 0;
  const variance = arr.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / arr.length;
  return Math.sqrt(variance);
};

// ---------------------------------------------------------------------------
// Data fetching
// ---------------------------------------------------------------------------

interface CustomerVisits {
  customerId: string;
  customerName: string;
  visitDates: Date[];
  avgCheck: number;
}

const fetchCustomerVisits = async (db: any, cfg: CadenceConfig): Promise<CustomerVisits[]> => {
  try {
    const result = await db.query(
      `SELECT
         customer.id AS cid,
         customer.name AS cname,
         created_at,
         total
       FROM order
       WHERE status = 'Paid'
         AND deleted_at IS NONE
         AND customer IS NOT NONE
         AND created_at > time::now() - ${cfg.lookbackDays}d
       ORDER BY customer.id, created_at ASC
       FETCH customer`
    );
    const rows = Array.isArray(result) ? result.flat() : [];
    const customerMap = new Map<string, CustomerVisits>();

    for (const r of rows) {
      const cid = r.cid?.toString?.() ?? '';
      if (!cid) continue;
      if (!customerMap.has(cid)) {
        customerMap.set(cid, {
          customerId: cid,
          customerName: r.cname ?? 'Unknown',
          visitDates: [],
          avgCheck: 0,
        });
      }
      const entry = customerMap.get(cid)!;
      entry.visitDates.push(new Date(r.created_at));
      entry.avgCheck += safeNumber(r.total, 0);
    }

    // Compute avg check + filter by min visits
    const result_arr: CustomerVisits[] = [];
    for (const c of customerMap.values()) {
      if (c.visitDates.length >= cfg.minVisits) {
        c.avgCheck = c.avgCheck / c.visitDates.length;
        result_arr.push(c);
      }
    }
    return result_arr;
  } catch (err) {
    console.warn('[cadence] fetchCustomerVisits failed', err);
    return [];
  }
};

// ---------------------------------------------------------------------------
// AI enhancement
// ---------------------------------------------------------------------------

const enhanceWithAI = async (
  cadences: VisitCadence[],
  _cfg: CadenceConfig
): Promise<void> => {
  const { callOpenAIChat } = await import('@/lib/openai.service.ts').catch(() => ({} as any));
  if (!callOpenAIChat || cadences.length === 0) return;

  // Only enhance overdue customers (actionable)
  const overdue = cadences.filter(c => c.overdue_status !== 'on_track').slice(0, 15);
  if (overdue.length === 0) return;

  const prompt = `You are a restaurant customer engagement strategist.
For each customer below, provide:
  - insight: max 200 chars — their visit pattern + why they're overdue
  - recommendation: one of send_reminder | loyalty_nudge | win_back_campaign | no_action | schedule_staff

Recommendation guidance:
  - send_reminder: due_soon or slightly overdue regular — gentle "we miss you" message
  - loyalty_nudge: overdue occasional — offer loyalty points bonus to return
  - win_back_campaign: significantly_overdue — aggressive win-back offer (discount/free item)
  - schedule_staff: regular who is due soon — prepare for their return
  - no_action: on_track — don't interrupt natural rhythm

Customers (JSON):
${JSON.stringify(overdue.map(c => ({
  name: c.customer_name,
  total_visits: c.total_visits,
  median_interval: c.median_interval_days.toFixed(1),
  cadence_type: c.cadence_type,
  days_since_last: c.days_since_last_visit,
  overdue_days: c.overdue_days,
  overdue_status: c.overdue_status,
  consistency: c.consistency_score.toFixed(2),
  est_return_prob: c.est_return_probability.toFixed(2),
  est_next_value: c.est_next_visit_value,
})), null, 2)}

Respond with JSON array:
[{
  "name": "<match customer_name>",
  "insight": "<max 200 chars>",
  "recommendation": "send_reminder" | "loyalty_nudge" | "win_back_campaign" | "no_action" | "schedule_staff"
}]`;

  try {
    const response = await callOpenAIChat([
      { role: 'system', content: 'You are a visit cadence AI. Respond only with valid JSON.' },
      { role: 'user', content: prompt },
    ], { temperature: 0.4, maxTokens: 1500 });

    const text = typeof response === 'string' ? response : (response as any)?.content ?? '';
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return;
    const parsed = JSON.parse(jsonMatch[0]) as Array<{
      name: string; insight?: string; recommendation?: CadenceRecommendation;
    }>;
    for (const item of parsed) {
      const cadence = cadences.find(c => c.customer_name === item.name);
      if (cadence) {
        if (item.insight) cadence.ai_insight = item.insight.slice(0, 200);
        if (item.recommendation) cadence.ai_recommendation = item.recommendation;
      }
    }
  } catch (err) { console.warn('[cadence] AI failed', err); }
};

// ---------------------------------------------------------------------------
// Main entry
// ---------------------------------------------------------------------------

export const runCadenceAnalysis = async (
  db: ReturnType<typeof useDB>,
  config: CadenceConfig = DEFAULT_CADENCE_CONFIG,
  onProgress?: (current: number, total: number) => void
): Promise<{ cadences: VisitCadence[]; analyzed: number }> => {
  if (onProgress) onProgress(0, 2);

  // 1. Fetch customer visit data
  const customers = await fetchCustomerVisits(db, config);
  if (onProgress) onProgress(1, 2);

  if (customers.length === 0) {
    if (onProgress) onProgress(2, 2);
    return { cadences: [], analyzed: 0 };
  }

  // 2. Compute cadence for each customer
  const cadences: VisitCadence[] = [];
  const now = new Date();

  for (const c of customers) {
    const visits = c.visitDates.sort((a, b) => a.getTime() - b.getTime());
    const lastVisit = visits[visits.length - 1];
    const daysSinceLast = Math.floor((now.getTime() - lastVisit.getTime()) / (1000 * 60 * 60 * 24));

    // Compute intervals (days between consecutive visits)
    const intervals: number[] = [];
    for (let i = 1; i < visits.length; i++) {
      const intervalDays = (visits[i].getTime() - visits[i - 1].getTime()) / (1000 * 60 * 60 * 24);
      intervals.push(intervalDays);
    }

    const medianInterval = median(intervals);
    const meanInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
    const stddev = stdDev(intervals, meanInterval);

    // Consistency score: lower CV (coefficient of variation) = higher consistency
    const cv = meanInterval > 0 ? stddev / meanInterval : 1;
    const consistencyScore = Math.max(0, Math.min(1, 1 - cv));

    const expectedReturn = new Date(lastVisit.getTime() + medianInterval * 24 * 60 * 60 * 1000);
    const overdueDays = Math.floor((now.getTime() - expectedReturn.getTime()) / (1000 * 60 * 60 * 24));
    const overduePct = medianInterval > 0 ? (overdueDays / medianInterval) * 100 : 0;

    const cadenceType = classifyCadence(medianInterval, config);
    const overdueStatus = classifyOverdue(daysSinceLast, medianInterval, config);

    // Return probability: based on overdue status + consistency
    // Regular customers with high consistency have higher return probability
    let returnProb = 0.5; // base
    if (overdueStatus === 'on_track') returnProb = 0.7;
    else if (overdueStatus === 'due_soon') returnProb = 0.6;
    else if (overdueStatus === 'overdue') returnProb = 0.35;
    else if (overdueStatus === 'significantly_overdue') returnProb = 0.15;
    // Adjust by consistency
    returnProb *= (0.5 + consistencyScore * 0.5);
    // Regular cadence boosts probability
    if (cadenceType === 'regular') returnProb *= 1.2;
    returnProb = Math.max(0, Math.min(1, returnProb));

    const estNextVisitValue = c.avgCheck * returnProb;

    cadences.push({
      customer: c.customerId,
      customer_name: c.customerName,
      total_visits: visits.length,
      median_interval_days: Math.round(medianInterval * 10) / 10,
      mean_interval_days: Math.round(meanInterval * 10) / 10,
      interval_stddev: Math.round(stddev * 10) / 10,
      last_visit_date: lastVisit,
      days_since_last_visit: daysSinceLast,
      expected_return_date: expectedReturn,
      overdue_days: overdueDays,
      overdue_pct: Math.round(overduePct * 10) / 10,
      cadence_type: cadenceType,
      overdue_status: overdueStatus,
      consistency_score: Math.round(consistencyScore * 100) / 100,
      est_return_probability: Math.round(returnProb * 100) / 100,
      est_next_visit_value: Math.round(estNextVisitValue * 100) / 100,
      action_taken: 'none',
      analyzed_at: new Date(),
    });
  }

  // Sort: significantly_overdue first (urgent), then overdue, then due_soon
  const statusOrder = { significantly_overdue: 0, overdue: 1, due_soon: 2, on_track: 3 };
  cadences.sort((a, b) => {
    const orderDiff = (statusOrder[a.overdue_status] ?? 5) - (statusOrder[b.overdue_status] ?? 5);
    if (orderDiff !== 0) return orderDiff;
    return b.overdue_pct - a.overdue_pct;
  });

  // 3. AI enhancement
  if (config.aiEnabled && cadences.length > 0) {
    await enhanceWithAI(cadences, config);
  }

  // 4. Persist (refresh — delete old > 1h, create new)
  try {
    await db.query(`DELETE FROM visit_cadence WHERE analyzed_at < time::now() - 1h`);
  } catch { /* non-fatal */ }
  for (const cadence of cadences) {
    try {
      await db.query(`CREATE visit_cadence CONTENT $data`, {
        data: {
          ...cadence,
          last_visit_date: cadence.last_visit_date.toISOString(),
          expected_return_date: cadence.expected_return_date.toISOString(),
          analyzed_at: cadence.analyzed_at.toISOString(),
        },
      });
    } catch { /* non-fatal */ }
  }

  if (onProgress) onProgress(2, 2);
  return { cadences, analyzed: customers.length };
};

// ---------------------------------------------------------------------------
// Read + summary
// ---------------------------------------------------------------------------

export const getOverdueCustomers = async (
  db: ReturnType<typeof useDB>
): Promise<VisitCadence[]> => {
  try {
    const result = await db.query(
      `SELECT * FROM visit_cadence
       WHERE overdue_status != 'on_track'
         AND action_taken = 'none'
       ORDER BY
         CASE overdue_status WHEN 'significantly_overdue' THEN 0 WHEN 'overdue' THEN 1 WHEN 'due_soon' THEN 2 ELSE 3 END,
         overdue_pct DESC`
    );
    return Array.isArray(result) ? result.flat() : [];
  } catch { return []; }
};

export interface CadenceSummary {
  total: number;
  regular: number;
  occasional: number;
  infrequent: number;
  overdue: number;
  significantlyOverdue: number;
  totalExpectedValue: number;
}

export const getCadenceSummary = async (
  db: ReturnType<typeof useDB>
): Promise<CadenceSummary> => {
  try {
    const result = await db.query(
      `SELECT count() AS total,
         math::count(cadence_type = 'regular') AS regular,
         math::count(cadence_type = 'occasional') AS occasional,
         math::count(cadence_type = 'infrequent') AS infrequent,
         math::count(overdue_status = 'overdue') AS overdue,
         math::count(overdue_status = 'significantly_overdue') AS sig_overdue,
         math::sum(est_next_visit_value) AS total_value
       FROM visit_cadence
       WHERE action_taken = 'none'
       GROUP ALL`
    );
    const rows = Array.isArray(result) ? result.flat() : [];
    const row = rows[0] ?? {};
    return {
      total: safeNumber(row.total, 0),
      regular: safeNumber(row.regular, 0),
      occasional: safeNumber(row.occasional, 0),
      infrequent: safeNumber(row.infrequent, 0),
      overdue: safeNumber(row.overdue, 0),
      significantlyOverdue: safeNumber(row.sig_overdue, 0),
      totalExpectedValue: safeNumber(row.total_value, 0),
    };
  } catch {
    return { total: 0, regular: 0, occasional: 0, infrequent: 0, overdue: 0, significantlyOverdue: 0, totalExpectedValue: 0 };
  }
};

export const updateCadenceAction = async (
  db: ReturnType<typeof useDB>, cadenceId: string, action: string
): Promise<void> => {
  await db.query(`UPDATE $id SET action_taken = $action`, { id: cadenceId, action });
};
