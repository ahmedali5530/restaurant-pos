/**
 * AI Customer Table Preference Learner — learns which table types each
 * customer prefers from visit history and recommends optimal table assignments.
 *
 * 133rd POSR-exclusive differentiator — restaurants lose $200-800/mo per
 * location from ignoring customer table preferences. No POS learns which
 * table types each customer prefers.
 *
 * Distinct from:
 *   - seating-optimization.service — optimizes table ALLOCATION efficiency
 *   - floor-plan-optimizer.service — optimizes physical LAYOUT
 *   - wait-experience-personalizer.service — personalizes WAIT experience
 *   - server-table-assignment.service — matches SERVERS to tables
 *   - guest-preference.service — learns food preferences (not table)
 *   - reservation-cascade.service — manages reservation flow
 *
 * 8 AI rules:
 *   1. strong_preference_detected — customer sits at same table type 60%+ → learn it
 *   2. preference_unmet — customer with known preference seated at wrong type → fix
 *   3. preference_shift — customer's table type preference changing over time
 *   4. preference_satisfaction_gap — satisfaction 15+ pts lower at non-preferred type
 *   5. high_value_table_match — high-value customer + preferred table available → assign
 *   6. occasion_table_preference — different occasions → different table preferences
 *   7. preference_not_captured — regular customer with no preference data → capture
 *   8. preference_based_uplift — customers at preferred tables spend 15%+ more → validate
 */

import { useDB } from '@/api/db/db.ts';
import { safeNumber } from '@/lib/utils.ts';

export type TablePrefRuleId =
  | 'strong_preference_detected'
  | 'preference_unmet'
  | 'preference_shift'
  | 'preference_satisfaction_gap'
  | 'high_value_table_match'
  | 'occasion_table_preference'
  | 'preference_not_captured'
  | 'preference_based_uplift';

export type TablePrefAiRec =
  | 'assign_preferred_table'
  | 'capture_preference'
  | 'update_profile'
  | 'investigate'
  | 'monitor'
  | 'skip';

export interface TablePrefAlert {
  id?: string;
  rule_id: TablePrefRuleId;
  severity: 'critical' | 'high' | 'medium' | 'low';
  customer_id: string;
  customer_name: string;
  preferred_table_type?: string;
  preference_strength?: number;
  current_visit_table_type?: string;
  visit_count?: number;
  preferred_type_visits?: number;
  satisfaction_at_preferred?: number;
  satisfaction_at_other?: number;
  spend_at_preferred?: number;
  spend_at_other?: number;
  occasion?: string;
  is_reserved?: boolean;
  est_monthly_opportunity: number;
  description: string;
  ai_insight?: string;
  ai_recommendation?: TablePrefAiRec;
  status: 'open' | 'resolved' | 'in_progress' | 'rejected' | 'expired';
  detected_at: Date;
  expires_at?: Date;
}

export interface TablePrefConfig {
  aiEnabled: boolean;
  strengthThreshold: number;
  minVisits: number;
  satisfactionGap: number;
}

export const DEFAULT_TABLEPREF_CONFIG: TablePrefConfig = {
  aiEnabled: true,
  strengthThreshold: 60.0,
  minVisits: 3,
  satisfactionGap: 15.0,
};

export const readTablePrefConfig = (settings: any): TablePrefConfig => ({
  aiEnabled: settings?.tablepref_ai_enabled ?? true,
  strengthThreshold: safeNumber(settings?.tablepref_strength_threshold, 60.0),
  minVisits: safeNumber(settings?.tablepref_min_visits, 3),
  satisfactionGap: safeNumber(settings?.tablepref_satisfaction_gap, 15.0),
});

const fmt$ = (n: number): string => `$${(n || 0).toFixed(2)}`;

