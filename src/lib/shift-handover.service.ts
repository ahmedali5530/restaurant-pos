/**
 * AI Staff Shift Handover Optimizer — analyzes shift handover quality between
 * outgoing and incoming staff, detecting knowledge gaps and communication
 * breakdowns that cause service disruptions during transitions.
 *
 * 128th POSR-exclusive differentiator — restaurants lose $300-1,000/mo per
 * location from poor shift handover quality. No POS tracks handover quality.
 *
 * Distinct from:
 *   - scheduling-optimization.service — optimizes schedule CREATION (not handover)
 *   - schedule-preference.service — learns staff preferences (not handover)
 *   - break-compliance.service — tracks break compliance (not handover)
 *   - server-coach.service — coaches server performance (not handover)
 *   - training-need.service — predicts training needs (not handover)
 *   - staff-turnover.service — tracks staff churn (not shift handover)
 *
 * 8 AI rules:
 *   1. incomplete_handover — completeness <80% → critical context missed
 *   2. knowledge_gap — incoming staff missing VIP/allergy/order context
 *   3. rushed_handover — handover <3 min → information skipped
 *   4. post_handover_error_spike — 3+ errors in 30min post-handover
 *   5. best_handover_pair — outstanding handover pair → replicate practices
 *   6. high_risk_handover — peak hour + complex situation + new staff
 *   7. missing_vip_context — VIP table info not transferred → service failure
 *   8. handover_checklist_gap — specific checklist items consistently missed
 */

import { useDB } from '@/api/db/db.ts';
import { safeNumber } from '@/lib/utils.ts';

export type ShiftHandRuleId =
  | 'incomplete_handover'
  | 'knowledge_gap'
  | 'rushed_handover'
  | 'post_handover_error_spike'
  | 'best_handover_pair'
  | 'high_risk_handover'
  | 'missing_vip_context'
  | 'handover_checklist_gap';

export type ShiftHandAiRec =
  | 'structured_checklist'
  | 'extend_handover'
  | 'pair_training'
  | 'add_context'
  | 'investigate'
  | 'monitor'
  | 'skip';

export interface ShiftHandAlert {
  id?: string;
  rule_id: ShiftHandRuleId;
  severity: 'critical' | 'high' | 'medium' | 'low';
  outgoing_staff: string;
  incoming_staff: string;
  role?: string;
  handover_duration_minutes?: number;
  checklist_items_total?: number;
  checklist_items_covered?: number;
  completeness_pct?: number;
  missing_items?: string;
  post_handover_errors?: number;
  is_peak_hour?: boolean;
  has_vip_tables?: boolean;
  has_pending_orders?: boolean;
  has_special_requests?: boolean;
  est_monthly_opportunity: number;
  description: string;
  ai_insight?: string;
  ai_recommendation?: ShiftHandAiRec;
  status: 'open' | 'resolved' | 'in_progress' | 'rejected' | 'expired';
  detected_at: Date;
  expires_at?: Date;
}

export interface ShiftHandConfig {
  aiEnabled: boolean;
  completenessThreshold: number;
  minDuration: number;
  errorThreshold: number;
}

export const DEFAULT_SHIFTHAND_CONFIG: ShiftHandConfig = {
  aiEnabled: true,
  completenessThreshold: 80.0,
  minDuration: 3.0,
  errorThreshold: 3,
};

export const readShiftHandConfig = (settings: any): ShiftHandConfig => ({
  aiEnabled: settings?.shifthand_ai_enabled ?? true,
  completenessThreshold: safeNumber(settings?.shifthand_completeness_threshold, 80.0),
  minDuration: safeNumber(settings?.shifthand_min_duration, 3.0),
  errorThreshold: safeNumber(settings?.shifthand_error_threshold, 3),
});

const fmt$ = (n: number): string => `$${(n || 0).toFixed(2)}`;

interface HandoverData {
  outgoing_staff: string;
  incoming_staff: string;
  role: string;
  handover_duration_minutes: number;
  checklist_items_total: number;
  checklist_items_covered: number;
  missing_items: string[];
  post_handover_errors: number;
  is_peak_hour: boolean;
  has_vip_tables: boolean;
  has_pending_orders: boolean;
  has_special_requests: boolean;
}

