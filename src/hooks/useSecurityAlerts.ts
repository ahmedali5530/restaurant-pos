/**
 * useSecurityAlerts — React hook that polls the gateway for security alerts.
 *
 * Polls every 30 seconds (configurable) and exposes:
 *   - alerts: sorted by severity (critical first), newest first within severity
 *   - criticalCount: number of open critical alerts (for sidebar badge)
 *   - loading: true during the initial fetch
 *   - error: last fetch error (or null)
 *   - refresh(): manually trigger a refetch
 *   - acknowledge(id, notes): acknowledge an alert + optimistically update
 *
 * Only fetches if the current user has admin/super_admin role (checked via
 * useSecurity) — non-admin users get an empty list (the gateway also enforces
 * this server-side, but we avoid pointless requests).
 */

import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  fetchSecurityAlerts,
  acknowledgeSecurityAlert,
  sortAlertsBySeverity,
  type SecurityAlert,
} from "@/lib/alerts.service.ts";
import { appPage } from "@/store/jotai.ts";
import { useAtom } from "jotai";
import { getUserModules, moduleMatchCandidates } from "@/lib/access.rules.ts";

const POLL_INTERVAL_MS = 30 * 1000; // 30 seconds

const SECURITY_ALERTS_MODULE = "admin.security_alerts";

function useHasSecurityAlertsAccess(): boolean {
  const [page] = useAtom(appPage);
  const modules = getUserModules(page.user);
  return moduleMatchCandidates(SECURITY_ALERTS_MODULE).some((candidate) =>
    modules.includes(candidate)
  );
}

export interface UseSecurityAlertsResult {
  alerts: SecurityAlert[];
  criticalCount: number;
  warningCount: number;
  infoCount: number;
  isLoading: boolean;
  error: Error | null;
  refresh: () => void;
  acknowledge: (alertId: string, notes?: string) => Promise<void>;
}

export function useSecurityAlerts(): UseSecurityAlertsResult {
  const isAdmin = useHasSecurityAlertsAccess();
  const queryClient = useQueryClient();
  const queryKey = ["security-alerts"];

  const { data, isLoading, error, refetch } = useQuery<SecurityAlert[], Error>({
    queryKey,
    queryFn: () => fetchSecurityAlerts({ status: "open", limit: 100 }),
    enabled: isAdmin,
    refetchInterval: POLL_INTERVAL_MS,
    refetchOnWindowFocus: true,
    retry: 1,
    staleTime: POLL_INTERVAL_MS - 5000, // allow refetch when component remounts
  });

  const alerts = sortAlertsBySeverity(data || []);
  const criticalCount = alerts.filter((a) => a.severity === "critical").length;
  const warningCount = alerts.filter((a) => a.severity === "warning").length;
  const infoCount = alerts.filter((a) => a.severity === "info").length;

  const refresh = useCallback(() => {
    refetch();
  }, [refetch]);

  const acknowledge = useCallback(
    async (alertId: string, notes?: string) => {
      // Optimistic update: remove the alert from the list immediately.
      queryClient.setQueryData<SecurityAlert[]>(queryKey, (old) =>
        (old || []).filter((a) => a.id !== alertId)
      );
      try {
        await acknowledgeSecurityAlert(alertId, notes);
        // The alert is now acknowledged server-side; the next poll won't
        // return it (we filter by status=open). No further action needed.
      } catch (err) {
        // Revert the optimistic update on failure.
        queryClient.invalidateQueries({ queryKey });
        throw err;
      }
    },
    [queryClient, queryKey]
  );

  return {
    alerts,
    criticalCount,
    warningCount,
    infoCount,
    isLoading: isLoading && isAdmin,
    error: error || null,
    refresh,
    acknowledge,
  };
}

/**
 * Lightweight hook for just the critical count — used by the sidebar badge
 * to avoid re-rendering the full alert list on every poll.
 */
export function useSecurityAlertsBadge(): { criticalCount: number; isLoading: boolean } {
  const isAdmin = useHasSecurityAlertsAccess();

  const { data, isLoading } = useQuery<SecurityAlert[], Error>({
    queryKey: ["security-alerts-badge"],
    queryFn: () => fetchSecurityAlerts({ status: "open", severity: "critical", limit: 50 }),
    enabled: isAdmin,
    refetchInterval: POLL_INTERVAL_MS,
    refetchOnWindowFocus: true,
    retry: 1,
  });

  return {
    criticalCount: data?.length || 0,
    isLoading: isLoading && isAdmin,
  };
}
