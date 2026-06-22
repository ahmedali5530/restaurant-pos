import {useCallback, useEffect, useRef, useState} from "react";
import {useDB} from "@/api/db/db.ts";
import {BuffetSession} from "@/api/model/buffet_session.ts";
import {
  computeSessionClosing,
  getBuffetSession,
} from "@/lib/inventory/buffet.service.ts";
import type {BuffetLineComputed, BuffetSessionAnalytics} from "@/lib/inventory/buffet.calculations.ts";

export function useBuffetSession(sessionId?: string) {
  const db = useDB();
  const dbRef = useRef(db);

  useEffect(() => {
    dbRef.current = db;
  }, [db]);

  const [session, setSession] = useState<BuffetSession | null>(null);
  const [closingLines, setClosingLines] = useState<BuffetLineComputed[]>([]);
  const [analytics, setAnalytics] = useState<BuffetSessionAnalytics | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const refresh = useCallback(async () => {
    if (!sessionId) {
      setSession(null);
      setClosingLines([]);
      setAnalytics(null);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const loaded = await getBuffetSession(dbRef.current, sessionId);
      setSession(loaded);

      if (loaded && ["closing", "closed"].includes(loaded.status)) {
        const closing = await computeSessionClosing(dbRef.current, sessionId);
        setClosingLines(closing.lines);
        setAnalytics(closing.analytics);
      } else {
        setClosingLines([]);
        setAnalytics(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err : new Error("Failed to load buffet session"));
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return {
    session,
    closingLines,
    analytics,
    loading,
    error,
    refresh,
  };
}
