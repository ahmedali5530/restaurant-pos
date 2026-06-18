import {useEffect, useMemo, type FocusEvent} from "react";
import {useTranslation} from "react-i18next";
import {useForm, useFieldArray} from "react-hook-form";
import {faSave} from "@fortawesome/free-solid-svg-icons";
import {KitchenReconciliationItem} from "@/api/model/kitchen_reconciliation_item.ts";
import {recordToString} from "@/api/reports/shared/records.ts";
import {computeLine} from "@/lib/kitchen/reconciliation.calculations.ts";
import {formatNumber} from "@/lib/utils.ts";
import {ManualLineInput} from "@/lib/kitchen/reconciliation.service.ts";
import {Input} from "@/components/common/input/input.tsx";
import {Button} from "@/components/common/input/button.tsx";
import {KitchenReconciliationStatus} from "@/api/model/kitchen_reconciliation.ts";

type GridRow = {
  itemId: string;
  itemName: string;
  itemCode?: string;
  uom?: string;
  openingStock: number;
  issuedQty: number;
  transfersIn: number;
  transfersOut: number;
  theoreticalConsumption: number;
  expectedStock: number;
  physicalCount: string;
  wasteQty: string;
  staffMealQty: string;
  complimentaryQty: string;
  actualConsumption: number;
  variance: number;
};

type FormValues = {
  rows: GridRow[];
};

type Props = {
  items: KitchenReconciliationItem[];
  status?: KitchenReconciliationStatus;
  readOnly?: boolean;
  saving?: boolean;
  onSave: (lines: ManualLineInput[]) => Promise<void>;
};

const toGridRow = (line: KitchenReconciliationItem): GridRow => {
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
    itemId,
    itemName: line.item?.name ?? itemId,
    itemCode: line.item?.code,
    uom: line.item?.uom,
    openingStock: computed.openingStock,
    issuedQty: computed.issuedQty,
    transfersIn: computed.transfersIn,
    transfersOut: computed.transfersOut,
    theoreticalConsumption: computed.theoreticalConsumption,
    expectedStock: computed.expectedStock,
    physicalCount: line.physical_count != null ? String(line.physical_count) : "",
    wasteQty: String(line.waste_qty ?? 0),
    staffMealQty: String(line.staff_meal_qty ?? 0),
    complimentaryQty: String(line.complimentary_qty ?? 0),
    actualConsumption: computed.actualConsumption,
    variance: computed.variance,
  };
};

