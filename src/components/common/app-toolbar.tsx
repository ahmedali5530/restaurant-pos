/**
 * Permanent bottom app toolbar. Sync status is a colored dot only — no flicker
 * banners. Extra slots can be added later for other terminal operations.
 */

import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from "react";
import { useLocation } from "react-router";
import { useDatabase } from "@/hooks/useDatabase.ts";
import { useTranslation } from "react-i18next";
import {
  getSyncStatus,
  subscribeSyncStatus,
  type SyncStatusState,
} from "@/infrastructure/sync/sync-status.ts";
import { terminalSyncService } from "@/infrastructure/sync/sync-service.ts";
import { posStore } from "@/infrastructure/pos-store/pos-store.ts";
import type { SyncConflictRow } from "@/infrastructure/pos-store/types.ts";
import { cn } from "@/lib/utils.ts";
import { REPORTS } from "@/routes/posr.ts";

/** Must match `html[data-app-toolbar='1'] { --app-toolbar-h }` in app.scss. */
export const APP_TOOLBAR_HEIGHT = "2.75rem";

const shortId = (value?: string): string => {
  if (!value) return "";
  const raw = value.includes(":") ? value.slice(value.indexOf(":") + 1) : value;
  return raw.length > 8 ? `…${raw.slice(-8)}` : raw;
};

type SyncDotKind = "offline" | "conflict" | "syncing" | "pending" | "idle";

function syncDotKind(
  sync: SyncStatusState,
  isEffectivelyConnected: boolean,
): SyncDotKind {
  if (!isEffectivelyConnected || sync.phase === "offline" || sync.phase === "error") {
    return "offline";
  }
  if (sync.conflictCount > 0) return "conflict";
  if (
    sync.phase === "syncing"
    || sync.phase === "hydrating"
    || sync.phase === "initializing"
  ) {
    return "syncing";
  }
  if (sync.pendingCount > 0) return "pending";
  return "idle";
}