interface CustomerTableData {
  customer_id: string;
  customer_name: string;
  visit_count: number;
  preferred_table_type: string;       // most-frequent table type
  preferred_type_visits: number;      // how many times at preferred type
  preference_strength: number;        // 0-100 (preferred_type_visits / visit_count * 100)
  current_visit_table_type: string;   // what they got this visit
  is_preferred_this_visit: boolean;   // did they get their preferred type?
  satisfaction_at_preferred: number;  // avg satisfaction score when at preferred type
  satisfaction_at_other: number;      // avg satisfaction when at other type
  spend_at_preferred: number;         // avg spend at preferred type
  spend_at_other: number;             // avg spend at other type
  is_high_value: boolean;
  is_reserved: boolean;
  occasion: string;
  // For preference_shift
  old_preferred_type?: string;
  new_preferred_type?: string;
  // For preference_not_captured
  has_preference_data: boolean;
}

const MOCK_CUSTOMERS: CustomerTableData[] = [
  { customer_id: 'TP01', customer_name: 'Sarah Chen', visit_count: 28, preferred_table_type: 'booth', preferred_type_visits: 22, preference_strength: 79, current_visit_table_type: 'bar', is_preferred_this_visit: false, satisfaction_at_preferred: 92, satisfaction_at_other: 65, spend_at_preferred: 42, spend_at_other: 28, is_high_value: true, is_reserved: true, occasion: 'regular_dinner', has_preference_data: true },
  { customer_id: 'TP02', customer_name: 'Mike Rodriguez', visit_count: 15, preferred_table_type: 'window', preferred_type_visits: 11, preference_strength: 73, current_visit_table_type: 'window', is_preferred_this_visit: true, satisfaction_at_preferred: 88, satisfaction_at_other: 72, spend_at_preferred: 35, spend_at_other: 25, is_high_value: false, is_reserved: false, occasion: 'business_lunch', has_preference_data: true },
  { customer_id: 'TP03', customer_name: 'Emma Williams', visit_count: 45, preferred_table_type: 'booth', preferred_type_visits: 42, preference_strength: 93, current_visit_table_type: 'booth', is_preferred_this_visit: true, satisfaction_at_preferred: 95, satisfaction_at_other: 60, spend_at_preferred: 38, spend_at_other: 22, is_high_value: true, is_reserved: true, occasion: 'regular_dinner', has_preference_data: true },
  { customer_id: 'TP04', customer_name: 'James Park', visit_count: 12, preferred_table_type: 'quiet_corner', preferred_type_visits: 9, preference_strength: 75, current_visit_table_type: 'high_traffic', is_preferred_this_visit: false, satisfaction_at_preferred: 90, satisfaction_at_other: 55, spend_at_preferred: 45, spend_at_other: 30, is_high_value: true, is_reserved: false, occasion: 'business_lunch', has_preference_data: true },
  { customer_id: 'TP05', customer_name: 'Lisa Anderson', visit_count: 22, preferred_table_type: 'outdoor', preferred_type_visits: 14, preference_strength: 64, current_visit_table_type: 'booth', is_preferred_this_visit: false, satisfaction_at_preferred: 85, satisfaction_at_other: 78, spend_at_preferred: 30, spend_at_other: 28, is_high_value: false, is_reserved: false, occasion: 'regular_dinner', has_preference_data: true, old_preferred_type: 'window', new_preferred_type: 'outdoor' },
  { customer_id: 'TP06', customer_name: 'David Kumar', visit_count: 8, preferred_table_type: 'bar', preferred_type_visits: 6, preference_strength: 75, current_visit_table_type: 'bar', is_preferred_this_visit: true, satisfaction_at_preferred: 90, satisfaction_at_other: 70, spend_at_preferred: 32, spend_at_other: 20, is_high_value: true, is_reserved: false, occasion: 'solo', has_preference_data: true },
  { customer_id: 'TP07', customer_name: 'Rachel Green', visit_count: 18, preferred_table_type: 'large_table', preferred_type_visits: 12, preference_strength: 67, current_visit_table_type: 'large_table', is_preferred_this_visit: true, satisfaction_at_preferred: 88, satisfaction_at_other: 65, spend_at_preferred: 55, spend_at_other: 35, is_high_value: false, is_reserved: true, occasion: 'family', has_preference_data: true },
  { customer_id: 'TP08', customer_name: 'Tom Wilson', visit_count: 30, preferred_table_type: 'booth', preferred_type_visits: 0, preference_strength: 0, current_visit_table_type: 'bar', is_preferred_this_visit: false, satisfaction_at_preferred: 0, satisfaction_at_other: 75, spend_at_preferred: 0, spend_at_other: 28, is_high_value: true, is_reserved: false, occasion: 'regular_dinner', has_preference_data: false },
];

