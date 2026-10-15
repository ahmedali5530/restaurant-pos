import {useEffect, useMemo, useState} from "react";
import {useAtom} from "jotai";
import {useDB} from "@/api/db/db.ts";
import {
  loadReportBranchContext,
  resolveEffectiveBranchIds,
  type BranchView,
} from "@/api/reports/shared/branch-scope.ts";
import {parseBranchScopeFromParams} from "@/api/reports/shared/filters.ts";
import {appPage} from "@/store/jotai.ts";

export interface ReportBranchScope {
  /** Ready after sync_branch load (or failure). */
  ready: boolean;
  /** Effective branch_id filter for queries; undefined = no filter. */
  branchIds: string[] | undefined;
  branchView: BranchView;
  isByBranch: boolean;
  multiBranchMode: boolean;
  branchLabels: Map<string, string>;
  /** Ordered client_ids for by-branch section order. */
  branchOrder: string[];
}

/**
 * Resolves HQ branch scope for a report page from URL params + sync_branch +
 * the signed-in user's branch_ids. Never put `db` in deps.
 */
export const useReportBranchScope = (): ReportBranchScope => {
  const db = useDB();
  const [{user}] = useAtom(appPage);
  const params = useMemo(
    () => parseBranchScopeFromParams(new URLSearchParams(window.location.search)),
    [],
  );

  const [ready, setReady] = useState(false);
  const [multiBranchMode, setMultiBranchMode] = useState(false);
  const [branchLabels, setBranchLabels] = useState<Map<string, string>>(
    () => new Map(),
  );
  const [branchOrder, setBranchOrder] = useState<string[]>([]);
  const [branchIds, setBranchIds] = useState<string[] | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const ctx = await loadReportBranchContext(db, user?.branch_ids);
        if (cancelled) return;
        const effective = resolveEffectiveBranchIds({
          selectedBranchIds: params.selectedBranchIds,
          userBranchIds: user?.branch_ids,
          multiBranchMode: ctx.multiBranchMode,
        });
        setMultiBranchMode(ctx.multiBranchMode);
        setBranchLabels(ctx.branchLabels);
        setBranchOrder(ctx.branchOrder);
        setBranchIds(effective);
      } catch {
        if (!cancelled) {
          setMultiBranchMode(false);
          setBranchLabels(new Map());
          setBranchOrder([]);
          setBranchIds(undefined);
        }
      } finally {
        if (!cancelled) {
          setReady(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- never put db in hook deps
  }, [params.selectedBranchIds, user?.branch_ids]);

  const branchView: BranchView =
    multiBranchMode && params.branchView === "by_branch"
      ? "by_branch"
      : "combined";

  return {
    ready,
    branchIds,
    branchView,
    isByBranch: branchView === "by_branch",
    multiBranchMode,
    branchLabels,
    branchOrder,
  };
};