function SyncConflictPanel({ onChanged }: { onChanged: () => void }) {
  const { t } = useTranslation(["common"]);
  const [conflicts, setConflicts] = useState<SyncConflictRow[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [busyAll, setBusyAll] = useState(false);
  const panelBusy = busyAll || busy !== null;

  const load = useCallback(() => {
    void posStore.getOpenConflicts().then(setConflicts);
  }, []);

  useEffect(() => {
    load();
    window.addEventListener("posr-posstore-write", load);
    return () => window.removeEventListener("posr-posstore-write", load);
  }, [load]);

  const act = async (operationId: string, action: "retry" | "discard") => {
    setBusy(operationId);
    try {
      if (action === "retry") await terminalSyncService.retryConflict(operationId);
      else await terminalSyncService.discardConflict(operationId);
    } catch {
      // toolbar dot already reflects sync errors
    } finally {
      setBusy(null);
      load();
      onChanged();
    }
  };

  const syncAll = async () => {
    setBusyAll(true);
    try {
      await terminalSyncService.retryAllConflicts();
    } catch {
      // toolbar dot already reflects sync errors
    } finally {
      setBusyAll(false);
      load();
      onChanged();
    }
  };

  if (conflicts.length === 0) return null;

  return (
    <div
      className="absolute bottom-full right-0 mb-2 w-[min(100vw-1rem,28rem)] max-h-[40vh] overflow-y-auto rounded-lg border border-danger-200 bg-white text-neutral-800 shadow-lg text-sm"
      data-testid="sync-conflict-panel"
    >
      <div className="flex items-start gap-3 px-4 py-2 text-xs text-neutral-600 border-b border-neutral-100">
        <div className="flex-1 min-w-0 pt-0.5">{t("common:offline.conflictsHint")}</div>
        <button
          type="button"
          disabled={panelBusy}
          onClick={() => void syncAll()}
          data-testid="sync-conflict-retry-all"
          className="shrink-0 px-3 py-1 rounded bg-primary-600 text-white text-xs font-bold hover:bg-primary-700 disabled:opacity-50"
        >
          {t("common:offline.syncAll")}
        </button>
      </div>
      <ul className="divide-y divide-neutral-100">
        {conflicts.map((conflict) => (
          <li
            key={conflict.id}
            className="flex items-center gap-3 px-4 py-2"
            data-testid="sync-conflict-row"
          >
            <div className="flex-1 min-w-0">
              <div className="font-semibold truncate">
                {t("common:offline.conflictOrder", { id: shortId(conflict.aggregateId) })}
                <span className="ml-2 font-normal text-neutral-500">
                  {conflict.operationType} · {conflict.code}
                </span>
              </div>
              <div className="text-xs text-neutral-500 truncate" title={conflict.message}>
                {conflict.message}
              </div>
            </div>
            <button
              type="button"
              disabled={panelBusy}
              onClick={() => void act(conflict.operationId, "retry")}
              className="px-3 py-1 rounded bg-primary-600 text-white text-xs font-bold hover:bg-primary-700 disabled:opacity-50"
            >
              {t("common:offline.retryOp")}
            </button>
            <button
              type="button"
              disabled={panelBusy}
              onClick={() => void act(conflict.operationId, "discard")}
              className="px-3 py-1 rounded border border-danger-500 text-danger-700 text-xs font-bold hover:bg-danger-50 disabled:opacity-50"
            >
              {t("common:offline.discardOp")}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Sync bar on /reports index only — not on individual report screens. */
function shouldShowAppToolbar(pathname: string): boolean {
  const path = pathname.replace(/\/+$/, "") || "/";
  if (path === REPORTS) return true;
  if (path.startsWith(`${REPORTS}/`)) return false;
  return true;
}

export function AppToolbar() {
  const { isEffectivelyConnected, hasSession } = useDatabase();
  const { pathname } = useLocation();
  const { t } = useTranslation(["common"]);
  const [sync, setSync] = useState<SyncStatusState>(getSyncStatus());
  const [showConflicts, setShowConflicts] = useState(false);
  const visible = hasSession && shouldShowAppToolbar(pathname);

  useEffect(() => subscribeSyncStatus(setSync), []);

  useEffect(() => {
    if (sync.conflictCount === 0) setShowConflicts(false);
  }, [sync.conflictCount]);

  useLayoutEffect(() => {
    if (!visible) {
      delete document.documentElement.dataset.appToolbar;
      return;
    }
    document.documentElement.dataset.appToolbar = "1";
    return () => {
      delete document.documentElement.dataset.appToolbar;
    };
  }, [visible]);

  const kind = useMemo(
    () => syncDotKind(sync, isEffectivelyConnected),
    [sync, isEffectivelyConnected],
  );

  if (!visible) return null;

  const title = (() => {
    switch (kind) {
      case "offline":
        return t("common:offline.disconnected");
      case "conflict":
        return t("common:offline.conflicts", { count: sync.conflictCount });
      case "syncing":
        return t("common:offline.syncing", { count: sync.pendingCount });
      case "pending":
        return sync.failedCount > 0
          ? t("common:offline.conflictFailed", { count: sync.failedCount })
          : t("common:offline.pendingSync", { count: sync.pendingCount });
      default:
        return t("common:offline.synced");
    }
  })();

  const onDotClick = () => {
    if (kind === "conflict") {
      setShowConflicts((prev) => !prev);
      return;
    }
    window.dispatchEvent(new CustomEvent("posr-db-reconnect"));
    void terminalSyncService.synchronize({ force: true }).catch(() => undefined);
  };

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-[9990] flex h-[var(--app-toolbar-h)] items-center justify-end gap-3 border-t border-neutral-200 bg-white px-4"
      data-testid="app-toolbar"
      style={{ height: APP_TOOLBAR_HEIGHT }}
    >
      {/* Future toolbar slots go here (left / center). */}
      <div className="relative flex items-center">
        {showConflicts && (
          <SyncConflictPanel onChanged={() => setSync(getSyncStatus())} />
        )}
        <button
          type="button"
          title={title}
          aria-label={title}
          data-testid="sync-status-dot"
          data-sync-kind={kind}
          onClick={onDotClick}
          className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-neutral-100"
        >
          <span
            className={cn(
              "inline-block h-3 w-3 rounded-full",
              kind === "offline" || kind === "conflict"
                ? "bg-danger-500"
                : kind === "syncing" || kind === "pending"
                  ? "bg-warning-500"
                  : "bg-success-500",
              kind === "syncing" && "animate-pulse",
            )}
          />
        </button>
      </div>
    </div>
  );
}
