import React, {ReactNode, useEffect, useRef} from "react";
import {useAtomValue} from "jotai";
import {toJsDate} from "@/lib/datetime.ts";
import {appPage} from "@/store/jotai.ts";
import {posStore} from "@/infrastructure/pos-store/pos-store.ts";

interface TableLockProviderProps {
  children: ReactNode;
}

const STALE_LOCK_THRESHOLD_MS = 15_000;
const CHECK_INTERVAL_MS = 30_000;

/**
 * Releases table locks whose heartbeat went stale. Reads and writes the local
 * `tableLocks` store only — the outbox pushes the release to SurrealDB and pull
 * keeps every other terminal's view fresh (ADR 0001).
 */
export const TableLockProvider: React.FC<TableLockProviderProps> = ({children}) => {
  const page = useAtomValue(appPage);
  const pageRef = useRef(page);
  const inFlightRef = useRef(false);
  pageRef.current = page;

  const userId = page?.user?.id != null ? String(page.user.id) : null;

  useEffect(() => {
    // Only poll while a user is logged in.
    if (!userId) {
      return;
    }

    let isActive = true;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const releaseStaleLocks = async () => {
      if (inFlightRef.current) {
        return;
      }

      if (!pageRef.current?.user) {
        return;
      }

      inFlightRef.current = true;
      try {
        const locks = await posStore.getTableLocks();
        const staleThreshold = Date.now() - STALE_LOCK_THRESHOLD_MS;
        const stale = locks.filter((lock) => {
          if (!lock.is_locked) return false;
          if (!lock.locked_at) return true;
          const lockedAt = toJsDate(lock.locked_at as any).getTime();
          return !Number.isFinite(lockedAt) || lockedAt < staleThreshold;
        });

        for (const lock of stale) {
          await posStore.unlockTable(lock.id);
        }
      } catch (error) {
        console.error("Error releasing stale table locks:", error);
      } finally {
        inFlightRef.current = false;
      }
    };

    const runLoop = async () => {
      if (!isActive) {
        return;
      }

      if (!pageRef.current?.user) {
        return;
      }

      await releaseStaleLocks();

      if (!isActive) {
        return;
      }

      timeoutId = setTimeout(() => {
        void runLoop();
      }, CHECK_INTERVAL_MS);
    };

    void runLoop();

    return () => {
      isActive = false;
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, [userId]);

  return <>{children}</>;
};