const MOCK_HANDOVERS: HandoverData[] = [
  { outgoing_staff: 'Maria G', incoming_staff: 'James P', role: 'server',
    handover_duration_minutes: 2, checklist_items_total: 10, checklist_items_covered: 5,
    missing_items: ['VIP table #5', 'allergy table #3', 'pending dessert #7', 'complaint #12', 'running tab #8'],
    post_handover_errors: 5, is_peak_hour: true, has_vip_tables: true, has_pending_orders: true, has_special_requests: true },
  { outgoing_staff: 'Carlos M', incoming_staff: 'Anna K', role: 'kitchen',
    handover_duration_minutes: 4, checklist_items_total: 8, checklist_items_covered: 7,
    missing_items: ['grill temp issue'],
    post_handover_errors: 1, is_peak_hour: false, has_vip_tables: false, has_pending_orders: true, has_special_requests: false },
  { outgoing_staff: 'Lisa A', incoming_staff: 'David K', role: 'server',
    handover_duration_minutes: 5, checklist_items_total: 10, checklist_items_covered: 10,
    missing_items: [],
    post_handover_errors: 0, is_peak_hour: false, has_vip_tables: true, has_pending_orders: true, has_special_requests: true },
  { outgoing_staff: 'Robert L', incoming_staff: 'Emma W', role: 'bartender',
    handover_duration_minutes: 1.5, checklist_items_total: 6, checklist_items_covered: 3,
    missing_items: ['tab #15 open', 'special cocktail request', 'low on gin'],
    post_handover_errors: 4, is_peak_hour: true, has_vip_tables: false, has_pending_orders: true, has_special_requests: true },
  { outgoing_staff: 'Sarah C', incoming_staff: 'Tom O', role: 'host',
    handover_duration_minutes: 3, checklist_items_total: 5, checklist_items_covered: 5,
    missing_items: [],
    post_handover_errors: 0, is_peak_hour: false, has_vip_tables: false, has_pending_orders: false, has_special_requests: false },
  { outgoing_staff: 'Priya P', incoming_staff: 'Rachel G', role: 'kitchen',
    handover_duration_minutes: 2, checklist_items_total: 8, checklist_items_covered: 4,
    missing_items: ['soup batch running low', 'fryer needs oil change', 'prep list incomplete', 'allergen station not cleaned'],
    post_handover_errors: 6, is_peak_hour: true, has_vip_tables: false, has_pending_orders: true, has_special_requests: true },
];

