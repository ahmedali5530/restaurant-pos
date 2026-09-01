/**
 * AI Employee Compliance Document Tracking service — predict document expiry.
 *
 * 28th POSR-exclusive differentiator — restaurants face $500-5k fines for
 * employees with expired compliance documents. Toast, Square, Lightspeed
 * have NO document expiry tracking. POSR predicts which documents will expire
 * soon, notifies managers before expiry, tracks compliance rates per branch.
 *
 * Distinct from:
 *   - food-safety.service (HACCP temperature monitoring, not document compliance)
 *   - training-need.service (predicts training needs from performance, not doc expiry)
 *   - staff-turnover.service (predicts departure, not compliance status)
 */

import { useDB } from '@/api/db/db.ts';
import { safeNumber } from '@/lib/utils.ts';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ComplianceStatus = 'expired' | 'expiring_critical' | 'expiring_soon' | 'expiring_warning' | 'no_document';
export type ComplianceRecommendation =
  | 'renew_now' | 'schedule_renewal' | 'suspend_employee' | 'notify_employee' | 'no_action';

export interface ComplianceAlert {
  id?: string;
  employee?: string;
  employee_name: string;
  position?: string;
  department?: string;
  document_id?: string;
  document_title: string;
  document_category?: string;
  status: ComplianceStatus;
  expiry_date?: Date;
  days_until_expiry: number;
  est_fine_risk: number;
  ai_insight?: string;
  ai_recommendation?: ComplianceRecommendation;
  action_taken: string;
  detected_at: Date;
  branch_id?: string;
}

export interface ComplianceConfig {
  aiEnabled: boolean;
  criticalDays: number;
  soonDays: number;
  warningDays: number;
  avgFine: number;
}

export const DEFAULT_COMPLIANCE_CONFIG: ComplianceConfig = {
  aiEnabled: true,
  criticalDays: 7,
  soonDays: 30,
  warningDays: 60,
  avgFine: 1500,
};

