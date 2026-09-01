/**
 * SecurityAlertsPanel — admin panel that lists open security alerts.
 *
 * Shows alerts sorted by severity (critical first), newest first within
 * severity. Each alert shows:
 *   - Severity badge (critical=red, warning=amber, info=blue)
 *   - Rule name + type
 *   - Actor (login + roles) and/or source IP
 *   - Count (how many events triggered the alert)
 *   - Emitted time (relative)
 *   - Acknowledge button → opens detail modal
 *
 * Used as a tab in the admin screen. Polls every 30s via useSecurityAlerts.
 */

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useSecurityAlerts } from "@/hooks/useSecurityAlerts.ts";
import {
  SEVERITY_BADGE_CLASSES,
  RULE_TYPE_LABELS,
  type SecurityAlert,
  type AlertSeverity,
} from "@/lib/alerts.service.ts";
import { AlertDetailModal } from "./alert-detail.tsx";
import { Button } from "@/components/common/input/button.tsx";
import { getUserModules, moduleMatchCandidates } from "@/lib/access.rules.ts";
import { appPage } from "@/store/jotai.ts";
import { useAtom } from "jotai";

const SECURITY_ALERTS_MODULE = "admin.security_alerts";

export function SecurityAlertsPanel() {
  const { t } = useTranslation(["admin", "common"]);
  const { alerts, criticalCount, warningCount, infoCount, isLoading, error, refresh } = useSecurityAlerts();
  const [selectedAlert, setSelectedAlert] = useState<SecurityAlert | null>(null);
  const [page] = useAtom(appPage);
  const modules = getUserModules(page.user);
  const hasAccess = moduleMatchCandidates(SECURITY_ALERTS_MODULE).some((candidate) =>
    modules.includes(candidate)
  );

  if (!hasAccess) {
    return (
      <div className="p-6 text-center text-neutral-500" data-testid="security-alerts-no-access">
        {t("admin:securityAlerts.noAccess", { defaultValue: "Admin role required to view security alerts." })}
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="p-6 text-center text-neutral-500" data-testid="security-alerts-loading">
        {t("admin:securityAlerts.loading", { defaultValue: "Loading alerts…" })}
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 text-center text-red-600" data-testid="security-alerts-error">
        {t("admin:securityAlerts.error", { defaultValue: "Failed to load alerts" })}: {error.message}
        <div className="mt-2">
          <Button variant="primary" onClick={refresh}>
            {t("common:actions.retry", { defaultValue: "Retry" })}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div data-testid="security-alerts-panel" className="p-4">
      {/* Summary header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex gap-4">
          <SeveritySummary label={t("admin:securityAlerts.critical", { defaultValue: "Critical" })} count={criticalCount} severity="critical" />
          <SeveritySummary label={t("admin:securityAlerts.warning", { defaultValue: "Warning" })} count={warningCount} severity="warning" />
          <SeveritySummary label={t("admin:securityAlerts.info", { defaultValue: "Info" })} count={infoCount} severity="info" />
        </div>
        <Button variant="ghost" onClick={refresh}>
          {t("common:actions.refresh", { defaultValue: "Refresh" })}
        </Button>
      </div>

      {/* Alert list */}
      {alerts.length === 0 ? (
        <div className="p-8 text-center text-neutral-500 border rounded-lg" data-testid="security-alerts-empty">
          <p className="text-lg">{t("admin:securityAlerts.noAlerts", { defaultValue: "No open alerts" })}</p>
          <p className="text-sm mt-1">
            {t("admin:securityAlerts.noAlertsDescription", {
              defaultValue: "The anomaly detector has not flagged any suspicious activity.",
            })}
          </p>
        </div>
      ) : (
        <div className="space-y-2 max-h-[60vh] overflow-y-auto">
          {alerts.map((alert) => (
            <AlertRow key={alert.id} alert={alert} onSelect={() => setSelectedAlert(alert)} />
          ))}
        </div>
      )}

      {/* Detail modal */}
      {selectedAlert && (
        <AlertDetailModal
          alert={selectedAlert}
          onClose={() => setSelectedAlert(null)}
        />
      )}
    </div>
  );
}

function SeveritySummary({ label, count, severity }: { label: string; count: number; severity: AlertSeverity }) {
  return (
    <div className="flex items-center gap-2">
      <span className={`px-2 py-1 rounded text-xs font-medium border ${SEVERITY_BADGE_CLASSES[severity]}`}>
        {count}
      </span>
      <span className="text-sm text-neutral-600 dark:text-neutral-400">{label}</span>
    </div>
  );
}

function AlertRow({ alert, onSelect }: { alert: SecurityAlert; onSelect: () => void }) {
  const { t } = useTranslation(["admin"]);
  const time = new Date(alert.emitted_at).toLocaleString();

  return (
    <button
      onClick={onSelect}
      className="w-full text-left p-3 border rounded-lg hover:bg-neutral-50 dark:hover:bg-neutral-900 transition-colors flex items-start gap-3"
      data-testid={`security-alert-row-${alert.id}`}
    >
      <span className={`px-2 py-1 rounded text-xs font-medium border whitespace-nowrap ${SEVERITY_BADGE_CLASSES[alert.severity]}`}>
        {alert.severity}
      </span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium truncate">{alert.rule_name}</span>
          {alert.count > 1 && (
            <span className="text-xs text-neutral-500 whitespace-nowrap">
              ({t("admin:securityAlerts.count", { defaultValue: "×{{n}}", n: alert.count })})
            </span>
          )}
        </div>
        <div className="text-xs text-neutral-500 mt-1 flex flex-wrap gap-x-3 gap-y-1">
          {alert.actor_login && (
            <span>
              {t("admin:securityAlerts.actor", { defaultValue: "Actor" })}: <strong>{alert.actor_login}</strong>
              {alert.actor_roles.length > 0 && <span className="ml-1">[{alert.actor_roles.join(", ")}]</span>}
            </span>
          )}
          {alert.source_ip && (
            <span>IP: <strong>{alert.source_ip}</strong></span>
          )}
          <span>{time}</span>
        </div>
      </div>
    </button>
  );
}