const parseOptionalNumber = (value: string): number | null => {
  if (value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

export const ReconciliationGrid = ({items, status, readOnly, saving, onSave}: Props) => {
  const {t} = useTranslation("inventory");
  const isMissed = status === "missed";
  const isVerified = status === "verified";
  const disabled = readOnly || isMissed || isVerified;

  const {control, register, reset, watch, setValue, getValues} = useForm<FormValues>({
    defaultValues: {rows: items.map(toGridRow)},
  });

  const {fields} = useFieldArray({control, name: "rows"});
  const rows = watch("rows");

  const itemsSnapshot = useMemo(
    () =>
      items
        .map((line) => {
          const itemId = recordToString(line.item?.id ?? line.item);
          return [
            itemId,
            line.physical_count,
            line.waste_qty,
            line.staff_meal_qty,
            line.complimentary_qty,
          ].join(":");
        })
        .join("|"),
    [items]
  );

  useEffect(() => {
    reset({rows: items.map(toGridRow)});
  }, [itemsSnapshot, items, reset]);

  const recomputeRow = (index: number) => {
    const row = getValues(`rows.${index}`);
    if (!row) return;

    const computed = computeLine({
      openingStock: row.openingStock,
      issuedQty: row.issuedQty,
      transfersIn: row.transfersIn,
      transfersOut: row.transfersOut,
      theoreticalConsumption: row.theoreticalConsumption,
      physicalCount: parseOptionalNumber(row.physicalCount),
      wasteQty: Number(row.wasteQty) || 0,
      staffMealQty: Number(row.staffMealQty) || 0,
      complimentaryQty: Number(row.complimentaryQty) || 0,
    });

    setValue(`rows.${index}.expectedStock`, computed.expectedStock);
    setValue(`rows.${index}.actualConsumption`, computed.actualConsumption);
    setValue(`rows.${index}.variance`, computed.variance);
  };

  const handleSaveDraft = async () => {
    const formRows = getValues("rows");
    const lines: ManualLineInput[] = formRows.map((row) => ({
      itemId: row.itemId,
      physicalCount: parseOptionalNumber(row.physicalCount),
      wasteQty: Number(row.wasteQty) || 0,
      staffMealQty: Number(row.staffMealQty) || 0,
      complimentaryQty: Number(row.complimentaryQty) || 0,
    }));
    await onSave(lines);
  };

  const registerEditableField = (index: number, name: keyof Pick<GridRow, "physicalCount" | "wasteQty" | "staffMealQty" | "complimentaryQty">) => {
    const {onBlur, ...field} = register(`rows.${index}.${name}`);
    return {
      ...field,
      onBlur: (event: FocusEvent<HTMLInputElement>) => {
        onBlur(event);
        recomputeRow(index);
      },
    };
  };

  if (fields.length === 0) {
    return (
      <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-8 text-center text-neutral-600">
        {t("kitchenReconciliation.noItems")}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {!disabled && (
        <div className="flex justify-end">
          <Button
            variant="primary"
            icon={faSave}
            onClick={() => void handleSaveDraft()}
            isLoading={saving}
          >
            {t("kitchenReconciliation.saveDraft")}
          </Button>
        </div>
      )}
      <div className="overflow-x-auto rounded-xl border border-neutral-200 bg-white">
      <table className="w-full text-sm">
        <thead className="bg-neutral-50 text-left">
          <tr>
            <th className="px-3 py-2">{t("columns.name")}</th>
            <th className="px-3 py-2">{t("columns.code")}</th>
            <th className="px-3 py-2">{t("kitchenReconciliation.opening")}</th>
            <th className="px-3 py-2">{t("kitchenReconciliation.issued")}</th>
            <th className="px-3 py-2">{t("kitchenReconciliation.transfersIn")}</th>
            <th className="px-3 py-2">{t("kitchenReconciliation.transfersOut")}</th>
            <th className="px-3 py-2">{t("kitchenReconciliation.theoretical")}</th>
            <th className="px-3 py-2">{t("kitchenReconciliation.expected")}</th>
            <th className="px-3 py-2">{t("kitchenReconciliation.physical")}</th>
            <th className="px-3 py-2">{t("kitchenReconciliation.waste")}</th>
            <th className="px-3 py-2">{t("kitchenReconciliation.staffMeal")}</th>
            <th className="px-3 py-2">{t("kitchenReconciliation.complimentary")}</th>
            <th className="px-3 py-2">{t("kitchenReconciliation.actualConsumption")}</th>
            <th className="px-3 py-2">{t("kitchenReconciliation.variance")}</th>
          </tr>
        </thead>
        <tbody>
          {fields.map((field, index) => {
            const row = rows?.[index];
            return (
              <tr key={field.id} className="border-t border-neutral-100">
                <td className="px-3 py-2 whitespace-nowrap">{row?.itemName}</td>
                <td className="px-3 py-2">{row?.itemCode ?? "—"}</td>
                <td className="px-3 py-2">{formatNumber(row?.openingStock ?? 0)}</td>
                <td className="px-3 py-2">{formatNumber(row?.issuedQty ?? 0)}</td>
                <td className="px-3 py-2">{formatNumber(row?.transfersIn ?? 0)}</td>
                <td className="px-3 py-2">{formatNumber(row?.transfersOut ?? 0)}</td>
                <td className="px-3 py-2">{formatNumber(row?.theoreticalConsumption ?? 0)}</td>
                <td className="px-3 py-2">{formatNumber(row?.expectedStock ?? 0)}</td>
                <td className="px-3 py-2 min-w-[100px]">
                  <Input
                    type="number"
                    disabled={disabled}
                    {...registerEditableField(index, "physicalCount")}
                  />
                </td>
                <td className="px-3 py-2 min-w-[90px]">
                  <Input
                    type="number"
                    disabled={disabled}
                    {...registerEditableField(index, "wasteQty")}
                  />
                </td>
                <td className="px-3 py-2 min-w-[90px]">
                  <Input
                    type="number"
                    disabled={disabled}
                    {...registerEditableField(index, "staffMealQty")}
                  />
                </td>
                <td className="px-3 py-2 min-w-[90px]">
                  <Input
                    type="number"
                    disabled={disabled}
                    {...registerEditableField(index, "complimentaryQty")}
                  />
                </td>
                <td className="px-3 py-2">{formatNumber(row?.actualConsumption ?? 0)}</td>
                <td className={`px-3 py-2 font-medium ${Math.abs(row?.variance ?? 0) > 0.0001 ? "text-danger-600" : ""}`}>
                  {formatNumber(row?.variance ?? 0)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      </div>
    </div>
  );
};
