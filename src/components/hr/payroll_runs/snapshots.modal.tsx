import {Fragment, useEffect, useState} from "react";
import {useTranslation} from "react-i18next";
import {PayrollSnapshot} from "@/api/model/payroll_snapshot.ts";
import {PayrollRun} from "@/api/model/payroll_run.ts";
import {Tables} from "@/api/db/tables.ts";
import {useDB} from "@/api/db/db.ts";
import {Modal} from "@/components/common/react-aria/modal.tsx";
import {withCurrency} from "@/lib/utils.ts";
import {toast} from "sonner";
import {enumLocaleKey} from "@/components/hr/shared/form.utils.ts";

interface Props {
  open: boolean;
  onClose: () => void;
  run?: PayrollRun;
}

export const PayrollRunSnapshots = ({open, onClose, run}: Props) => {
  const {t} = useTranslation("hr");
  const db = useDB();
  const [snapshots, setSnapshots] = useState<PayrollSnapshot[]>([]);
  const [loading, setLoading] = useState(false);
  const [expandedId, setExpandedId] = useState<string>();

  useEffect(() => {
    if (!open || !run?.id) {
      setSnapshots([]);
      setExpandedId(undefined);
      return;
    }

    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const [rows] = await db.query<PayrollSnapshot[]>(
          `SELECT * FROM ${Tables.payroll_snapshots}
           WHERE payroll_run = $runId
           FETCH employee`,
          {runId: run.id},
        );
        if (!cancelled) {
          const sorted = [...(rows ?? [])].sort((a, b) => {
            const left = a.employee?.employee_number ?? "";
            const right = b.employee?.employee_number ?? "";
            return String(left).localeCompare(String(right));
          });
          setSnapshots(sorted);
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

  return (
    <Modal
      title={`${t("buttons.view")} — ${t("columns.runNumber")} ${run?.run_number ?? ""}`}
      open={open}
      onClose={onClose}
      size="xl"
    >
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
                <th className="px-3 py-2 text-right">{t("columns.hours")}</th>
                <th className="px-3 py-2 text-right">{t("payroll.grossPay")}</th>
                <th className="px-3 py-2 text-right">{t("payroll.bonuses")}</th>
                <th className="px-3 py-2 text-right">{t("payroll.deductions")}</th>
                <th className="px-3 py-2 text-right">{t("tabs.adjustments")}</th>
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
                return (
                  <Fragment key={snapshot.id}>
                    <tr>
                      <td className="px-3 py-2 text-sm">{employeeLabel(snapshot)}</td>
                      <td className="px-3 py-2 text-sm text-right">{hours.toFixed(2)}</td>
                      <td className="px-3 py-2 text-sm text-right">{withCurrency(snapshot.gross_pay ?? 0)}</td>
                      <td className="px-3 py-2 text-sm text-right">{withCurrency(snapshot.bonuses ?? 0)}</td>
                      <td className="px-3 py-2 text-sm text-right">{withCurrency(snapshot.deductions ?? 0)}</td>
                      <td className="px-3 py-2 text-sm text-right">{withCurrency(snapshot.adjustments ?? 0)}</td>
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
                    {expanded && apps.length > 0 && (
                      <tr>
                        <td colSpan={8} className="px-3 py-2 bg-neutral-50">
                          <ul className="text-sm space-y-1">
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
