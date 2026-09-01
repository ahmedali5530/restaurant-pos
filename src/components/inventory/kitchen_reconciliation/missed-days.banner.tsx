import {useTranslation} from "react-i18next";
import {KitchenReconciliation} from "@/api/model/kitchen_reconciliation.ts";

type Props = {
  missedDays: KitchenReconciliation[];
};

export const MissedDaysBanner = ({missedDays}: Props) => {
  const {t} = useTranslation("inventory");

  if (missedDays.length === 0) return null;

  return (
    <div className="rounded-lg border border-warning-300 bg-warning-50 px-4 py-3 text-warning-900">
      <p className="font-medium">{t("kitchenReconciliation.missedDaysTitle")}</p>
      <p className="text-sm mt-1">{t("kitchenReconciliation.missedDaysDescription")}</p>
      <ul className="mt-2 flex flex-wrap gap-2">
        {missedDays.map((day) => (
          <li
            key={day.id}
            className="rounded bg-warning-200 px-2 py-1 text-xs font-medium"
          >
            {day.business_date}
          </li>
        ))}
      </ul>
    </div>
  );
};