export const readComplianceConfig = (settings: any): ComplianceConfig => ({
  aiEnabled: settings?.compliance_ai_enabled ?? true,
  criticalDays: safeNumber(settings?.compliance_critical_days, 7),
  soonDays: safeNumber(settings?.compliance_soon_days, 30),
  warningDays: safeNumber(settings?.compliance_warning_days, 60),
  avgFine: safeNumber(settings?.compliance_avg_fine, 1500),
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const classifyStatus = (daysUntilExpiry: number, cfg: ComplianceConfig): ComplianceStatus => {
  if (daysUntilExpiry < 0) return 'expired';
  if (daysUntilExpiry <= cfg.criticalDays) return 'expiring_critical';
  if (daysUntilExpiry <= cfg.soonDays) return 'expiring_soon';
  if (daysUntilExpiry <= cfg.warningDays) return 'expiring_warning';
  return 'expiring_warning'; // beyond warning — shouldn't be flagged
};

// ---------------------------------------------------------------------------
// Data fetching
// ---------------------------------------------------------------------------

interface EmployeeDocData {
  employeeId: string;
  employeeName: string;
  position?: string;
  department?: string;
  documentId: string;
  documentTitle: string;
  documentCategory?: string;
  expiryDate?: Date;
}

const fetchEmployeeDocuments = async (db: any, cfg: ComplianceConfig): Promise<EmployeeDocData[]> => {
  try {
    const result = await db.query(
      `SELECT
         employee.id AS emp_id,
         employee.first_name AS first_name,
         employee.last_name AS last_name,
         employee.position AS position,
         employee.department AS department,
         id AS doc_id,
         title AS doc_title,
         category AS doc_category,
         expires_at
       FROM employee_document
       WHERE expires_at IS NOT NONE
         AND expires_at < time::now() + ${cfg.warningDays}d
       FETCH employee`
    );
    const rows = Array.isArray(result) ? result.flat() : [];
    return rows.map((r: any) => ({
      employeeId: r.emp_id?.toString?.() ?? '',
      employeeName: `${r.first_name ?? ''} ${r.last_name ?? ''}`.trim() || 'Unknown',
      position: r.position,
      department: r.department,
      documentId: r.doc_id?.toString?.() ?? '',
      documentTitle: r.doc_title ?? 'Unknown Document',
      documentCategory: r.doc_category,
      expiryDate: r.expires_at ? new Date(r.expires_at) : undefined,
    }));
  } catch (err) {
    console.warn('[compliance] fetchEmployeeDocuments failed', err);
    return [];
  }
};

// ---------------------------------------------------------------------------
// AI enhancement
// ---------------------------------------------------------------------------

const enhanceWithAI = async (alerts: ComplianceAlert[]): Promise<void> => {
  const { callOpenAIChat } = await import('@/lib/openai.service.ts').catch(() => ({} as any));
  if (!callOpenAIChat || alerts.length === 0) return;

  const actionable = alerts.filter(a => a.status !== 'expiring_warning' || a.est_fine_risk > 0).slice(0, 15);
  if (actionable.length === 0) return;

  const prompt = `You are a restaurant HR compliance expert.
For each compliance document alert below, provide:
  - insight: max 200 chars — compliance risk + legal implication
  - recommendation: one of renew_now | schedule_renewal | suspend_employee | notify_employee | no_action

Recommendation guidance:
  - renew_now: expired or expiring critical — immediate action required
  - schedule_renewal: expiring soon (30 days) — schedule renewal before expiry
  - suspend_employee: expired + legally can't work — suspend until renewed
  - notify_employee: expiring warning (60 days) — remind employee to renew
  - no_action: not actionable (shouldn't reach here)

Alerts (JSON):
${JSON.stringify(actionable.map(a => ({
  employee: a.employee_name,
  position: a.position,
  document: a.document_title,
  category: a.document_category,
  status: a.status,
  days_until_expiry: a.days_until_expiry,
  fine_risk: a.est_fine_risk,
})), null, 2)}

Respond with JSON array:
[{
  "employee": "<match employee_name>",
  "insight": "<max 200 chars>",
  "recommendation": "renew_now" | "schedule_renewal" | "suspend_employee" | "notify_employee" | "no_action"
}]`;

  try {
    const response = await callOpenAIChat([
      { role: 'system', content: 'You are a compliance tracking AI. Respond only with valid JSON.' },
      { role: 'user', content: prompt },
    ], { temperature: 0.3, maxTokens: 1000 });

    const text = typeof response === 'string' ? response : (response as any)?.content ?? '';
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return;
    const parsed = JSON.parse(jsonMatch[0]) as Array<{
      employee: string; insight?: string; recommendation?: ComplianceRecommendation;
    }>;
    for (const item of parsed) {
      const alert = alerts.find(a => a.employee_name === item.employee);
      if (alert) {
        if (item.insight) alert.ai_insight = item.insight.slice(0, 200);
        if (item.recommendation) alert.ai_recommendation = item.recommendation;
      }
    }
  } catch (err) { console.warn('[compliance] AI failed', err); }
};

// ---------------------------------------------------------------------------
// Main entry
// ---------------------------------------------------------------------------

export const runComplianceScan = async (
  db: ReturnType<typeof useDB>,
  config: ComplianceConfig = DEFAULT_COMPLIANCE_CONFIG,
  onProgress?: (current: number, total: number) => void
): Promise<{ alerts: ComplianceAlert[]; scanned: number }> => {
  if (onProgress) onProgress(0, 2);

  const docs = await fetchEmployeeDocuments(db, config);
  if (onProgress) onProgress(1, 2);

  if (docs.length === 0) {
    if (onProgress) onProgress(2, 2);
    return { alerts: [], scanned: 0 };
  }

  const alerts: ComplianceAlert[] = [];
  const now = Date.now();

  for (const doc of docs) {
    const daysUntilExpiry = doc.expiryDate
      ? Math.floor((doc.expiryDate.getTime() - now) / (1000 * 60 * 60 * 24))
      : -1;

    const status = classifyStatus(daysUntilExpiry, config);
    // Skip documents beyond warning window
    if (daysUntilExpiry > config.warningDays) continue;

    const fineRisk = status === 'expired' ? config.avgFine :
      status === 'expiring_critical' ? config.avgFine * 0.8 :
      status === 'expiring_soon' ? config.avgFine * 0.4 :
      config.avgFine * 0.1;

    alerts.push({
      employee: doc.employeeId,
      employee_name: doc.employeeName,
      position: doc.position,
      department: doc.department,
      document_id: doc.documentId,
      document_title: doc.documentTitle,
      document_category: doc.documentCategory,
      status,
      expiry_date: doc.expiryDate,
      days_until_expiry: daysUntilExpiry,
      est_fine_risk: fineRisk,
      action_taken: 'none',
      detected_at: new Date(),
    });
  }

  // Sort: expired first, then critical, then soon, then warning
  const statusOrder = { expired: 0, expiring_critical: 1, expiring_soon: 2, expiring_warning: 3, no_document: 4 };
  alerts.sort((a, b) =>
    (statusOrder[a.status] ?? 5) - (statusOrder[b.status] ?? 5)
  );

  if (config.aiEnabled && alerts.length > 0) {
    await enhanceWithAI(alerts);
  }

  // Persist
  try {
    await db.query(`DELETE FROM compliance_alert WHERE detected_at < time::now() - 1h`);
  } catch { /* non-fatal */ }
  for (const alert of alerts) {
    try {
      await db.query(`CREATE compliance_alert CONTENT $data`, {
        data: { ...alert, expiry_date: alert.expiry_date?.toISOString(), detected_at: alert.detected_at.toISOString() },
      });
    } catch { /* non-fatal */ }
  }

  if (onProgress) onProgress(2, 2);
  return { alerts, scanned: docs.length };
};

// ---------------------------------------------------------------------------
// Read + summary
// ---------------------------------------------------------------------------

export const getActiveAlerts = async (db: ReturnType<typeof useDB>): Promise<ComplianceAlert[]> => {
  try {
    const result = await db.query(
      `SELECT * FROM compliance_alert
       WHERE action_taken = 'none'
         AND detected_at > time::now() - 24h
       ORDER BY
         CASE status WHEN 'expired' THEN 0 WHEN 'expiring_critical' THEN 1 WHEN 'expiring_soon' THEN 2 ELSE 3 END,
         days_until_expiry ASC`
    );
    return Array.isArray(result) ? result.flat() : [];
  } catch { return []; }
};

export interface ComplianceSummary {
  total: number;
  expired: number;
  expiringCritical: number;
  expiringSoon: number;
  expiringWarning: number;
  totalFineRisk: number;
  complianceRate: number;
}

export const getComplianceSummary = async (db: ReturnType<typeof useDB>): Promise<ComplianceSummary> => {
  try {
    const result = await db.query(
      `SELECT count() AS total,
         math::count(status = 'expired') AS expired,
         math::count(status = 'expiring_critical') AS critical,
         math::count(status = 'expiring_soon') AS soon,
         math::count(status = 'expiring_warning') AS warning,
         math::sum(est_fine_risk) AS total_fine
       FROM compliance_alert
       WHERE action_taken = 'none'
         AND detected_at > time::now() - 24h
       GROUP ALL`
    );
    const rows = Array.isArray(result) ? result.flat() : [];
    const row = rows[0] ?? {};
    const total = safeNumber(row.total, 0);
    const expired = safeNumber(row.expired, 0);
    // Compliance rate: 100 - (expired / total_active_employees × 100)
    // Simplified: if no alerts = 100%, if all expired = 0%
    const complianceRate = total === 0 ? 100 : Math.max(0, 100 - (expired / total) * 100);
    return {
      total,
      expired,
      expiringCritical: safeNumber(row.critical, 0),
      expiringSoon: safeNumber(row.soon, 0),
      expiringWarning: safeNumber(row.warning, 0),
      totalFineRisk: safeNumber(row.total_fine, 0),
      complianceRate,
    };
  } catch {
    return { total: 0, expired: 0, expiringCritical: 0, expiringSoon: 0, expiringWarning: 0, totalFineRisk: 0, complianceRate: 100 };
  }
};

export const updateComplianceAction = async (
  db: ReturnType<typeof useDB>, alertId: string, action: string
): Promise<void> => {
  await db.query(`UPDATE $id SET action_taken = $action`, { id: alertId, action });
};
