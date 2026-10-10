import {useEffect, useMemo, useState} from "react";
import {useAtom} from "jotai";
import {useTranslation} from "react-i18next";
import {useDB} from "@/api/db/db.ts";
import {loadReportBranchContext} from "@/api/reports/shared/branch-scope.ts";
import {ReactSelect} from "@/components/common/input/custom.react.select.tsx";
import {Radio} from "@/components/common/input/radio.tsx";
import {appPage} from "@/store/jotai.ts";

type Option = {label: string; value: string};

/**
 * HQ multi-branch report scope. Hidden unless there are 2+ visible sync
 * branches AND cloud-stamped FOH rows (branch_id). Catalog-only sync_branch
 * registries without sales stamps must not activate this filter — otherwise
 * branch_id INSIDE … matches nothing and every report is empty.
 */
export const BranchScopeFilter = () => {
  const {t} = useTranslation("reports");
  const db = useDB();
  const [{user}] = useAtom(appPage);
  const [options, setOptions] = useState<Option[]>([]);
  const [multiBranchMode, setMultiBranchMode] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        const ctx = await loadReportBranchContext(db, user?.branch_ids);
        if (cancelled) return;
        setMultiBranchMode(ctx.multiBranchMode);
        setOptions(
          ctx.visible.map((b) => ({
            value: b.client_id,
            label: b.name ? `${b.name} (${b.client_id})` : b.client_id,
          })),
        );
      } catch {
        if (!cancelled) {
          setOptions([]);
          setMultiBranchMode(false);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- never put db in hook deps
  }, [user?.branch_ids, t]);

  const show = !loading && multiBranchMode;

  const defaultView = useMemo(() => "combined", []);

  if (!show) {
    return null;
  }

  return (
    <div className="w-full flex flex-col gap-4" data-testid="branch-scope-filter">
      <div className="flex flex-col gap-2">
        <label htmlFor="report-branches" className="form-label">
          {t("filters.branches")}
        </label>
        <div>
          <ReactSelect
            id="report-branches"
            name="branches[]"
            isMulti
            isClearable
            className="w-full"
            options={options}
            placeholder={t("filters.branchesAll")}
          />
        </div>
        <p className="text-xs text-muted">{t("filters.branchesHelp")}</p>
      </div>

      <div className="flex flex-col gap-2">
        <span className="form-label">{t("filters.branchView")}</span>
        <div className="flex flex-wrap gap-4">
          <div>
            <Radio
              name="branchView"
              value="combined"
              defaultChecked={defaultView === "combined"}
              label={t("filters.branchViewCombined")}
            />
          </div>
          <div>
            <Radio
              name="branchView"
              value="by_branch"
              label={t("filters.branchViewByBranch")}
            />
          </div>
        </div>
      </div>
    </div>
  );
};
