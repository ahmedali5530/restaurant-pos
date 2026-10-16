/**
 * useMasterNotifications — real-time event feed for the Master (super-admin)
 * role, powering the top-slide notification banner.
 *
 * Only subscribes while the current session's logged-in user has the
 * "Master" role (PROTECTED_LAST_ADMIN_ROLE_NAME) — everyone else gets an
 * always-empty feed and no live subscriptions are opened.
 *
 * Sources:
 *  - time_entry (CREATE = clock in, UPDATE with a newly-set clock_out = clock out)
 *  - order_void / order_refund (CREATE)
 *  - order_discount (CREATE, filtered to "large" discounts — see LARGE_DISCOUNT_*)
 *  - employee (CREATE = new hire)
 *  - security_alerts — not a SurrealDB table (served over the gateway HTTP
 *    API by a separate anomaly-detector service), so this is polled rather
 *    than live-subscribed, same as the existing sidebar badge.
 *
 * The Master user's own actions never generate a notification for themselves.
 */
import { useEffect, useRef, useState } from "react";
import { useAtom } from "jotai";
import { appPage } from "@/store/jotai.ts";
import { useDB } from "@/api/db/db.ts";
import { Tables } from "@/api/db/tables.ts";
import { toRecordId } from "@/lib/utils.ts";
import { PROTECTED_LAST_ADMIN_ROLE_NAME } from "@/lib/access.rules.ts";
import { fetchSecurityAlerts, type SecurityAlert } from "@/lib/alerts.service.ts";
import { toLuxonDateTime } from "@/lib/datetime.ts";
import i18n from "@/lib/i18n.ts";

// A discount at/above either bar counts as "large". Percentage is
// currency-agnostic (works the same in any store); the absolute amount is a
// secondary catch for big fixed-amount discounts on stores using small
// percentages. Adjust to taste — there's no universal "large" for every
// store's price scale.
const LARGE_DISCOUNT_RATE_THRESHOLD = 20; // percent
const LARGE_DISCOUNT_AMOUNT_THRESHOLD = 50000;

const SECURITY_ALERT_POLL_MS = 20 * 1000;

export type MasterNotificationType =
  | "clock_in"
  | "clock_out"
  | "void"
  | "refund"
  | "discount"
  | "new_employee"
  | "security_alert";

export interface MasterNotification {
  id: string;
  type: MasterNotificationType;
  severity: "info" | "warning" | "critical";
  title: string;
  message: string;
  at: string;
}

const refKey = (value: unknown): string => {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    if ("tb" in obj && "id" in obj) return `${obj.tb}:${obj.id}`;
    if (typeof (value as {toString?: () => string}).toString === "function") {
      return (value as {toString: () => string}).toString();
    }
  }
  return String(value);
};

/** Translate a Master-notification string (English value as the fallback). */
const nt = (key: string, options?: Record<string, unknown>): string =>
  i18n.t(`toast:notifications.${key}`, {defaultValue: key, ...(options ?? {})});

