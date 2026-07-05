import {useState} from "react";
import {useTranslation} from "react-i18next";
import {createColumnHelper} from "@tanstack/react-table";
import useApi, {SettingsData} from "@/api/db/use.api.ts";
import {Tables} from "@/api/db/tables.ts";
import {PayrollRun} from "@/api/model/payroll_run.ts";
import {TableComponent} from "@/components/common/table/table.tsx";
import {Button} from "@/components/common/input/button.tsx";
import {formatDisplayDate} from "@/components/hr/shared/form.utils.ts";
import {useDB} from "@/api/db/db.ts";
import {useAtom} from "jotai";
import {appPage} from "@/store/jotai.ts";
import {toast} from "sonner";
import {
  approveRun,
  exportRun,
  generatePreview,
  lockRun,
} from "@/lib/labor-engine/payroll/run.service.ts";

export const HrPayrollRuns = () => {
  const {t} = useTranslation("hr");
  const db = useDB();
  const [page] = useAtom(appPage);
  const loadHook = useApi<SettingsData<PayrollRun>>(
    Tables.payroll_runs,
    [],
    ["generated_at DESC"],
    0,
    10,
    ["payroll_period", "generated_by", "approved_by"],
  );

  const [busyId, setBusyId] = useState<string>();

  const columnHelper = createColumnHelper<PayrollRun>();

  const runAction = async (run: PayrollRun, action: "preview" | "lock" | "approve" | "export") => {
    if (!page.user) {
      toast.error(t("messages.requiredFields"));
      return;
    }
    setBusyId(run.id);
    try {
      if (action === "preview") {
        await generatePreview(db, {
          payrollPeriodId: String(run.payroll_period?.id ?? run.payroll_period),
          generatedBy: page.user,
          runNumber: run.run_number,
        });
        toast.success(t("messages.payrollGenerated"));
      } else if (action === "lock") {
        await lockRun(db, {runId: run.id, lockedBy: page.user});
        toast.success(t("payroll.lock"));
      } else if (action === "approve") {
        await approveRun(db, {runId: run.id, approvedBy: page.user});
        toast.success(t("payroll.approve"));
      } else {
        await exportRun(db, {runId: run.id, exportedBy: page.user});
        toast.success(t("payroll.export"));
      }
      loadHook.fetchData();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setBusyId(undefined);
    }
  };

  const columns: any = [
    columnHelper.accessor("run_number", {header: t("columns.runNumber")}),
    columnHelper.accessor((row) => row.payroll_period?.name ?? "", {
      id: "period",
      header: t("tabs.payrollPeriods"),
    }),
    columnHelper.accessor("status", {
      header: t("columns.status"),
      cell: (info) => {
        const value = info.getValue();
        return value ? t(`status.payroll.${value}`, {defaultValue: value}) : "";
      },
    }),
    columnHelper.accessor("generated_at", {
      header: t("columns.generatedAt"),
      cell: (info) => formatDisplayDate(info.getValue()),
    }),
    columnHelper.accessor("id", {
      id: "actions",
      header: t("columns.actions"),
      enableSorting: false,
      enableColumnFilter: false,
      cell: (info) => {
        const row = info.row.original;
        const disabled = busyId === row.id;
        return (
          <div className="flex flex-wrap gap-2">
            <Button variant="neutral" size="sm" disabled={disabled} onClick={() => void runAction(row, "preview")}>
              {t("buttons.preview")}
            </Button>
            <Button variant="warning" size="sm" disabled={disabled} onClick={() => void runAction(row, "lock")}>
              {t("buttons.lock")}
            </Button>
            <Button variant="success" size="sm" disabled={disabled} onClick={() => void runAction(row, "approve")}>
              {t("buttons.approve")}
            </Button>
            <Button variant="primary" size="sm" disabled={disabled} onClick={() => void runAction(row, "export")}>
              {t("buttons.export")}
            </Button>
          </div>
        );
      },
    }),
  ];

  return (
    <TableComponent columns={columns} loaderHook={loadHook} loaderLineItems={columns.length}/>
  );
};