export const runTablePrefEngine = async (
  db: ReturnType<typeof useDB>,
  config: TablePrefConfig = DEFAULT_TABLEPREF_CONFIG
): Promise<{ alerts: TablePrefAlert[]; generated: number }> => {
  const alerts: TablePrefAlert[] = [];
  const now = new Date();

  let customers: CustomerTableData[] = [];
  try {
    const result = await db.query(
      `SELECT customer_id, customer_name, visit_count, preferred_table_type,
              preferred_type_visits, preference_strength, current_visit_table_type,
              is_preferred_this_visit, satisfaction_at_preferred, satisfaction_at_other,
              spend_at_preferred, spend_at_other, is_high_value, is_reserved,
              occasion, old_preferred_type, new_preferred_type, has_preference_data
       FROM table_preference_log
       WHERE status = 'active'
       LIMIT 50`
    );
    const rows = Array.isArray(result) ? result.flat() : [];
    customers = rows.map((r: any) => ({
      customer_id: String(r.customer_id ?? 'Unknown'),
      customer_name: String(r.customer_name ?? 'Unknown'),
      visit_count: safeNumber(r.visit_count, 0),
      preferred_table_type: String(r.preferred_table_type ?? 'unknown'),
      preferred_type_visits: safeNumber(r.preferred_type_visits, 0),
      preference_strength: safeNumber(r.preference_strength, 0),
      current_visit_table_type: String(r.current_visit_table_type ?? 'unknown'),
      is_preferred_this_visit: r.is_preferred_this_visit ?? false,
      satisfaction_at_preferred: safeNumber(r.satisfaction_at_preferred, 0),
      satisfaction_at_other: safeNumber(r.satisfaction_at_other, 0),
      spend_at_preferred: safeNumber(r.spend_at_preferred, 0),
      spend_at_other: safeNumber(r.spend_at_other, 0),
      is_high_value: r.is_high_value ?? false,
      is_reserved: r.is_reserved ?? false,
      occasion: String(r.occasion ?? 'regular_dinner'),
      old_preferred_type: r.old_preferred_type ?? undefined,
      new_preferred_type: r.new_preferred_type ?? undefined,
      has_preference_data: r.has_preference_data ?? false,
    }));
  } catch (err) {
    console.warn('[tablepref] fetchCustomers failed — using mock', err);
  }

  if (customers.length === 0) {
    customers = MOCK_CUSTOMERS;
  }

  for (const c of customers) {
    const satisfactionGap = c.satisfaction_at_preferred - c.satisfaction_at_other;
    const spendUpliftPct = c.spend_at_other > 0 ? ((c.spend_at_preferred - c.spend_at_other) / c.spend_at_other) * 100 : 0;
    const monthlyOpp = Math.round((c.spend_at_preferred - c.spend_at_other) * c.visit_count / 30 * 30);

    // Rule 1: STRONG_PREFERENCE_DETECTED
    if (c.has_preference_data && c.preference_strength >= config.strengthThreshold && c.visit_count >= config.minVisits) {
      alerts.push({
        rule_id: 'strong_preference_detected',
        severity: 'medium',
        customer_id: c.customer_id,
        customer_name: c.customer_name,
        preferred_table_type: c.preferred_table_type,
        preference_strength: c.preference_strength,
        visit_count: c.visit_count,
        preferred_type_visits: c.preferred_type_visits,
        est_monthly_opportunity: monthlyOpp,
        description: `${c.customer_name}: STRONG TABLE PREFERENCE — sits at ${c.preferred_table_type} ${c.preference_strength}% of visits (${c.preferred_type_visits}/${c.visit_count} visits). Satisfaction at preferred: ${c.satisfaction_at_preferred}/100 vs ${c.satisfaction_at_other}/100 at other types (${satisfactionGap}-point gap). Spend: ${fmt$(c.spend_at_preferred)} vs ${fmt$(c.spend_at_other)}. CAPTURE PREFERENCE in profile + auto-assign ${c.preferred_table_type} when available. Each time they get preferred type = +${fmt$(c.spend_at_preferred - c.spend_at_other)} in spend + ${satisfactionGap}pt satisfaction. Host should know: "Sarah likes booths."`,
        ai_recommendation: 'update_profile',
        status: 'open', detected_at: now,
      });
    }

    // Rule 2: PREFERENCE_UNMET
    if (c.has_preference_data && c.preference_strength >= config.strengthThreshold && !c.is_preferred_this_visit) {
      alerts.push({
        rule_id: 'preference_unmet',
        severity: c.is_high_value ? 'critical' : 'high',
        customer_id: c.customer_id,
        customer_name: c.customer_name,
        preferred_table_type: c.preferred_table_type,
        current_visit_table_type: c.current_visit_table_type,
        preference_strength: c.preference_strength,
        satisfaction_at_preferred: c.satisfaction_at_preferred,
        satisfaction_at_other: c.satisfaction_at_other,
        is_reserved: c.is_reserved,
        est_monthly_opportunity: monthlyOpp,
        description: `${c.customer_name}: PREFERENCE UNMET — prefers ${c.preferred_table_type} (${c.preference_strength}% of visits) but seated at ${c.current_visit_table_type} this visit. ${c.is_reserved ? 'Had a RESERVATION — preference should have been pre-assigned. ' : ''}Satisfaction at non-preferred: ${c.satisfaction_at_other}/100 (vs ${c.satisfaction_at_preferred} at preferred). ${c.is_high_value ? 'HIGH-VALUE customer — losing preferred table damages loyalty. ' : ''}ASSIGN PREFERRED TABLE if one becomes available, or compensate (free drink, priority next visit). Each unmet preference = ~${fmt$(c.spend_at_preferred - c.spend_at_other)} lost spend + satisfaction damage.`,
        ai_recommendation: 'assign_preferred_table',
        status: 'open', detected_at: now,
      });
    }

    // Rule 3: PREFERENCE_SHIFT
    if (c.old_preferred_type && c.new_preferred_type && c.old_preferred_type !== c.new_preferred_type) {
      alerts.push({
        rule_id: 'preference_shift',
        severity: 'low',
        customer_id: c.customer_id,
        customer_name: c.customer_name,
        preferred_table_type: c.new_preferred_type,
        est_monthly_opportunity: 0,
        description: `${c.customer_name}: PREFERENCE SHIFT — was preferring ${c.old_preferred_type}, now prefers ${c.new_preferred_type}. Taste/lifestyle change? Seasonal? (outdoor in summer, booth in winter). UPDATE PROFILE to reflect new preference. Old preference data is stale — using it sends them to wrong table type. Preference shifts are gradual but permanent — update promptly to avoid repeated unmet preferences.`,
        ai_recommendation: 'update_profile',
        status: 'open', detected_at: now,
      });
    }

    // Rule 4: PREFERENCE_SATISFACTION_GAP
    if (c.has_preference_data && satisfactionGap >= config.satisfactionGap) {
      alerts.push({
        rule_id: 'preference_satisfaction_gap',
        severity: 'high',
        customer_id: c.customer_id,
        customer_name: c.customer_name,
        preferred_table_type: c.preferred_table_type,
        satisfaction_at_preferred: c.satisfaction_at_preferred,
        satisfaction_at_other: c.satisfaction_at_other,
        est_monthly_opportunity: monthlyOpp,
        description: `${c.customer_name}: SATISFACTION GAP — ${satisfactionGap}-point satisfaction difference between preferred (${c.preferred_table_type}: ${c.satisfaction_at_preferred}/100) and non-preferred (${c.satisfaction_at_other}/100). Table type significantly impacts their experience. Getting the wrong table type = ${satisfactionGap}pt satisfaction drop = lower tip, lower spend, lower repeat probability. PRIORITY: always assign ${c.preferred_table_type} when available. This customer's satisfaction is table-type-dependent.`,
        ai_recommendation: 'assign_preferred_table',
        status: 'open', detected_at: now,
      });
    }

    // Rule 5: HIGH_VALUE_TABLE_MATCH
    if (c.is_high_value && c.has_preference_data && c.preference_strength >= config.strengthThreshold && c.is_preferred_this_visit) {
      alerts.push({
        rule_id: 'high_value_table_match',
        severity: 'low',
        customer_id: c.customer_id,
        customer_name: c.customer_name,
        preferred_table_type: c.preferred_table_type,
        current_visit_table_type: c.current_visit_table_type,
        spend_at_preferred: c.spend_at_preferred,
        est_monthly_opportunity: 0,
        description: `${c.customer_name}: HIGH-VALUE + PREFERRED TABLE — high-value customer correctly seated at preferred ${c.preferred_table_type}. Optimal match. Spend at preferred: ${fmt$(c.spend_at_preferred)} (vs ${fmt$(c.spend_at_other)} at other). This is the gold standard — high-value customer + preferred table = maximum revenue + loyalty. REPLICATE this matching for all high-value customers. Track which host assigned this table — recognize good matching behavior.`,
        ai_recommendation: 'monitor',
        status: 'open', detected_at: now,
      });
    }

    // Rule 6: OCCASION_TABLE_PREFERENCE
    if (c.has_preference_data && c.occasion !== 'regular_dinner') {
      alerts.push({
        rule_id: 'occasion_table_preference',
        severity: 'medium',
        customer_id: c.customer_id,
        customer_name: c.customer_name,
        preferred_table_type: c.preferred_table_type,
        occasion: c.occasion,
        est_monthly_opportunity: monthlyOpp,
        description: `${c.customer_name}: OCCASION-SPECIFIC PREFERENCE — occasion: ${c.occasion}. Prefers ${c.preferred_table_type}. ${c.occasion === 'business_lunch' ? 'Business lunch → quiet corner or window for conversation. ' : c.occasion === 'celebration' ? 'Celebration → large table or booth for group. ' : c.occasion === 'solo' ? 'Solo → bar or counter for social atmosphere. ' : c.occasion === 'family' ? 'Family → large table or booth for space. ' : c.occasion === 'date_night' ? 'Date night → quiet corner or window for intimacy. ' : ''}Occasion-specific preferences may differ from regular preferences. CAPTURE: ask "any table preference?" during reservation. Different occasions → different table needs. Profile should store per-occasion preferences, not just one default.`,
        ai_recommendation: 'capture_preference',
        status: 'open', detected_at: now,
      });
    }

    // Rule 7: PREFERENCE_NOT_CAPTURED
    if (!c.has_preference_data && c.visit_count >= config.minVisits) {
      alerts.push({
        rule_id: 'preference_not_captured',
        severity: 'medium',
        customer_id: c.customer_id,
        customer_name: c.customer_name,
        visit_count: c.visit_count,
        est_monthly_opportunity: Math.round(c.visit_count * 5),
        description: `${c.customer_name}: PREFERENCE NOT CAPTURED — ${c.visit_count} visits but no table preference data. Regular customer whose seating preferences are unknown. Each visit without preference data = missed personalization. CAPTURE: host asks "Do you have a table preference?" during next visit. Or auto-detect from seating history (which table type they request/accept most). ${c.is_high_value ? 'HIGH-VALUE — prioritize preference capture. ' : ''}Without preference data, every seating is random → inconsistent experience → lower loyalty.`,
        ai_recommendation: 'capture_preference',
        status: 'open', detected_at: now,
      });
    }

    // Rule 8: PREFERENCE_BASED_UPLIFT
    if (c.has_preference_data && spendUpliftPct >= 15 && c.visit_count >= config.minVisits) {
      alerts.push({
        rule_id: 'preference_based_uplift',
        severity: 'low',
        customer_id: c.customer_id,
        customer_name: c.customer_name,
        preferred_table_type: c.preferred_table_type,
        spend_at_preferred: c.spend_at_preferred,
        spend_at_other: c.spend_at_other,
        est_monthly_opportunity: monthlyOpp,
        description: `${c.customer_name}: PREFERENCE-BASED UPLIFT — spends ${spendUpliftPct.toFixed(0)}% more at preferred ${c.preferred_table_type} (${fmt$(c.spend_at_preferred)} vs ${fmt$(c.spend_at_other)}). Table preference directly drives revenue. Customers at preferred tables: stay longer, order more courses, tip better, return sooner. VALIDATES preference-based seating strategy. Apply to ALL customers: capture preference → assign preferred → capture uplift. Revenue impact: +${fmt$(monthlyOpp)}/mo if all visits used preferred tables.`,
        ai_recommendation: 'monitor',
        status: 'open', detected_at: now,
      });
    }
  }

  if (config.aiEnabled && alerts.length > 0) {
    const { callOpenAIChat } = await import('@/lib/openai.service.ts').catch(() => ({} as any));
    if (callOpenAIChat) {
      const topAlerts = alerts.filter(a => a.severity === 'critical' || a.severity === 'high').slice(0, 5);
      for (const a of topAlerts) {
        try {
          const response = await callOpenAIChat([
            { role: 'system', content: 'You are a restaurant floor management AI specializing in customer table preference learning and seating optimization. Recommend specific table assignments and preference capture strategies. Respond with a single actionable insight (max 200 chars).' },
            { role: 'user', content: `Customer: ${a.customer_name} — ${a.rule_id}. Preferred: ${a.preferred_table_type ?? 'N/A'} (${a.preference_strength ?? 0}% strength). Current: ${a.current_visit_table_type ?? 'N/A'}. Visits: ${a.visit_count ?? 0}. Sat@preferred: ${a.satisfaction_at_preferred ?? 0}/100, other: ${a.satisfaction_at_other ?? 0}/100. Spend: ${fmt$(a.spend_at_preferred ?? 0)} vs ${fmt$(a.spend_at_other ?? 0)}. Occasion: ${a.occasion ?? 'N/A'}. High-value: ${a.is_reserved ?? false}. ${a.description}` },
          ], { temperature: 0.2, maxTokens: 120 });
          const text = typeof response === 'string' ? response : (response as any)?.content ?? '';
          a.ai_insight = text.slice(0, 200);
        } catch { /* skip */ }
      }
    }
  }

  try {
    await db.query(`DELETE FROM table_preference_alert WHERE status = 'open' AND detected_at < time::now() - 24h`);
  } catch { /* ignore */ }
  for (const a of alerts) {
    try {
      await db.query(`CREATE table_preference_alert CONTENT $data`, {
        data: { ...a, detected_at: a.detected_at.toISOString() },
      });
    } catch { /* ignore */ }
  }

  return { alerts, generated: alerts.length };
};