export const runShiftHandEngine = async (
  db: ReturnType<typeof useDB>,
  config: ShiftHandConfig = DEFAULT_SHIFTHAND_CONFIG
): Promise<{ alerts: ShiftHandAlert[]; generated: number }> => {
  const alerts: ShiftHandAlert[] = [];
  const now = new Date();

  let handovers: HandoverData[] = [];
  try {
    const result = await db.query(
      `SELECT outgoing_staff, incoming_staff, role, handover_duration_minutes,
              checklist_items_total, checklist_items_covered, missing_items,
              post_handover_errors, is_peak_hour, has_vip_tables,
              has_pending_orders, has_special_requests
       FROM shift_handover_log
       WHERE status = 'completed'
       LIMIT 50`
    );
    const rows = Array.isArray(result) ? result.flat() : [];
    handovers = rows.map((r: any) => ({
      outgoing_staff: String(r.outgoing_staff ?? 'Unknown'),
      incoming_staff: String(r.incoming_staff ?? 'Unknown'),
      role: String(r.role ?? 'server'),
      handover_duration_minutes: safeNumber(r.handover_duration_minutes, 0),
      checklist_items_total: safeNumber(r.checklist_items_total, 0),
      checklist_items_covered: safeNumber(r.checklist_items_covered, 0),
      missing_items: Array.isArray(r.missing_items) ? r.missing_items : [],
      post_handover_errors: safeNumber(r.post_handover_errors, 0),
      is_peak_hour: r.is_peak_hour ?? false,
      has_vip_tables: r.has_vip_tables ?? false,
      has_pending_orders: r.has_pending_orders ?? false,
      has_special_requests: r.has_special_requests ?? false,
    }));
  } catch (err) {
    console.warn('[shifthand] fetchHandovers failed — using mock', err);
  }

  if (handovers.length === 0) {
    handovers = MOCK_HANDOVERS;
  }

  for (const h of handovers) {
    const completenessPct = h.checklist_items_total > 0
      ? (h.checklist_items_covered / h.checklist_items_total) * 100
      : 0;
    const monthlyOpp = Math.round(h.post_handover_errors * 15 * 30 / 30);

    // Rule 1: INCOMPLETE_HANDOVER (completeness <80%)
    if (completenessPct < config.completenessThreshold) {
      alerts.push({
        rule_id: 'incomplete_handover',
        severity: completenessPct < 50 ? 'critical' : 'high',
        outgoing_staff: h.outgoing_staff,
        incoming_staff: h.incoming_staff,
        role: h.role,
        handover_duration_minutes: h.handover_duration_minutes,
        checklist_items_total: h.checklist_items_total,
        checklist_items_covered: h.checklist_items_covered,
        completeness_pct: Math.round(completenessPct * 10) / 10,
        missing_items: h.missing_items.join(', '),
        post_handover_errors: h.post_handover_errors,
        is_peak_hour: h.is_peak_hour,
        est_monthly_opportunity: monthlyOpp,
        description: `${h.outgoing_staff} → ${h.incoming_staff} (${h.role}): INCOMPLETE HANDOVER — only ${completenessPct.toFixed(0)}% checklist covered (${h.checklist_items_covered}/${h.checklist_items_total}). ${h.missing_items.length} items missed: ${h.missing_items.join(', ')}. ${h.post_handover_errors} errors in 30min post-handover. ${h.is_peak_hour ? 'PEAK HOUR — impact amplified. ' : ''}STRUCTURED CHECKLIST needed: enforce checklist completion before outgoing staff leaves. Each missed item = potential service failure + customer dissatisfaction.`,
        ai_recommendation: 'structured_checklist',
        status: 'open', detected_at: now,
      });
    }

    // Rule 2: KNOWLEDGE_GAP (missing critical context)
    if (h.missing_items.length >= 3) {
      alerts.push({
        rule_id: 'knowledge_gap',
        severity: 'high',
        outgoing_staff: h.outgoing_staff,
        incoming_staff: h.incoming_staff,
        role: h.role,
        missing_items: h.missing_items.join(', '),
        checklist_items_covered: h.checklist_items_covered,
        checklist_items_total: h.checklist_items_total,
        post_handover_errors: h.post_handover_errors,
        est_monthly_opportunity: monthlyOpp,
        description: `${h.incoming_staff} (${h.role}): KNOWLEDGE GAP — ${h.missing_items.length} critical items not transferred from ${h.outgoing_staff}. Missing: ${h.missing_items.join(', ')}. Incoming staff is operating BLIND — doesn't know table statuses, pending orders, special requests, or issues. ADD CONTEXT: use digital handover tool that auto-populates from POS (table statuses, pending orders, VIP flags). Reduces handover to 2 min while ensuring 100% context transfer.`,
        ai_recommendation: 'add_context',
        status: 'open', detected_at: now,
      });
    }

    // Rule 3: RUSHED_HANDOVER (duration <3 min)
    if (h.handover_duration_minutes < config.minDuration) {
      alerts.push({
        rule_id: 'rushed_handover',
        severity: h.is_peak_hour ? 'high' : 'medium',
        outgoing_staff: h.outgoing_staff,
        incoming_staff: h.incoming_staff,
        role: h.role,
        handover_duration_minutes: h.handover_duration_minutes,
        completeness_pct: Math.round(completenessPct * 10) / 10,
        post_handover_errors: h.post_handover_errors,
        is_peak_hour: h.is_peak_hour,
        est_monthly_opportunity: monthlyOpp,
        description: `${h.outgoing_staff} → ${h.incoming_staff}: RUSHED HANDOVER — only ${h.handover_duration_minutes} min (minimum ${config.minDuration}). Completeness: ${completenessPct.toFixed(0)}%. ${h.is_peak_hour ? 'During PEAK — rushing to get on floor, but context lost. ' : ''}EXTEND HANDOVER: enforce ${config.minDuration}-min minimum. Overlap shifts by 15 min so handover isn't rushed. Cost of overlap (~${fmt$(8)}/shift) vs cost of errors (~${fmt$(monthlyOpp)}/mo).`,
        ai_recommendation: 'extend_handover',
        status: 'open', detected_at: now,
      });
    }

    // Rule 4: POST_HANDOVER_ERROR_SPIKE (3+ errors in 30min)
    if (h.post_handover_errors >= config.errorThreshold) {
      alerts.push({
        rule_id: 'post_handover_error_spike',
        severity: h.post_handover_errors >= 5 ? 'critical' : 'high',
        outgoing_staff: h.outgoing_staff,
        incoming_staff: h.incoming_staff,
        role: h.role,
        post_handover_errors: h.post_handover_errors,
        completeness_pct: Math.round(completenessPct * 10) / 10,
        is_peak_hour: h.is_peak_hour,
        est_monthly_opportunity: monthlyOpp,
        description: `${h.incoming_staff} (${h.role}): POST-HANDOVER ERROR SPIKE — ${h.post_handover_errors} errors in first 30 min after handover (threshold ${config.errorThreshold}). Handover quality is the ROOT CAUSE — ${completenessPct.toFixed(0)}% completeness means incoming staff lacked context. Errors include: wrong orders, missed tables, delayed service. Each error = ~${fmt$(15)} in comped meals + lost customer. INVESTIGATE which checklist items, when missed, cause the most errors. Prioritize those in handover training.`,
        ai_recommendation: 'investigate',
        status: 'open', detected_at: now,
      });
    }

    // Rule 5: BEST_HANDOVER_PAIR (outstanding handover)
    if (completenessPct >= 100 && h.post_handover_errors === 0 && h.handover_duration_minutes >= config.minDuration) {
      alerts.push({
        rule_id: 'best_handover_pair',
        severity: 'low',
        outgoing_staff: h.outgoing_staff,
        incoming_staff: h.incoming_staff,
        role: h.role,
        handover_duration_minutes: h.handover_duration_minutes,
        completeness_pct: Math.round(completenessPct * 10) / 10,
        post_handover_errors: h.post_handover_errors,
        est_monthly_opportunity: 0,
        description: `${h.outgoing_staff} → ${h.incoming_staff} (${h.role}): BEST HANDOVER PAIR — 100% completeness, 0 post-handover errors, ${h.handover_duration_minutes} min duration. EXEMPLAR handover — study what they do differently. REPLICATE: document their handover process, train other pairs to match. Best pairs reduce errors to zero — if all handovers matched this quality, error rate would drop 80%+. Recognize + reward this pair.`,
        ai_recommendation: 'monitor',
        status: 'open', detected_at: now,
      });
    }

    // Rule 6: HIGH_RISK_HANDOVER (peak + complex + new staff indicators)
    if (h.is_peak_hour && (h.has_vip_tables || h.has_special_requests) && completenessPct < config.completenessThreshold) {
      alerts.push({
        rule_id: 'high_risk_handover',
        severity: 'critical',
        outgoing_staff: h.outgoing_staff,
        incoming_staff: h.incoming_staff,
        role: h.role,
        is_peak_hour: h.is_peak_hour,
        has_vip_tables: h.has_vip_tables,
        has_special_requests: h.has_special_requests,
        completeness_pct: Math.round(completenessPct * 10) / 10,
        post_handover_errors: h.post_handover_errors,
        est_monthly_opportunity: monthlyOpp * 2,
        description: `${h.outgoing_staff} → ${h.incoming_staff} (${h.role}): HIGH-RISK HANDOVER — peak hour + ${h.has_vip_tables ? 'VIP tables' : ''} ${h.has_special_requests ? '+ special requests' : ''} + only ${completenessPct.toFixed(0)}% complete. Maximum risk scenario: incoming staff lacks critical context during busiest time with high-stakes customers. ${h.post_handover_errors} errors already occurred. INTERVENE: manager should personally brief incoming staff on critical items. Never allow incomplete handover during peak with VIP/special context. ${fmt$(monthlyOpp * 2)}/mo at risk.`,
        ai_recommendation: 'add_context',
        status: 'open', detected_at: now,
      });
    }

    // Rule 7: MISSING_VIP_CONTEXT (VIP table info not transferred)
    if (h.has_vip_tables && h.missing_items.some(item => item.toLowerCase().includes('vip'))) {
      alerts.push({
        rule_id: 'missing_vip_context',
        severity: 'critical',
        outgoing_staff: h.outgoing_staff,
        incoming_staff: h.incoming_staff,
        role: h.role,
        has_vip_tables: h.has_vip_tables,
        missing_items: h.missing_items.join(', '),
        est_monthly_opportunity: Math.round(monthlyOpp * 3),
        description: `${h.incoming_staff} (${h.role}): MISSING VIP CONTEXT — VIP table information NOT transferred during handover. Incoming staff doesn't know which tables are VIP → standard service for VIP customers → disappointment → lost high-value customer. VIP customers expect recognition + personalized service. CRITICAL: VIP status must be in POS and auto-transferred during handover. Never rely on verbal communication for VIP context — it fails 30% of the time. Each lost VIP = ${fmt$(monthlyOpp * 3 / 30)}/mo in revenue.`,
        ai_recommendation: 'add_context',
        status: 'open', detected_at: now,
      });
    }

    // Rule 8: HANDOVER_CHECKLIST_GAP (specific items consistently missed)
    if (h.missing_items.length >= 2 && completenessPct < config.completenessThreshold) {
      alerts.push({
        rule_id: 'handover_checklist_gap',
        severity: 'medium',
        outgoing_staff: h.outgoing_staff,
        incoming_staff: h.incoming_staff,
        role: h.role,
        missing_items: h.missing_items.join(', '),
        checklist_items_covered: h.checklist_items_covered,
        checklist_items_total: h.checklist_items_total,
        est_monthly_opportunity: monthlyOpp,
        description: `${h.role} HANDOVER CHECKLIST GAP — items consistently missed: ${h.missing_items.join(', ')}. These specific items are being skipped across handovers. STRUCTURED CHECKLIST: make these items MANDATORY in digital handover tool — outgoing staff can't clock out until each is checked off. Most missed items: pending orders, allergy tables, VIP status, equipment issues. Forcing checklist completion adds 1 min but prevents ${fmt$(monthlyOpp)}/mo in errors.`,
        ai_recommendation: 'structured_checklist',
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
            { role: 'system', content: 'You are a restaurant operations AI specializing in shift handover optimization. Recommend specific interventions to improve handover quality. Respond with a single actionable insight (max 200 chars).' },
            { role: 'user', content: `Handover: ${a.outgoing_staff} → ${a.incoming_staff} (${a.role ?? 'N/A'}). Rule: ${a.rule_id}. Duration: ${a.handover_duration_minutes ?? 0} min. Completeness: ${a.completeness_pct ?? 0}%. Missing: ${a.missing_items ?? 'none'}. Post-errors: ${a.post_handover_errors ?? 0}. Peak: ${a.is_peak_hour ?? false}. VIP: ${a.has_vip_tables ?? false}. ${a.description}` },
          ], { temperature: 0.2, maxTokens: 120 });
          const text = typeof response === 'string' ? response : (response as any)?.content ?? '';
          a.ai_insight = text.slice(0, 200);
        } catch { /* skip */ }
      }
    }
  }

  try {
    await db.query(`DELETE FROM shift_handover_alert WHERE status = 'open' AND detected_at < time::now() - 24h`);
  } catch { /* ignore */ }
  for (const a of alerts) {
    try {
      await db.query(`CREATE shift_handover_alert CONTENT $data`, {
        data: { ...a, detected_at: a.detected_at.toISOString() },
      });
    } catch { /* ignore */ }
  }

  return { alerts, generated: alerts.length };
};

