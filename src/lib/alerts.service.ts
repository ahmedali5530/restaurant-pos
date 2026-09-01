/**
 * Security alerts client service.
 *
 * Talks to the gateway's GET /alerts and POST /alerts/:id/acknowledge
 * endpoints (added in security/surreal-rbac branch). The SPA polls these
 * every 30 seconds to surface suspicious activity detected by the anomaly
 * detector.
 *
 * Both endpoints require a session JWT (Authorization: Bearer) — the same
 * token used for /auth/login. Only admin / super_admin roles can read or
 * acknowledge alerts; the gateway enforces this server-side.
 */

import { getGatewayBaseUrl, authHeaders } from "@/lib/session.ts";

// ---------------------------------------------------------------------------
// Types — mirror the security_alerts table schema
// ---------------------------------------------------------------------------

export type AlertSeverity = "info" | "warning" | "critical";
export type AlertStatus = "open" | "acknowledged" | "resolved" | "false_positive";
export type AlertRuleType =
  | "permission_denial_burst"
  | "login_failure_burst"
  | "off_hours_sensitive_access"
  | "audit_log_tampering"
  | "new_oauth_credential"
  | "role_escalation"
  | string;  // allow future rule types

export interface SecurityAlert {
  id: string;
  emitted_at: string;        // ISO datetime
  rule_id?: string;
  rule_name: string;
  rule_type: AlertRuleType;
  severity: AlertSeverity;
  actor_id?: string;
  actor_login?: string;
  actor_roles: string[];
  source_ip?: string;
  count: number;
  details?: Record<string, unknown> & { dedupe_key?: string };
  status: AlertStatus;
  acknowledged_by?: string;
  acknowledged_at?: string;
  resolution_notes?: string;
}

export interface AlertsResponse {
  ok: true;
  alerts: SecurityAlert[];
  count: number;
}

export interface AcknowledgeResponse {
  ok: true;
  id: string;
  status: "acknowledged";
}

// ---------------------------------------------------------------------------
// API functions
// ---------------------------------------------------------------------------

/**
 * Fetch security alerts from the gateway.
 *
 * @param options.status    filter by status (default: 'open')
 * @param options.severity filter by severity (optional)
 * @param options.limit    max results (default: 50, max: 200)
 */
export async function fetchSecurityAlerts(
  options: { status?: AlertStatus; severity?: AlertSeverity; limit?: number } = {}
): Promise<SecurityAlert[]> {
  const { status = "open", severity, limit = 50 } = options;
  const params = new URLSearchParams({ status, limit: String(limit) });
  if (severity) params.set("severity", severity);

  const res = await fetch(`${getGatewayBaseUrl()}/alerts?${params}`, {
    headers: authHeaders(),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Failed to fetch alerts: ${res.status} ${text}`.trim());
  }

  const parsed = (await res.json()) as AlertsResponse;
  return parsed.alerts || [];
}

/**
 * Acknowledge a security alert (admin-only). Marks the alert as reviewed
 * and records who acknowledged it + when + optional resolution notes.
 *
 * @param alertId          the security_alerts record id
 * @param resolutionNotes  optional notes (e.g. "Investigated — false alarm")
 */
export async function acknowledgeSecurityAlert(
  alertId: string,
  resolutionNotes?: string
): Promise<AcknowledgeResponse> {
  if (!alertId) throw new Error("alertId is required");

  const res = await fetch(`${getGatewayBaseUrl()}/alerts/${encodeURIComponent(alertId)}/acknowledge`, {
    method: "POST",
    headers: authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ resolutionNotes: resolutionNotes || null }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Failed to acknowledge alert: ${res.status} ${text}`.trim());
  }

  return res.json();
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export const SEVERITY_ORDER: Record<AlertSeverity, number> = {
  critical: 0,
  warning: 1,
  info: 2,
};

/** Sort alerts by severity (critical first) then by emitted_at (newest first). */
export function sortAlertsBySeverity(alerts: SecurityAlert[]): SecurityAlert[] {
  return [...alerts].sort((a, b) => {
    const sevDiff = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
    if (sevDiff !== 0) return sevDiff;
    return new Date(b.emitted_at).getTime() - new Date(a.emitted_at).getTime();
  });
}

/** Human-readable label for each rule type. */
export const RULE_TYPE_LABELS: Record<string, string> = {
  permission_denial_burst: "Permission Denial Burst",
  login_failure_burst: "Login Failure Burst",
  off_hours_sensitive_access: "Off-Hours Sensitive Access",
  audit_log_tampering: "Audit Log Tampering",
  new_oauth_credential: "New OAuth Credential",
  role_escalation: "Role Escalation",
};

/** Tailwind classes for each severity badge (uses danger / warning / info from tailwind.config.js). */
export const SEVERITY_BADGE_CLASSES: Record<AlertSeverity, string> = {
  critical:
    "bg-danger-100 text-danger-800 border-danger-300 dark:bg-danger-900/40 dark:text-danger-200 dark:border-danger-700",
  warning:
    "bg-warning-100 text-warning-800 border-warning-300 dark:bg-warning-900/40 dark:text-warning-200 dark:border-warning-700",
  info: "bg-info-100 text-info-800 border-info-300 dark:bg-info-900/40 dark:text-info-200 dark:border-info-700",
};