export function useMasterNotifications() {
  const db = useDB();
  const [{user}] = useAtom(appPage);
  const [notifications, setNotifications] = useState<MasterNotification[]>([]);

  const isMaster = user?.user_role?.name === PROTECTED_LAST_ADMIN_ROLE_NAME;
  const currentUserKey = refKey(user?.id);

  // Person-name cache so repeated events from the same employee/manager
  // don't each trigger their own lookup round-trip.
  const nameCacheRef = useRef<Map<string, string>>(new Map());
  const notifiedClockOutRef = useRef<Set<string>>(new Set());
  const seenAlertIdsRef = useRef<Set<string> | null>(null);

  const push = (notification: Omit<MasterNotification, "id" | "at">) => {
    setNotifications((current) => [
      {...notification, id: `${notification.type}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, at: new Date().toISOString()},
      ...current,
    ].slice(0, 20));
  };

  const dismiss = (id: string) => {
    setNotifications((current) => current.filter((item) => item.id !== id));
  };

  const resolveName = async (ref: unknown): Promise<string | null> => {
    const key = refKey(ref);
    if (!key) return null;
    const cached = nameCacheRef.current.get(key);
    if (cached) return cached;
    try {
      const record = await db.select(toRecordId(key)) as {first_name?: string; last_name?: string} | undefined;
      if (!record) return null;
      const name = `${record.first_name ?? ""} ${record.last_name ?? ""}`.trim();
      if (name) nameCacheRef.current.set(key, name);
      return name || null;
    } catch {
      return null;
    }
  };

  useEffect(() => {
    if (!isMaster) {
      setNotifications([]);
      return;
    }

    let cancelled = false;
    const subscriptions: Array<{kill: () => Promise<void>}> = [];

    const isSelf = (ref: unknown) => refKey(ref) === currentUserKey;

    const watch = async <T = any>(table: string, handler: (action: string, value: T) => void) => {
      try {
        const subscription = await db.live<T>(table, (action, value) => {
          if (cancelled) return;
          void handler(action, value);
        });
        if (cancelled) {
          await subscription.kill().catch(() => undefined);
          return;
        }
        subscriptions.push(subscription);
      } catch {
        // Live queries can fail transiently (reconnects, etc.) — this feed
        // is best-effort, not a source of truth, so just skip this table.
      }
    };

    void watch<{id: string; user?: unknown; employee?: unknown; clock_in?: unknown; clock_out?: unknown}>(
      Tables.time_entries,
      async (action, value) => {
        if (action === "CREATE") {
          if (isSelf(value.user)) return;
          const name = (await resolveName(value.employee)) ?? nt("someone");
          const at = value.clock_in ? toLuxonDateTime(value.clock_in as any).toFormat("HH:mm") : "";
          push({
            type: "clock_in",
            severity: "info",
            title: nt("clockInTitle"),
            message: at ? nt("clockInWithTime", {name, time: at}) : nt("clockIn", {name}),
          });
        } else if (action === "UPDATE" && value.clock_out) {
          const entryId = refKey(value.id);
          if (notifiedClockOutRef.current.has(entryId)) return;
          notifiedClockOutRef.current.add(entryId);
          if (isSelf(value.user)) return;
          const name = (await resolveName(value.employee)) ?? nt("someone");
          const at = toLuxonDateTime(value.clock_out as any).toFormat("HH:mm");
          push({
            type: "clock_out",
            severity: "info",
            title: nt("clockOutTitle"),
            message: nt("clockOutWithTime", {name, time: at}),
          });
        }
      }
    );

    void watch<{id: string; deleted_by?: unknown; reason?: string; order?: unknown}>(
      Tables.order_voids,
      async (action, value) => {
        if (action !== "CREATE") return;
        if (isSelf(value.deleted_by)) return;
        const name = (await resolveName(value.deleted_by)) ?? nt("someone");
        push({
          type: "void",
          severity: "warning",
          title: nt("voidTitle"),
          message: value.reason ? nt("voidWithReason", {name, reason: value.reason}) : nt("void", {name}),
        });
      }
    );

    void watch<{id: string; manager?: unknown; logged_in_user?: unknown; reason?: string}>(
      Tables.order_refunds,
      async (action, value) => {
        if (action !== "CREATE") return;
        const actor = value.manager ?? value.logged_in_user;
        if (isSelf(actor)) return;
        const name = (await resolveName(actor)) ?? nt("someone");
        push({
          type: "refund",
          severity: "warning",
          title: nt("refundTitle"),
          message: value.reason ? nt("refundWithReason", {name, reason: value.reason}) : nt("refund", {name}),
        });
      }
    );

    void watch<{id: string; applied_by?: unknown; applied_amount?: number; applied_rate?: number; name?: string}>(
      Tables.order_discounts,
      async (action, value) => {
        if (action !== "CREATE") return;
        const isLarge =
          (value.applied_rate != null && value.applied_rate >= LARGE_DISCOUNT_RATE_THRESHOLD) ||
          (value.applied_amount != null && value.applied_amount >= LARGE_DISCOUNT_AMOUNT_THRESHOLD);
        if (!isLarge) return;
        if (isSelf(value.applied_by)) return;
        const name = (await resolveName(value.applied_by)) ?? nt("someone");
        const detail = value.applied_rate != null ? `${value.applied_rate}%` : String(value.applied_amount ?? "");
        push({
          type: "discount",
          severity: "warning",
          title: nt("discountTitle"),
          message: `${nt("discountApplied", {name, detail})}${value.name ? ` (${value.name})` : ""}`,
        });
      }
    );

    void watch<{id: string; first_name?: string; last_name?: string}>(
      Tables.employees,
      (action, value) => {
        if (action !== "CREATE") return;
        const name = `${value.first_name ?? ""} ${value.last_name ?? ""}`.trim() || nt("newEmployeeFallback");
        push({
          type: "new_employee",
          severity: "info",
          title: nt("newEmployeeTitle"),
          message: name,
        });
      }
    );

    return () => {
      cancelled = true;
      subscriptions.forEach((sub) => void sub.kill().catch(() => undefined));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMaster, currentUserKey]);

  // security_alerts isn't a SurrealDB table (served over the gateway HTTP API
  // by a separate anomaly-detector service) — poll it instead of a live query.
  useEffect(() => {
    if (!isMaster) {
      seenAlertIdsRef.current = null;
      return;
    }

    let cancelled = false;

    const poll = async () => {
      let alerts: SecurityAlert[];
      try {
        alerts = await fetchSecurityAlerts({status: "open", limit: 50});
      } catch {
        return;
      }
      if (cancelled) return;

      if (seenAlertIdsRef.current === null) {
        // First poll after mount just baselines — don't replay pre-existing
        // open alerts as if they just happened.
        seenAlertIdsRef.current = new Set(alerts.map((alert) => alert.id));
        return;
      }

      for (const alert of alerts) {
        if (seenAlertIdsRef.current.has(alert.id)) continue;
        seenAlertIdsRef.current.add(alert.id);
        push({
          type: "security_alert",
          severity: alert.severity === "critical" ? "critical" : alert.severity === "warning" ? "warning" : "info",
          title: nt("securityAlertTitle"),
          message: `${alert.rule_name}${alert.actor_login ? ` — ${alert.actor_login}` : ""}`,
        });
      }
    };

    void poll();
    const interval = setInterval(poll, SECURITY_ALERT_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [isMaster]);

  return {notifications, dismiss};
}
