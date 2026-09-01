import {Fragment, useEffect, useState} from "react";
import {useTranslation} from "react-i18next";
import {useAtom} from "jotai";
import {PayrollSnapshot} from "@/api/model/payroll_snapshot.ts";
import {PayrollRun} from "@/api/model/payroll_run.ts";
import {Tables} from "@/api/db/tables.ts";
import {useDB} from "@/api/db/db.ts";
import {Modal} from "@/components/common/react-aria/modal.tsx";
import {Button} from "@/components/common/input/button.tsx";
import {Input} from "@/components/common/input/input.tsx";
import {DeleteConfirm} from "@/components/common/table/delete.confirm.tsx";
import {safeNumber, toRecordId, withCurrency} from "@/lib/utils.ts";
import {toast} from "sonner";
import {enumLocaleKey} from "@/components/hr/shared/form.utils.ts";
import {appPage} from "@/store/jotai.ts";
import {recalculateRun} from "@/lib/labor-engine/payroll/run.service.ts";
import {updateSnapshotOverride} from "@/lib/labor-engine/payroll/snapshot.service.ts";

interface Props {
  open: boolean;
  onClose: () => void;
  run?: PayrollRun;
  onChanged?: () => void;
}

interface SnapshotDraft {
  paid_days: number;
  regular_pay: number;
  overtime_pay: number;
  deductions: number;
  override_note: string;
}

const toDraft = (snapshot: PayrollSnapshot): SnapshotDraft => ({
  paid_days: safeNumber(snapshot.paid_days),
  regular_pay: safeNumber(snapshot.regular_pay),
  overtime_pay: safeNumber(snapshot.overtime_pay),
  deductions: safeNumber(snapshot.deductions),
  override_note: snapshot.override_note ?? "",
});