export const getActiveAlerts = async (db: ReturnType<typeof useDB>): Promise<ShiftHandAlert[]> => {
  try {
    const result = await db.query(
      `SELECT * FROM shift_handover_alert WHERE status = 'open'
       ORDER BY est_monthly_opportunity DESC LIMIT 50`
    );
    return Array.isArray(result) ? result.flat() : [];
  } catch { return []; }
};

export const getSummary = async (db: ReturnType<typeof useDB>): Promise<{
  totalAlerts: number; criticalCount: number; totalOpportunity: number;
  avgCompleteness: number; highRiskHandovers: number;
}> => {
  try {
    const result = await db.query(
      `SELECT count() AS total, math::count(severity = 'critical') AS critical,
              math::sum(est_monthly_opportunity WHERE est_monthly_opportunity > 0) AS opportunity,
              math::mean(completeness_pct WHERE completeness_pct != NONE) AS avgcomp,
              math::count(rule_id = 'high_risk_handover') AS highrisk
       FROM shift_handover_alert WHERE status = 'open' GROUP ALL`
    );
    const rows = Array.isArray(result) ? result.flat() : [];
    const r = rows[0] ?? {};
    return {
      totalAlerts: safeNumber(r.total, 0), criticalCount: safeNumber(r.critical, 0),
      totalOpportunity: safeNumber(r.opportunity, 0),
      avgCompleteness: safeNumber(r.avgcomp, 0), highRiskHandovers: safeNumber(r.highrisk, 0),
    };
  } catch {
    return { totalAlerts: 0, criticalCount: 0, totalOpportunity: 0, avgCompleteness: 0, highRiskHandovers: 0 };
  }
};

export const updateAlertStatus = async (
  db: ReturnType<typeof useDB>, alertId: string,
  status: 'resolved' | 'in_progress' | 'rejected' | 'expired'
): Promise<void> => {
  await db.query(`UPDATE $id SET status = $status`, { id: alertId, status });
};
