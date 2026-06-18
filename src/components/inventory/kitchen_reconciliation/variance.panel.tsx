import {useMemo} from "react";
import {useTranslation} from "react-i18next";
import {KitchenReconciliationItem} from "@/api/model/kitchen_reconciliation_item.ts";
import {recordToString} from "@/api/reports/shared/records.ts";
import {
  computeLine,
  computeTotals,
  getTopVarianceLines,
} from "@/lib/kitchen/reconciliation.calculations.ts";
import {formatNumber} from "@/lib/utils.ts";
import {KitchenReconciliationStatus} from "@/api/model/kitchen_reconciliation.ts";

type Props = {
  items: KitchenReconciliationItem[];
  status?: KitchenReconciliationStatus;
};

export const VariancePanel = ({items, status}: Props) => {
  const {t} = useTranslation("inventory");

  const computedLines = useMemo(() => {
    return items.map((line) => {
      const itemId = recordToString(line.item?.id ?? line.item);
      const computed = computeLine({
        openingStock: line.opening_stock,
        issuedQty: line.issued_qty,
        transfersIn: line.transfers_in,
        transfersOut: line.transfers_out,
        theoreticalConsumption: line.theoretical_consumption,
        physicalCount: line.physical_count ?? null,
        wasteQty: line.waste_qty,
        staffMealQty: line.staff_meal_qty,
        complimentaryQty: line.complimentary_qty,
      });
      return {
        ...computed,
        itemId,
        itemName: line.item?.name ?? itemId,
      };
    });
  }, [items]);

  const totals = useMemo(() => computeTotals(computedLines), [computedLines]);
  const topVariance = useMemo(() => getTopVarianceLines(computedLines, 10), [computedLines]);

  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-4 sticky top-4">
      <h3 className="text-lg font-semibold mb-3">{t("kitchenReconciliation.variancePanel")}</h3>

      {status === "missed" && (
        <div className="mb-3 rounded border border-warning-300 bg-warning-50 px-3 py-2 text-sm text-warning-900">
          {t("kitchenReconciliation.missedStatusWarning")}
        </div>
      )}

      <dl className="grid grid-cols-2 gap-3 text-sm mb-4">
        <div>
          <dt className="text-neutral-500">{t("kitchenReconciliation.totalVariance")}</dt>
          <dd className={`font-semibold ${totals.totalVariance !== 0 ? "text-danger-600" : "text-success-600"}`}>
            {formatNumber(totals.totalVariance)}
          </dd>
        </div>
        <div>
          <dt className="text-neutral-500">{t("kitchenReconciliation.totalActualConsumption")}</dt>
          <dd className="font-semibold">{formatNumber(totals.totalActualConsumption)}</dd>
        </div>
        <div>
          <dt className="text-neutral-500">{t("kitchenReconciliation.totalTheoretical")}</dt>
          <dd className="font-semibold">{formatNumber(totals.totalTheoreticalConsumption)}</dd>
        </div>
        <div>
          <dt className="text-neutral-500">{t("kitchenReconciliation.linesWithVariance")}</dt>
          <dd className="font-semibold">{totals.linesWithVariance}</dd>
        </div>
      </dl>

      {topVariance.length > 0 && (
        <div>
          <h4 className="text-sm font-medium text-neutral-700 mb-2">
            {t("kitchenReconciliation.topVariance")}
          </h4>
          <ul className="space-y-2 max-h-64 overflow-y-auto">
            {topVariance.map((line) => (
              <li
                key={line.itemId}
                className="flex justify-between text-sm border-b border-neutral-100 pb-1"
              >
                <span className="truncate pr-2">{line.itemName}</span>
                <span className={line.variance !== 0 ? "text-danger-600 font-medium" : ""}>
                  {formatNumber(line.variance)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};
