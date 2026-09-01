/**
 * OfflineModeBanner — persistent UI indicator shown when the SPA loses its
 * SurrealDB WebSocket connection.
 *
 * Research finding: "Cloud POS dies when internet dies" is the #3 pain point
 * in restaurant POS forums (18 mentions across Reddit, HN, Trustpilot).
 * Toast, Square, and Lightspeed all show a persistent banner when offline.
 *
 * POSR already has offline-first IndexedDB for integration queues, but the
 * SPA has no visual indicator when the WebSocket drops. This component:
 *   - Listens to the DatabaseProvider's connection state
 *   - Shows a red banner at the top when disconnected
 *   - Shows a yellow banner when reconnecting
 *   - Auto-hides when connection is restored (after 2s delay to avoid flicker)
 *   - Includes a "Retry" button for manual reconnection
 *
 * Placement: mounted in app.tsx, above all routes, below the header.
 */

import { useEffect, useState } from "react";
import { useDatabase } from "@/hooks/useDatabase.ts";
import { useOfflineQueue } from "@/hooks/useOfflineQueue.ts";
import { useTranslation } from "react-i18next";

export function OfflineModeBanner() {
  const { isConnected } = useDatabase();
  const { pendingCount, isReplaying, replayNow } = useOfflineQueue();
  const { t } = useTranslation(["common"]);
  const [showBanner, setShowBanner] = useState(false);
  const [wasConnected, setWasConnected] = useState(isConnected);

  const handleRetry = () => {
    window.dispatchEvent(new CustomEvent('posr-db-reconnect'));
    void replayNow();
  };

  useEffect(() => {
    if (!isConnected) {
      // Show banner immediately when disconnected
      setShowBanner(true);
    } else if (wasConnected === false && isConnected) {
      // Was disconnected, now reconnected — hide after 2s delay
      const timer = setTimeout(() => setShowBanner(false), 2000);
      return () => clearTimeout(timer);
    }
    setWasConnected(isConnected);
  }, [isConnected, wasConnected]);

  // Show banner when there are pending writes even if connected (during replay)
  if (isConnected && pendingCount === 0 && !showBanner) return null;

  if (isConnected && !showBanner && pendingCount === 0) return null;

  // Connected + replaying → show yellow "syncing" banner
  if (isConnected && (pendingCount > 0 || isReplaying)) {
    return (
      <div
        className="fixed top-0 left-0 right-0 z-[9999] bg-amber-500 text-white text-center py-1.5 text-sm font-medium shadow-md flex items-center justify-center gap-3"
        data-testid="offline-banner-syncing"
        role="status"
        aria-live="polite"
      >
        <span className="flex items-center gap-2">
          <span className="inline-block w-2 h-2 rounded-full bg-white animate-pulse" />
          {isReplaying
            ? t("common:offline.syncing", { defaultValue: "Syncing {{count}} offline changes…", count: pendingCount })
            : t("common:offline.pendingSync", { defaultValue: "{{count}} changes queued for sync", count: pendingCount })}
        </span>
        {!isReplaying && pendingCount > 0 && (
          <button
            onClick={() => void replayNow()}
            className="ml-2 px-3 py-0.5 bg-white text-amber-600 rounded text-xs font-bold hover:bg-amber-50 transition-colors"
          >
            {t("common:offline.syncNow", { defaultValue: "Sync now" })}
          </button>
        )}
      </div>
    );
  }

  // Reconnected — brief green "restored" message
  if (isConnected && showBanner) {
    return (
      <div
        className="fixed top-0 left-0 right-0 z-[9999] bg-green-600 text-white text-center py-1.5 text-sm font-medium shadow-md transition-all"
        data-testid="offline-banner-reconnected"
      >
        {t("common:offline.reconnected", { defaultValue: "✓ Connection restored" })}
      </div>
    );
  }

  // Disconnected — red banner with queue count + retry
  return (
    <div
      className="fixed top-0 left-0 right-0 z-[9999] bg-red-600 text-white text-center py-2 text-sm font-medium shadow-lg flex items-center justify-center gap-3"
      data-testid="offline-banner-disconnected"
      role="alert"
      aria-live="assertive"
    >
      <span className="flex items-center gap-2">
        <span className="inline-block w-2 h-2 rounded-full bg-white animate-pulse" />
        {pendingCount > 0
          ? t("common:offline.disconnectedWithQueue", {
              defaultValue: "⚠ Offline — {{count}} changes queued, will sync when reconnected",
              count: pendingCount,
            })
          : t("common:offline.disconnected", { defaultValue: "⚠ Offline — changes will sync when reconnected" })}
      </span>
      <button
        onClick={handleRetry}
        className="ml-2 px-3 py-0.5 bg-white text-red-600 rounded text-xs font-bold hover:bg-red-50 transition-colors"
        aria-label={t("common:offline.retry", { defaultValue: "Retry connection" })}
      >
        {t("common:offline.retry", { defaultValue: "Retry" })}
      </button>
    </div>
  );
}
