import {useEffect, useMemo, useState} from "react";
import {useTranslation} from "react-i18next";
import {toast} from "sonner";
import {useAtom} from "jotai";
import {useDB} from "@/api/db/db.ts";
import {appPage} from "@/store/jotai.ts";
import {Button} from "@/components/common/input/button.tsx";
import {Input} from "@/components/common/input/input.tsx";
import {useBuffetSession} from "@/hooks/useBuffetSession.ts";
import {
  closeBuffetSession,
  computeSessionClosing,
  saveClosingInputs,
} from "@/lib/inventory/buffet.service.ts";
import {recordToString} from "@/api/reports/shared/records.ts";
import {formatNumber} from "@/lib/utils.ts";
import classNames from "classnames";

interface ClosingRowState {
  itemId: string;
  itemName: string;
  producedQty: number;
  startQty: number;
  leftoverQty: string;
  wasteQty: string;
  staffMealQty: string;
}

interface Props {
  sessionId: string;
  onBack: () => void;
  onClosed: () => void;
}

export const BuffetSessionClosing = ({sessionId, onBack, onClosed}: Props) => {
  const {t} = useTranslation("inventory");
  const db = useDB();
  const [state] = useAtom(appPage);
  const {session, closingLines, analytics, loading, refresh} = useBuffetSession(sessionId);
  const [rows, setRows] = useState<ClosingRowState[]>([]);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState(closingLines);

  const userId = recordToString(state?.user?.id);

  useEffect(() => {
    if (closingLines.length > 0) {
      setPreview(closingLines);
      setRows(
        closingLines.map((line) => ({
          itemId: line.itemId,
          itemName: line.itemName ?? line.itemId,
          producedQty: line.producedQty + line.refillQty,
          startQty: line.startQty,
          leftoverQty: line.endQty != null ? String(line.endQty) : "",
          wasteQty: String(line.wasteQty),
          staffMealQty: String(line.staffMealQty),
        }))
      );
    }
  }, [closingLines]);

  const updateRow = (itemId: string, field: keyof ClosingRowState, value: string) => {
    setRows((prev) =>
      prev.map((row) => (row.itemId === itemId ? {...row, [field]: value} : row))
    );
  };

  const handleSave = async () => {
    if (!userId) {
      toast.error(t("buffet.userRequired"));
      return;
    }
    setBusy(true);
    try {
      await saveClosingInputs(
        db,
        sessionId,
        rows.map((row) => ({
          itemId: row.itemId,
          leftoverQty: Number(row.leftoverQty) || 0,
          wasteQty: Number(row.wasteQty) || 0,
          staffMealQty: Number(row.staffMealQty) || 0,
        })),
        userId
      );
      const computed = await computeSessionClosing(db, sessionId);
      setPreview(computed.lines);
      toast.success(t("buffet.closingSaved"));
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const handleClose = async () => {
    if (!userId) return;
    if (!confirm(t("buffet.confirmClose"))) return;

    setBusy(true);
    try {
      await saveClosingInputs(
        db,
        sessionId,
        rows.map((row) => ({
          itemId: row.itemId,
          leftoverQty: Number(row.leftoverQty) || 0,
          wasteQty: Number(row.wasteQty) || 0,
          staffMealQty: Number(row.staffMealQty) || 0,
        })),
        userId
      );
      await closeBuffetSession(db, sessionId, userId);
      toast.success(t("buffet.sessionClosed"));
      onClosed();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const summary = useMemo(() => analytics, [analytics]);

  if (loading && !session) {
    return <div className="p-6">{t("common:loading")}</div>;
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <Button variant="neutral" onClick={onBack}>
            {t("buffet.backToDashboard")}
          </Button>
          <h2 className="text-2xl font-semibold mt-3">{t("buffet.closingTitle")}</h2>
          <p className="text-neutral-600">{session?.session_number}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" isLoading={busy} onClick={handleSave}>
            {t("buffet.saveClosing")}
          </Button>
          <Button variant="primary" isLoading={busy} onClick={handleClose}>
            {t("buffet.closeSession")}
          </Button>
        </div>
      </div>

      {summary && (
        <div className="grid grid-cols-4 gap-4">
          <div className="bg-neutral-50 rounded-lg p-4">
            <div className="text-sm text-neutral-500">{t("buffet.totalFoodCost")}</div>
            <div className="text-xl font-semibold">{formatNumber(summary.totalFoodCost)}</div>
          </div>
          <div className="bg-neutral-50 rounded-lg p-4">
            <div className="text-sm text-neutral-500">{t("buffet.costPerGuest")}</div>
            <div className="text-xl font-semibold">{formatNumber(summary.costPerGuest)}</div>
          </div>
          <div className="bg-neutral-50 rounded-lg p-4">
            <div className="text-sm text-neutral-500">{t("buffet.wastePercent")}</div>
            <div className="text-xl font-semibold">{summary.wastePercent}%</div>
          </div>
          <div className="bg-neutral-50 rounded-lg p-4">
            <div className="text-sm text-neutral-500">{t("buffet.profit")}</div>
            <div className={classNames("text-xl font-semibold", summary.profit >= 0 ? "text-success-700" : "text-danger-700")}>
              {formatNumber(summary.profit)}
            </div>
          </div>
        </div>
      )}

      <table className="table table-sm bg-white w-full">
        <thead>
          <tr>
            <th>{t("buttons.item")}</th>
            <th>{t("buffet.produced")}</th>
            <th>{t("buffet.startStock")}</th>
            <th>{t("buffet.leftover")}</th>
            <th>{t("buffet.waste")}</th>
            <th>{t("buffet.staffMeals")}</th>
            <th>{t("buffet.guestConsumption")}</th>
            <th>{t("buffet.variance")}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const computed = preview.find((l) => l.itemId === row.itemId);
            return (
              <tr key={row.itemId}>
                <td>{row.itemName}</td>
                <td>{row.producedQty}</td>
                <td>{row.startQty}</td>
                <td>
                  <Input
                    type="number"
                    step="0.01"
                    value={row.leftoverQty}
                    onChange={(e) => updateRow(row.itemId, "leftoverQty", e.target.value)}
                  />
                </td>
                <td>
                  <Input
                    type="number"
                    step="0.01"
                    value={row.wasteQty}
                    onChange={(e) => updateRow(row.itemId, "wasteQty", e.target.value)}
                  />
                </td>
                <td>
                  <Input
                    type="number"
                    step="0.01"
                    value={row.staffMealQty}
                    onChange={(e) => updateRow(row.itemId, "staffMealQty", e.target.value)}
                  />
                </td>
                <td>{computed?.guestConsumption ?? "—"}</td>
                <td className={classNames(
                  computed && Math.abs(computed.varianceQty) > 0.01
                    ? computed.varianceQty > 0 ? "text-warning-700" : "text-info-700"
                    : ""
                )}>
                  {computed?.varianceQty ?? "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};
