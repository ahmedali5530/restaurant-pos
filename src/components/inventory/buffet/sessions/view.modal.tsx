import {useTranslation} from "react-i18next";
import {Modal} from "@/components/common/react-aria/modal.tsx";
import {useBuffetSession} from "@/hooks/useBuffetSession.ts";
import {formatNumber} from "@/lib/utils.ts";

interface Props {
  sessionId: string;
  open: boolean;
  onClose: () => void;
}

export const BuffetSessionViewModal = ({sessionId, open, onClose}: Props) => {
  const {t} = useTranslation("inventory");
  const {session, closingLines, analytics, loading} = useBuffetSession(sessionId);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={session ? `${session.session_number} — ${t("buffet.sessionSummary")}` : t("buffet.sessionSummary")}
      size="full"
    >
      {loading && <div>{t("common:loading")}</div>}

      {session && (
        <div className="space-y-6">
          <div className="grid grid-cols-4 gap-4">
            <div>
              <div className="text-sm text-neutral-500">{t("buffet.businessDate")}</div>
              <div className="font-medium">{session.business_date}</div>
            </div>
            <div>
              <div className="text-sm text-neutral-500">{t("columns.store")}</div>
              <div className="font-medium">{session.store?.name}</div>
            </div>
            <div>
              <div className="text-sm text-neutral-500">{t("buffet.actualGuests")}</div>
              <div className="font-medium">{session.actual_guests}</div>
            </div>
            <div>
              <div className="text-sm text-neutral-500">{t("buffet.buffetPrice")}</div>
              <div className="font-medium">{formatNumber(session.buffet_price)}</div>
            </div>
          </div>

          {analytics && (
            <div className="grid grid-cols-5 gap-4 bg-neutral-50 rounded-lg p-4">
              <div>
                <div className="text-sm text-neutral-500">{t("buffet.totalSales")}</div>
                <div className="text-lg font-semibold">{formatNumber(analytics.totalSales)}</div>
              </div>
              <div>
                <div className="text-sm text-neutral-500">{t("buffet.totalFoodCost")}</div>
                <div className="text-lg font-semibold">{formatNumber(analytics.totalFoodCost)}</div>
              </div>
              <div>
                <div className="text-sm text-neutral-500">{t("buffet.costPerGuest")}</div>
                <div className="text-lg font-semibold">{formatNumber(analytics.costPerGuest)}</div>
              </div>
              <div>
                <div className="text-sm text-neutral-500">{t("buffet.wastePercent")}</div>
                <div className="text-lg font-semibold">{analytics.wastePercent}%</div>
              </div>
              <div>
                <div className="text-sm text-neutral-500">{t("buffet.profit")}</div>
                <div className="text-lg font-semibold">{formatNumber(analytics.profit)}</div>
              </div>
            </div>
          )}

          <table className="table table-sm bg-white w-full">
            <thead>
              <tr>
                <th>{t("buttons.item")}</th>
                <th>{t("buffet.produced")}</th>
                <th>{t("buffet.leftover")}</th>
                <th>{t("buffet.guestConsumption")}</th>
                <th>{t("buffet.waste")}</th>
                <th>{t("buffet.staffMeals")}</th>
                <th>{t("buffet.variance")}</th>
                <th>{t("buffet.foodCost")}</th>
              </tr>
            </thead>
            <tbody>
              {closingLines.map((line) => (
                <tr key={line.itemId}>
                  <td>{line.itemName}</td>
                  <td>{line.producedQty + line.refillQty}</td>
                  <td>{line.endQty}</td>
                  <td>{line.guestConsumption}</td>
                  <td>{line.wasteQty}</td>
                  <td>{line.staffMealQty}</td>
                  <td>{line.varianceQty}</td>
                  <td>{formatNumber(line.totalFoodCost)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Modal>
  );
};