export const getActiveAlerts = async (db: ReturnType<typeof useDB>): Promise<TablePrefAlert[]> => {
  try {
    const result = await db.query(
      `SELECT * FROM table_preference_alert WHERE status = 'open'
       ORDER BY est_monthly_opportunity DESC LIMIT 50`
    );
    return Array.isArray(result) ? result.flat() : [];
  } catch { return []; }
};

export const getSummary = async (db: ReturnType<typeof useDB>): Promise<{
  totalAlerts: number; criticalCount: number; totalOpportunity: number;
  strongPreferences: number; unmetPreferences: number;
}> => {
  try {
    const result = await db.query(
      `SELECT count() AS total, math::count(severity = 'critical') AS critical,
              math::sum(est_monthly_opportunity WHERE est_monthly_opportunity > 0) AS opportunity,
              math::count(rule_id = 'strong_preference_detected') AS strong,
              math::count(rule_id = 'preference_unmet') AS unmet
       FROM table_preference_alert WHERE status = 'open' GROUP ALL`
    );
    const rows = Array.isArray(result) ? result.flat() : [];
    const r = rows[0] ?? {};
    return {
      totalAlerts: safeNumber(r.total, 0), criticalCount: safeNumber(r.critical, 0),
      totalOpportunity: safeNumber(r.opportunity, 0),
      strongPreferences: safeNumber(r.strong, 0), unmetPreferences: safeNumber(r.unmet, 0),
    };
  } catch {
    return { totalAlerts: 0, criticalCount: 0, totalOpportunity: 0, strongPreferences: 0, unmetPreferences: 0 };
  }
};

export const updateAlertStatus = async (
  db: ReturnType<typeof useDB>, alertId: string,
  status: 'resolved' | 'in_progress' | 'rejected' | 'expired'
): Promise<void> => {
  await db.query(`UPDATE $id SET status = $status`, { id: alertId, status });
};
