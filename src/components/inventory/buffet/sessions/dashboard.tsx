import {useMemo, useState} from "react";
import {useTranslation} from "react-i18next";
import {toast} from "sonner";
import {useAtom} from "jotai";
import {useDB} from "@/api/db/db.ts";
import {appPage} from "@/store/jotai.ts";
import {Button} from "@/components/common/input/button.tsx";
import {Input} from "@/components/common/input/input.tsx";
import {useBuffetSession} from "@/hooks/useBuffetSession.ts";
import {BuffetSessionClosing} from "@/components/inventory/buffet/sessions/closing.tsx";
import {
  beginClosing,
  captureStockSnapshot,
  completeSessionProduction,
  generateProductionPlan,
  recordGuestCount,
  startBuffetSession,
} from "@/lib/inventory/buffet.service.ts";
import {recordToString} from "@/api/reports/shared/records.ts";
import {formatNumber} from "@/lib/utils.ts";
import classNames from "classnames";

interface Props {
  sessionId: string;
  onBack: () => void;
}

export const BuffetSessionDashboard = ({sessionId, onBack}: Props) => {
  const {t} = useTranslation("inventory");
  const db = useDB();
  const [state] = useAtom(appPage);
  const {session, loading, refresh} = useBuffetSession(sessionId);
  const [guestInput, setGuestInput] = useState("");
  const [showClosing, setShowClosing] = useState(false);
  const [busy, setBusy] = useState(false);

  const userId = recordToString(state?.user?.id);

  const productionRows = useMemo(
    () => session?.production_batches ?? [],
    [session?.production_batches]
  );

  const completedBatches = productionRows.filter((b) => b.status === "completed").length;
  const plannedBatches = productionRows.filter((b) => b.status === "planned").length;

  const runAction = async (action: () => Promise<void>, successKey: string) => {
    if (!userId) {
      toast.error(t("buffet.userRequired"));
      return;
    }
    setBusy(true);
    try {
      await action();
      toast.success(t(successKey));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
    void refresh();
  };

  if (loading && !session) {
    return <div className="p-6">{t("common:loading")}</div>;
  }

  if (!session) {
    return <div className="p-6">{t("buffet.sessionNotFound")}</div>;
  }

  if (showClosing || session.status === "closing") {
    return (
      <BuffetSessionClosing
        sessionId={sessionId}
        onBack={() => {
          setShowClosing(false);
          void refresh();
        }}
        onClosed={onBack}
      />
    );
  }

  const isClosed = session.status === "closed" || session.status === "voided";
  const canPlan = ["draft", "planned"].includes(session.status);
  const canProduce = session.status === "planned" && plannedBatches > 0;
  const canStart = session.status === "planned" && plannedBatches === 0 && completedBatches > 0;
  const inProgress = session.status === "in_progress";

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-start">
        <div>
          <Button variant="neutral" onClick={onBack}>
            {t("buffet.backToSessions")}
          </Button>
          <h2 className="text-2xl font-semibold mt-3">
            {session.session_number} — {session.menu?.name}
          </h2>
          <p className="text-neutral-600">
            {session.business_date} · {t(`buffet.sessionTypes.${session.session_type}`)} · {session.store?.name}
          </p>
        </div>
        <span className={classNames("tag text-sm", {
          "bg-info-100 text-info-800": session.status === "in_progress",
          "bg-success-100 text-success-800": session.status === "closed",
          "bg-neutral-100": !["in_progress", "closed"].includes(session.status),
        })}>
          {t(`buffet.statuses.${session.status}`)}
        </span>
      </div>

      <div className="grid grid-cols-4 gap-4">
        <div className="bg-neutral-50 rounded-lg p-4">
          <div className="text-sm text-neutral-500">{t("buffet.expectedGuests")}</div>
          <div className="text-2xl font-semibold">{session.expected_guests}</div>
        </div>
        <div className="bg-neutral-50 rounded-lg p-4">
          <div className="text-sm text-neutral-500">{t("buffet.actualGuests")}</div>
          <div className="text-2xl font-semibold">{session.actual_guests}</div>
        </div>
        <div className="bg-neutral-50 rounded-lg p-4">
          <div className="text-sm text-neutral-500">{t("buffet.buffetPrice")}</div>
          <div className="text-2xl font-semibold">{formatNumber(session.buffet_price)}</div>
        </div>
        <div className="bg-neutral-50 rounded-lg p-4">
          <div className="text-sm text-neutral-500">{t("buffet.projectedSales")}</div>
          <div className="text-2xl font-semibold">
            {formatNumber((session.actual_guests || session.expected_guests) * session.buffet_price)}
          </div>
        </div>
      </div>

      {!isClosed && (
        <div className="flex flex-wrap gap-2">
          {canPlan && (
            <Button
              variant="primary"
              isLoading={busy}
              onClick={() =>
                runAction(async () => {
                  await generateProductionPlan(db, sessionId);
                }, "buffet.planGenerated")
              }
            >
              {t("buffet.generatePlan")}
            </Button>
          )}
          {canProduce && (
            <Button
              variant="primary"
              isLoading={busy}
              onClick={() =>
                runAction(async () => {
                  await completeSessionProduction(db, sessionId, userId!);
                }, "buffet.productionCompleted")
              }
            >
              {t("buffet.runProduction")}
            </Button>
          )}
          {canStart && (
            <Button
              variant="primary"
              isLoading={busy}
              onClick={() =>
                runAction(async () => {
                  await startBuffetSession(db, sessionId);
                }, "buffet.sessionStarted")
              }
            >
              {t("buffet.startSession")}
            </Button>
          )}
          {inProgress && (
            <>
              <Button
                variant="secondary"
                isLoading={busy}
                onClick={() =>
                  runAction(async () => {
                    const menuItems = session.menu?.items ?? [];
                    for (const menuItem of menuItems) {
                      const recipe = menuItem.recipe;
                      const primary = recipe?.outputs?.find((o) => o.is_primary)
                        ?? recipe?.outputs?.[0];
                      const itemId = recordToString(primary?.item?.id ?? primary?.item);
                      if (itemId) {
                        await captureStockSnapshot(db, sessionId, itemId, "start", 0, userId!);
                      }
                    }
                  }, "buffet.startSnapshotCaptured")
                }
              >
                {t("buffet.captureStartStock")}
              </Button>
              <div className="flex items-end gap-2">
                <Input
                  label={t("buffet.recordGuests")}
                  type="number"
                  value={guestInput}
                  onChange={(e) => setGuestInput(e.target.value)}
                />
                <Button
                  variant="secondary"
                  isLoading={busy}
                  onClick={() =>
                    runAction(async () => {
                      await recordGuestCount(
                        db,
                        sessionId,
                        Number(guestInput),
                        "actual",
                        userId!
                      );
                      setGuestInput("");
                    }, "buffet.guestsRecorded")
                  }
                >
                  {t("buffet.saveGuests")}
                </Button>
              </div>
              <Button
                variant="warning"
                isLoading={busy}
                onClick={() =>
                  runAction(async () => {
                    await beginClosing(db, sessionId);
                    setShowClosing(true);
                  }, "buffet.closingStarted")
                }
              >
                {t("buffet.beginClosing")}
              </Button>
            </>
          )}
        </div>
      )}

      <div>
        <h3 className="text-lg font-semibold mb-3">{t("buffet.productionStatus")}</h3>
        <table className="table table-sm bg-white w-full">
          <thead>
            <tr>
              <th>{t("production.recipe")}</th>
              <th>{t("buffet.plannedQty")}</th>
              <th>{t("columns.status")}</th>
              <th>{t("production.batch")}</th>
            </tr>
          </thead>
          <tbody>
            {productionRows.length === 0 ? (
              <tr>
                <td colSpan={4} className="text-center text-neutral-500 py-4">
                  {t("buffet.noProductionPlan")}
                </td>
              </tr>
            ) : (
              productionRows.map((row) => (
                <tr key={row.id}>
                  <td>{row.menu_item?.recipe?.name ?? ""}</td>
                  <td>{row.planned_qty}</td>
                  <td>{t(`buffet.batchStatuses.${row.status}`)}</td>
                  <td>{row.production_batch?.batch_number ?? "—"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {(session.snapshots?.length ?? 0) > 0 && (
        <div>
          <h3 className="text-lg font-semibold mb-3">{t("buffet.stockSnapshots")}</h3>
          <table className="table table-sm bg-white w-full">
            <thead>
              <tr>
                <th>{t("buttons.item")}</th>
                <th>{t("buffet.snapshotType")}</th>
                <th>{t("forms.quantity")}</th>
              </tr>
            </thead>
            <tbody>
              {session.snapshots?.map((snap) => (
                <tr key={snap.id}>
                  <td>{snap.item?.name}</td>
                  <td>{t(`buffet.snapshotTypes.${snap.snapshot_type}`)}</td>
                  <td>{snap.quantity}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