export const PayrollRunSnapshots = ({open, onClose, run, onChanged}: Props) => {
  const {t} = useTranslation("hr");
  const db = useDB();
  const [page] = useAtom(appPage);
  const [snapshots, setSnapshots] = useState<PayrollSnapshot[]>([]);
  const [loading, setLoading] = useState(false);
  const [savingId, setSavingId] = useState<string>();
  const [expandedId, setExpandedId] = useState<string>();
  const [drafts, setDrafts] = useState<Record<string, SnapshotDraft>>({});

  const canEdit = run?.status === "preview";

  const loadSnapshots = async () => {
    if (!run?.id) {
      setSnapshots([]);
      return;
    }
    setLoading(true);
    try {
      const [rows] = await db.query<[PayrollSnapshot[]]>(
        `SELECT * FROM ${Tables.payroll_snapshots}
         WHERE payroll_run = $runId
         FETCH employee, overridden_by`,
        {runId: toRecordId(run.id)},
      );
      const sorted = [...(rows ?? [])].sort((a, b) => {
        const left = a.employee?.employee_number ?? "";
        const right = b.employee?.employee_number ?? "";
        return String(left).localeCompare(String(right));
      });
      setSnapshots(sorted);
      setDrafts(Object.fromEntries(sorted.map((snapshot) => [snapshot.id, toDraft(snapshot)])));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
      setSnapshots([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!open || !run?.id) {
      setSnapshots([]);
      setExpandedId(undefined);
      setDrafts({});
      return;
    }

    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const [rows] = await db.query<[PayrollSnapshot[]]>(
          `SELECT * FROM ${Tables.payroll_snapshots}
           WHERE payroll_run = $runId
           FETCH employee, overridden_by`,
          {runId: toRecordId(run.id)},
        );
        if (!cancelled) {
          const sorted = [...(rows ?? [])].sort((a, b) => {
            const left = a.employee?.employee_number ?? "";
            const right = b.employee?.employee_number ?? "";
            return String(left).localeCompare(String(right));
          });
          setSnapshots(sorted);
          setDrafts(Object.fromEntries(sorted.map((snapshot) => [snapshot.id, toDraft(snapshot)])));
        }
      } catch (error) {
        if (!cancelled) {
          toast.error(error instanceof Error ? error.message : String(error));
          setSnapshots([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [open, run?.id]);

  const employeeLabel = (snapshot: PayrollSnapshot) => {
    const employee = snapshot.employee;
    if (!employee) return "";
    return `${employee.employee_number ?? ""} — ${employee.first_name ?? ""} ${employee.last_name ?? ""}`.trim();
  };

  const payTypeLabel = (snapshot: PayrollSnapshot) => {
    const value = snapshot.pay_type;
    if (!value) return "—";
    return t(`employmentTypes.${enumLocaleKey(value)}`, {defaultValue: value});
  };

  const updateDraft = (snapshotId: string, patch: Partial<SnapshotDraft>) => {
    setDrafts((current) => ({
      ...current,
      [snapshotId]: {...(current[snapshotId] ?? toDraft(snapshots.find(s => s.id === snapshotId)!)), ...patch},
    }));
  };

  const saveOverride = async (snapshot: PayrollSnapshot) => {
    if (!page.user) {
      toast.error(t("messages.requiredFields"));
      return;
    }
    const draft = drafts[snapshot.id] ?? toDraft(snapshot);
    setSavingId(snapshot.id);
    try {
      await updateSnapshotOverride(db, {
        snapshotId: snapshot.id,
        paidDays: Number(draft.paid_days),
        regularPay: Number(draft.regular_pay),
        overtimePay: Number(draft.overtime_pay),
        deductions: Number(draft.deductions),
        overrideNote: draft.override_note,
        overriddenBy: page.user,
      });
      toast.success(t("payroll.saveOverride"));
      await loadSnapshots();
      onChanged?.();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setSavingId(undefined);
    }
  };

  const resetOverrides = async () => {
    if (!run?.id || !page.user) {
      toast.error(t("messages.requiredFields"));
      return;
    }
    setLoading(true);
    try {
      await recalculateRun(db, {
        runId: run.id,
        recalculatedBy: page.user,
        resetOverrides: true,
      });
      toast.success(t("payroll.resetOverrides"));
      await loadSnapshots();
      onChanged?.();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      title={`${t("buttons.view")} — ${t("columns.runNumber")} ${run?.run_number ?? ""}`}
      open={open}
      onClose={onClose}
      size="xl"
    >
      {canEdit && snapshots.length > 0 && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-neutral-600">{t("payroll.overrideHelp")}</p>
          <DeleteConfirm
            title={t("payroll.resetOverrides")}
            message={t("payroll.confirmResetOverrides")}
            onConfirm={() => void resetOverrides()}
          >
            <Button variant="warning" size="sm">{t("payroll.resetOverrides")}</Button>
          </DeleteConfirm>
        </div>
      )}
      {loading ? (
        <p className="text-sm text-neutral-600">{t("buttons.loading")}</p>
      ) : snapshots.length === 0 ? (
        <p className="text-sm text-neutral-600">{t("payroll.noRuns")}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-neutral-200">
            <thead>
              <tr className="text-left text-xs font-semibold uppercase text-neutral-600">
                <th className="px-3 py-2">{t("forms.adjustment.employee")}</th>
                <th className="px-3 py-2">{t("payroll.payType")}</th>
                <th className="px-3 py-2 text-right">{t("payroll.paidDays")}</th>
                <th className="px-3 py-2 text-right">{t("columns.hours")}</th>
                <th className="px-3 py-2 text-right">{t("payroll.grossPay")}</th>
                <th className="px-3 py-2 text-right">{t("payroll.netPay")}</th>
                <th className="px-3 py-2">{t("forms.payRule.effects")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {snapshots.map((snapshot) => {
                const hours =
                  (snapshot.regular_hours ?? 0) +
                  (snapshot.overtime_hours ?? 0) +
                  (snapshot.double_time_hours ?? 0);
                const apps = snapshot.rule_applications ?? [];
                const expanded = expandedId === snapshot.id;
                const draft = drafts[snapshot.id] ?? toDraft(snapshot);
                return (
                  <Fragment key={snapshot.id}>
                    <tr>
                      <td className="px-3 py-2 text-sm">
                        <button
                          type="button"
                          className="text-left text-primary-700 underline"
                          onClick={() => setExpandedId(expanded ? undefined : snapshot.id)}
                        >
                          {employeeLabel(snapshot)}
                        </button>
                        {snapshot.is_overridden && (
                          <span className="ml-2 rounded bg-warning-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-warning-800">
                            {t("payroll.overridden")}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-sm">{payTypeLabel(snapshot)}</td>
                      <td className="px-3 py-2 text-sm text-right">{safeNumber(snapshot.paid_days).toFixed(0)}</td>
                      <td className="px-3 py-2 text-sm text-right">{hours.toFixed(2)}</td>
                      <td className="px-3 py-2 text-sm text-right">{withCurrency(snapshot.gross_pay ?? 0)}</td>
                      <td className="px-3 py-2 text-sm text-right">{withCurrency(snapshot.net_pay ?? 0)}</td>
                      <td className="px-3 py-2 text-sm">
                        {apps.length === 0 ? (
                          "—"
                        ) : (
                          <button
                            type="button"
                            className="text-primary-700 underline"
                            onClick={() => setExpandedId(expanded ? undefined : snapshot.id)}
                          >
                            {apps.length} {t("forms.payRule.effects").toLowerCase()}
                          </button>
                        )}
                      </td>
                    </tr>
                    {expanded && (
                      <tr>
                        <td colSpan={7} className="px-3 py-3 bg-neutral-50">
                          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                            <div>
                              <Input
                                type="number"
                                step="1"
                                decimalScale={0}
                                name={`paid_days_${snapshot.id}`}
                                label={t("payroll.paidDays")}
                                value={draft.paid_days}
                                onChange={(event) => updateDraft(snapshot.id, {paid_days: Number(event.target.value)})}
                                disabled={!canEdit}
                                allowNegative={false}
                              />
                            </div>
                            <div>
                              <Input
                                type="number"
                                step="0.01"
                                decimalScale={2}
                                name={`regular_pay_${snapshot.id}`}
                                label={t("payroll.regularPay")}
                                value={draft.regular_pay}
                                onChange={(event) => updateDraft(snapshot.id, {regular_pay: Number(event.target.value)})}
                                disabled={!canEdit}
                                allowNegative
                              />
                            </div>
                            <div>
                              <Input
                                type="number"
                                step="0.01"
                                decimalScale={2}
                                name={`overtime_pay_${snapshot.id}`}
                                label={t("payroll.overtimePay")}
                                value={draft.overtime_pay}
                                onChange={(event) => updateDraft(snapshot.id, {overtime_pay: Number(event.target.value)})}
                                disabled={!canEdit}
                                allowNegative
                              />
                            </div>
                            <div>
                              <Input
                                type="number"
                                step="0.01"
                                decimalScale={2}
                                name={`deductions_${snapshot.id}`}
                                label={t("payroll.deductions")}
                                value={draft.deductions}
                                onChange={(event) => updateDraft(snapshot.id, {deductions: Number(event.target.value)})}
                                disabled={!canEdit}
                                allowNegative={false}
                              />
                            </div>
                          </div>
                          <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                            <p>{t("payroll.unpaidLeaveDays")}: {safeNumber(snapshot.unpaid_leave_days).toFixed(0)}</p>
                            <p>{t("payroll.expectedWorkDays")}: {snapshot.expected_work_days ?? "—"}</p>
                            <p>{t("payroll.bonuses")}: {withCurrency(snapshot.bonuses ?? 0)}</p>
                            <p>{t("tabs.adjustments")}: {withCurrency(snapshot.adjustments ?? 0)}</p>
                          </div>
                          <div className="mt-3">
                            <Input
                              name={`override_note_${snapshot.id}`}
                              label={t("payroll.overrideNote")}
                              value={draft.override_note}
                              onChange={(event) => updateDraft(snapshot.id, {override_note: event.target.value})}
                              disabled={!canEdit}
                            />
                          </div>
                          {canEdit && (
                            <div className="mt-3">
                              <Button
                                variant="primary"
                                size="sm"
                                disabled={savingId === snapshot.id}
                                onClick={() => void saveOverride(snapshot)}
                              >
                                {t("payroll.saveOverride")}
                              </Button>
                            </div>
                          )}
                          {apps.length > 0 && (
                            <ul className="text-sm space-y-1 mt-3">
                              {apps.map((app, idx) => (
                                <li key={`${snapshot.id}-app-${idx}`} className="flex justify-between gap-4">
                                  <span>
                                    {app.rule_name}
                                    {app.effect?.type
                                      ? ` (${t(`effectTypes.${enumLocaleKey(app.effect.type)}`, {defaultValue: app.effect.type})})`
                                      : ""}
                                  </span>
                                  <span className="font-medium">{withCurrency(app.amount ?? 0)}</span>
                                </li>
                              ))}
                            </ul>
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Modal>
  );
};
