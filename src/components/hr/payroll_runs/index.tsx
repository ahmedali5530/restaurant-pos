import {useState} from "react";
import {useTranslation} from "react-i18next";
import {createColumnHelper} from "@tanstack/react-table";
import * as XLSX from "xlsx";
import useApi, {SettingsData} from "@/api/db/use.api.ts";
import {Tables} from "@/api/db/tables.ts";
import {PayrollRun} from "@/api/model/payroll_run.ts";
import {TableComponent} from "@/components/common/table/table.tsx";
import {Button} from "@/components/common/input/button.tsx";
import {faPlus} from "@fortawesome/free-solid-svg-icons";
import {formatDisplayDate} from "@/components/hr/shared/form.utils.ts";
import {useDB} from "@/api/db/db.ts";
import {useAtom} from "jotai";
import {appPage} from "@/store/jotai.ts";
import {toast} from "sonner";
import {
  approveRun,
  exportRun,
  lockRun,
  recalculateRun,
} from "@/lib/labor-engine/payroll/run.service.ts";
import {PayrollRunForm} from "@/components/hr/payroll_runs/run.form.tsx";
import {PayrollRunSnapshots} from "@/components/hr/payroll_runs/snapshots.modal.tsx";
import {useIntegrationManager} from "@/providers/integration.provider.tsx";

export const HrPayrollRuns = () => {
  const {t} = useTranslation("hr");
  const db = useDB();
  const [page] = useAtom(appPage);
  const {manager: integrationManager} = useIntegrationManager();
  const loadHook = useApi<SettingsData<PayrollRun>>(
    Tables.payroll_runs,
    [],
    ["generated_at DESC"],
    0,
    10,
    ["payroll_period", "generated_by", "approved_by"],
  );

  const [busyId, setBusyId] = useState<string>();
  const [runFormOpen, setRunFormOpen] = useState(false);
  const [viewRun, setViewRun] = useState<PayrollRun>();
  const [snapshotsOpen, setSnapshotsOpen] = useState(false);

  const columnHelper = createColumnHelper<PayrollRun>();

  const runAction = async (run: PayrollRun, action: "refresh" | "lock" | "approve" | "export") => {
    if (!page.user) {
      toast.error(t("messages.requiredFields"));
      return;
    }
    setBusyId(run.id);
    try {
      if (action === "refresh") {
        await recalculateRun(db, {runId: run.id, recalculatedBy: page.user});
        toast.success(t("messages.payrollRefreshed"));
        setViewRun(run);
        setSnapshotsOpen(true);
      } else if (action === "lock") {
        await lockRun(db, {runId: run.id, lockedBy: page.user});
        toast.success(t("payroll.lock"));
      } else if (action === "approve") {
        await approveRun(db, {
          runId: run.id,
          approvedBy: page.user,
          integrationManager,
        });
        toast.success(t("payroll.approve"));
      } else {
        const {rows} = await exportRun(db, {runId: run.id, exportedBy: page.user});
        const ws = XLSX.utils.json_to_sheet(rows);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Payroll");
        XLSX.writeFile(wb, `payroll-run-${run.run_number ?? run.id}.xlsx`);
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
        const status = row.status ?? "draft";
        const canRefresh = status === "draft" || status === "preview";
        const canLock = status === "preview";
        const canApprove = status === "locked";
        const canExport = status === "approved";

        return (
          <div className="flex flex-wrap gap-2">
            <Button
              variant="neutral"
              size="sm"
              disabled={disabled}
              onClick={() => {
                setViewRun(row);
                setSnapshotsOpen(true);
              }}
            >
              {t("buttons.view")}
            </Button>
            <Button
              variant="neutral"
              size="sm"
              disabled={disabled || !canRefresh}
              onClick={() => void runAction(row, "refresh")}
            >
              {t("buttons.refresh")}
            </Button>
            <Button
              variant="warning"
              size="sm"
              disabled={disabled || !canLock}
              onClick={() => void runAction(row, "lock")}
            >
              {t("buttons.lock")}
            </Button>
            <Button
              variant="success"
              size="sm"
              disabled={disabled || !canApprove}
              onClick={() => void runAction(row, "approve")}
            >
              {t("buttons.approve")}
            </Button>
            <Button
              variant="primary"
              size="sm"
              disabled={disabled || !canExport}
              onClick={() => void runAction(row, "export")}
            >
              {t("buttons.export")}
            </Button>
          </div>
        );
      },
    }),
  ];

  return (
    <>
      <TableComponent
        columns={columns}
        loaderHook={loadHook}
        loaderLineItems={columns.length}
        buttons={[
          <Button
            key="run-payroll"
            variant="primary"
            data-testid="hr-add-payroll-runs"
            onClick={() => setRunFormOpen(true)}
            icon={faPlus}
          >
            {t("buttons.runPayroll")}
          </Button>,
        ]}
      />
      <PayrollRunForm
        open={runFormOpen}
        onClose={() => setRunFormOpen(false)}
        onSuccess={() => loadHook.fetchData()}
      />
      <PayrollRunSnapshots
        open={snapshotsOpen}
        onClose={() => {
          setSnapshotsOpen(false);
          setViewRun(undefined);
        }}
        run={viewRun}
      />
    </>
  );
};
