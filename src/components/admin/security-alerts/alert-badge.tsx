/**
 * SecurityAlertsBadge — small red badge showing the count of open critical
 * security alerts. Renders next to the Admin icon in the sidebar.
 *
 * Uses useSecurityAlertsBadge() which polls every 30s (only for admin users).
 * Non-admin users see nothing (the hook returns 0 and disabled state).
 *
 * When count > 0:
 *   - Red pulsing dot in the top-right corner of the Admin icon button
 *   - Title tooltip: "{{count}} open critical alert(s)"
 *   - Clicking the Admin button navigates to Admin → Security Alerts tab
 *
 * When count === 0: renders nothing (null).
 */

import { useSecurityAlertsBadge } from "@/hooks/useSecurityAlerts.ts";
import { useTranslation } from "react-i18next";

export function SecurityAlertsBadge() {
  const { criticalCount } = useSecurityAlertsBadge();
  const { t } = useTranslation(["admin"]);

  if (criticalCount === 0) return null;

  const tooltip = t("admin:securityAlerts.badgeTooltip", {
    defaultValue: "{{count}} open critical alert(s)",
    count: criticalCount,
  });

  return (
    <span
      title={tooltip}
      data-testid="security-alerts-badge"
      className="absolute -top-1 -right-1 flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-danger-600 text-white text-[10px] font-bold animate-pulse shadow-md shadow-danger-600/50 ring-2 ring-white dark:ring-neutral-900"
    >
      {criticalCount > 99 ? "99+" : criticalCount}
    </span>
  );
}
