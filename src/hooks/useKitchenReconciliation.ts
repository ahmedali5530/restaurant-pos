import {useCallback, useEffect, useRef, useState} from "react";
import {useDB} from "@/api/db/db.ts";
import {KitchenReconciliation} from "@/api/model/kitchen_reconciliation.ts";
import {ClosingCycleWindow} from "@/lib/closing-cycle.ts";
import {
  formatBusinessDateWindow,
  resolveBusinessDateWindow,
} from "@/lib/kitchen/business-date.ts";
import {
  generateReconciliation,
  getActiveReconciliation,
  getMissedReconciliations,
  getReconciliationRevisions,
  saveManualInputs,
  verifyReconciliation,
  discardDraftReconciliation,
  ManualLineInput,
} from "@/lib/kitchen/reconciliation.service.ts";
import {KitchenReconciliationRevision} from "@/api/model/kitchen_reconciliation_revision.ts";

export const useKitchenReconciliation = (
  kitchenId: string | null,
  businessDate: string | null
) => {
  const db = useDB();
  const dbRef = useRef(db);

  useEffect(() => {
    dbRef.current = db;
  }, [db]);

  const [reconciliation, setReconciliation] = useState<KitchenReconciliation | null>(null);
  const [missedDays, setMissedDays] = useState<KitchenReconciliation[]>([]);
  const [revisions, setRevisions] = useState<KitchenReconciliationRevision[]>([]);
  const [windowLabel, setWindowLabel] = useState<string>("");
  const [window, setWindow] = useState<ClosingCycleWindow | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!kitchenId || !businessDate) {
      setReconciliation(null);
      setMissedDays([]);
      setRevisions([]);
      setWindow(null);
      setWindowLabel("");
      return;
    }

    const client = dbRef.current;

    try {
      setLoading(true);
      setError(null);

      const resolvedWindow = await resolveBusinessDateWindow(client, businessDate);
      setWindow(resolvedWindow);
      setWindowLabel(formatBusinessDateWindow(resolvedWindow));

      const [active, missed] = await Promise.all([
        getActiveReconciliation(client, kitchenId, businessDate),
        getMissedReconciliations(client, kitchenId),
      ]);

      setReconciliation(active);
      setMissedDays(missed);

      if (active?.id) {
        const revs = await getReconciliationRevisions(client, active.id);
        setRevisions(revs as KitchenReconciliationRevision[]);
      } else {
        setRevisions([]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [kitchenId, businessDate]);

  useEffect(() => {
    void load();
  }, [load]);

  const generate = useCallback(
    async (userId: string) => {
      if (!kitchenId || !businessDate) return null;
      setLoading(true);
      try {
        const result = await generateReconciliation(
          dbRef.current,
          kitchenId,
          businessDate,
          userId
        );
        await load();
        return result;
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [kitchenId, businessDate, load]
  );

  const saveLines = useCallback(
    async (lines: ManualLineInput[], userId: string, changeType: "update" | "csv_import" = "update") => {
      if (!reconciliation?.id) return null;
      setLoading(true);
      try {
        const result = await saveManualInputs(
          dbRef.current,
          reconciliation.id,
          lines,
          userId,
          changeType
        );
        await load();
        return result;
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [reconciliation?.id, load]
  );

  const verify = useCallback(
    async (userId: string) => {
      if (!reconciliation?.id) return null;
      setLoading(true);
      try {
        const result = await verifyReconciliation(dbRef.current, reconciliation.id, userId);
        await load();
        return result;
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [reconciliation?.id, load]
  );

  const discard = useCallback(
    async (userId: string) => {
      if (!kitchenId || !businessDate || !reconciliation?.id) return null;
      setLoading(true);
      try {
        const result = await discardDraftReconciliation(
          dbRef.current,
          reconciliation.id,
          kitchenId,
          businessDate,
          userId
        );
        await load();
        return result;
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [kitchenId, businessDate, reconciliation?.id, load]
  );

  return {
    reconciliation,
    missedDays,
    revisions,
    window,
    windowLabel,
    loading,
    error,
    reload: load,
    generate,
    saveLines,
    verify,
    discard,
  };
};
