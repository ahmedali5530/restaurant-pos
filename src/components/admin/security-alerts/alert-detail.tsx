/**
 * AlertDetailModal — modal showing full details of a security alert + acknowledge form.
 *
 * Shows:
 *   - Severity badge + rule name
 *   - Rule type (human-readable label)
 *   - Actor (id, login, roles)
 *   - Source IP
 *   - Count + time window
 *   - Full details JSON (collapsed by default)
 *   - Emitted time
 *
 * Acknowledge form:
 *   - Resolution notes textarea (optional)
 *   - Acknowledge button → calls acknowledgeSecurityAlert() + closes modal
 */

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Modal } from "@/components/common/react-aria/modal.tsx";
import { Button } from "@/components/common/input/button.tsx";
import {
  SEVERITY_BADGE_CLASSES,
  RULE_TYPE_LABELS,
  type SecurityAlert,
} from "@/lib/alerts.service.ts";
import { useSecurityAlerts } from "@/hooks/useSecurityAlerts.ts";

interface Props {
  alert: SecurityAlert;
  onClose: () => void;
}

export function AlertDetailModal({ alert, onClose }: Props) {
  const { t } = useTranslation(["admin", "common"]);
  const { acknowledge } = useSecurityAlerts();
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showDetails, setShowDetails] = useState(false);

  const handleAcknowledge = async () => {
    setSubmitting(true);
    setError(null);
    try {
      await acknowledge(alert.id, notes.trim() || undefined);
      onClose();
    } catch (err: any) {
      setError(err?.message || "Failed to acknowledge alert");
    } finally {
      setSubmitting(false);
    }
  };

  const time = new Date(alert.emitted_at).toLocaleString();
  const ruleTypeLabel = RULE_TYPE_LABELS[alert.rule_type] || alert.rule_type;

  return (
    <Modal
      testId="security-alert-detail-modal"
      title={t("admin:securityAlerts.detailTitle", { defaultValue: "Security Alert" })}
      open={true}
      onClose={onClose}
    >
      <div className="space-y-4">
        {/* Header: severity + rule name */}
        <div className="flex items-center gap-3">
          <span className={`px-3 py-1 rounded text-sm font-medium border ${SEVERITY_BADGE_CLASSES[alert.severity]}`}>
            {alert.severity.toUpperCase()}
          </span>
          <h3 className="text-lg font-semibold flex-1">{alert.rule_name}</h3>
        </div>

        {/* Metadata grid */}
        <div className="grid grid-cols-2 gap-3 text-sm">
          <DetailField
            label={t("admin:securityAlerts.ruleType", { defaultValue: "Rule type" })}
            value={ruleTypeLabel}
          />
          <DetailField
            label={t("admin:securityAlerts.count", { defaultValue: "Count" })}
            value={String(alert.count)}
          />
          <DetailField
            label={t("admin:securityAlerts.actor", { defaultValue: "Actor" })}
            value={alert.actor_login || alert.actor_id || t("common:notAvailable", { defaultValue: "N/A" })}
          />
          <DetailField
            label={t("admin:securityAlerts.actorId", { defaultValue: "Actor ID" })}
            value={alert.actor_id || t("common:notAvailable", { defaultValue: "N/A" })}
          />
          <DetailField
            label={t("admin:securityAlerts.sourceIp", { defaultValue: "Source IP" })}
            value={alert.source_ip || t("common:notAvailable", { defaultValue: "N/A" })}
          />
          <DetailField
            label={t("admin:securityAlerts.emittedAt", { defaultValue: "Emitted at" })}
            value={time}
          />
        </div>

        {/* Actor roles */}
        {alert.actor_roles.length > 0 && (
          <div className="text-sm">
            <span className="text-neutral-500">{t("admin:securityAlerts.actorRoles", { defaultValue: "Actor roles" })}: </span>
            <span className="font-mono text-xs">{alert.actor_roles.join(", ")}</span>
          </div>
        )}

        {/* Details JSON (collapsible) */}
        {alert.details && Object.keys(alert.details).length > 0 && (
          <div>
            <button
              onClick={() => setShowDetails(!showDetails)}
              className="text-sm text-blue-600 hover:underline"
              data-testid="security-alert-toggle-details"
            >
              {showDetails
                ? t("admin:securityAlerts.hideDetails", { defaultValue: "▼ Hide details" })
                : t("admin:securityAlerts.showDetails", { defaultValue: "▶ Show details" })}
            </button>
            {showDetails && (
              <pre className="mt-2 p-3 bg-neutral-50 dark:bg-neutral-900 border rounded text-xs overflow-x-auto max-h-48" data-testid="security-alert-details-json">
                {JSON.stringify(alert.details, null, 2)}
              </pre>
            )}
          </div>
        )}

        {/* Acknowledge form */}
        <div className="border-t pt-4">
          <label className="block text-sm font-medium mb-2">
            {t("admin:securityAlerts.resolutionNotes", { defaultValue: "Resolution notes (optional)" })}
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder={t("admin:securityAlerts.resolutionNotesPlaceholder", {
              defaultValue: "e.g. Investigated — false alarm from automated test",
            })}
            className="w-full p-2 border rounded text-sm resize-y min-h-[80px]"
            data-testid="security-alert-resolution-notes"
          />
          {error && (
            <div className="text-red-600 text-sm mt-2" data-testid="security-alert-ack-error">
              {error}
            </div>
          )}
          <div className="flex gap-2 mt-3">
            <Button
              variant="primary"
              onClick={handleAcknowledge}
              disabled={submitting}
            >
              {submitting
                ? t("common:actions.processing", { defaultValue: "Processing…" })
                : t("admin:securityAlerts.acknowledge", { defaultValue: "Acknowledge" })}
            </Button>
            <Button variant="ghost" onClick={onClose} disabled={submitting}>
              {t("common:actions.cancel", { defaultValue: "Cancel" })}
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}

function DetailField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-neutral-500">{label}</div>
      <div className="font-medium break-all">{value}</div>
    </div>
  );
}
