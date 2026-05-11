import React, {ReactNode, useEffect, useRef} from "react";
import {useDB} from "@/api/db/db.ts";
import {Tables} from "@/api/db/tables.ts";
import {Table} from "@/api/model/table.ts";
import {toJsDate} from "@/lib/datetime.ts";

interface TableLockProviderProps {
  children: ReactNode;
}

const STALE_LOCK_THRESHOLD_MS = 15_000;
const CHECK_INTERVAL_MS = 30_000;

export const TableLockProvider: React.FC<TableLockProviderProps> = ({children}) => {
  const db = useDB();
  const dbRef = useRef(db);
  const inFlightRef = useRef(false);
  dbRef.current = db;

  useEffect(() => {
    let isActive = true;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const releaseStaleLocks = async () => {
      if (inFlightRef.current) {
        return;
      }

      inFlightRef.current = true;
      try {
        const [lockedTables] = await dbRef.current.query<[Table[]]>(
          `SELECT id, locked_at
           FROM ${Tables.tables}
           WHERE is_locked = true
             AND locked_at != NONE
             AND deleted_at = none`
        );

        if (!Array.isArray(lockedTables) || lockedTables.length === 0) {
          return;
        }

        const staleThreshold = Date.now() - STALE_LOCK_THRESHOLD_MS;
        const staleTables = lockedTables.filter((table) => {
          if (!table.locked_at) {
            return true;
          }

          const lockedAt = toJsDate(table.locked_at).getTime();
          return !Number.isFinite(lockedAt) || lockedAt < staleThreshold;
        });

        if (staleTables.length === 0) {
          return;
        }

        await Promise.all(
          staleTables.map((table) =>
            dbRef.current.merge(table.id, {
              is_locked: false,
              locked_at: null,
              locked_by: null,
            })
          )
        );
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
  }, []);

  return <>{children}</>;
};
