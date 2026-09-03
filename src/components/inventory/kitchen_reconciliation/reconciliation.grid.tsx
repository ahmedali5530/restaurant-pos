import {useEffect, useMemo} from "react";
import {useTranslation} from "react-i18next";
import {Controller, useForm, useFieldArray} from "react-hook-form";
import {faSave} from "@fortawesome/free-solid-svg-icons";
import {KitchenReconciliationItem} from "@/api/model/kitchen_reconciliation_item.ts";
import {computeLine} from "@/lib/kitchen/reconciliation.calculations.ts";
import {formatNumber} from "@/lib/utils.ts";
import {normalizeInventoryItemId, ManualLineInput} from "@/lib/kitchen/reconciliation.service.ts";
import {Input} from "@/components/common/input/input.tsx";
import {Button} from "@/components/common/input/button.tsx";
import {KitchenReconciliationStatus} from "@/api/model/kitchen_reconciliation.ts";
import {KeyboardGrid, KeyboardGridCell} from "@/components/common/table/keyboard.grid.tsx";

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
  const itemId = normalizeInventoryItemId(line.item?.id ?? line.item);
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

  const {control, reset, watch, setValue, getValues} = useForm<FormValues>({
    defaultValues: {rows: items.map(toGridRow)},
  });

  const {fields} = useFieldArray({control, name: "rows"});
  const rows = watch("rows");

  const itemsSnapshot = useMemo(
    () =>
      items
        .map((line) => {
          const itemId = normalizeInventoryItemId(line.item?.id ?? line.item);
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

  const renderEditableField = (
    index: number,
    name: keyof Pick<GridRow, "physicalCount" | "wasteQty" | "staffMealQty" | "complimentaryQty">,
    disabled: boolean,
  ) => (
    <Controller
      control={control}
      name={`rows.${index}.${name}`}
      render={({field}) => (
        <Input
          type="number"
          disabled={disabled}
          name={field.name}
          value={field.value ?? ""}
          onChange={(e) => field.onChange((e?.target as HTMLInputElement | undefined)?.value ?? "")}
          onBlur={() => {
            field.onBlur();
            recomputeRow(index);
          }}
        />
      )}
    />
  );

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
        <div className="flex flex-col items-end gap-1">
          <Button
            variant="primary"
            icon={faSave}
            onClick={() => void handleSaveDraft()}
            isLoading={saving}
          >
            {t("kitchenReconciliation.saveDraft")}
          </Button>
          <p className="text-xs text-neutral-500">{t("kitchenReconciliation.keyboardHint")}</p>
        </div>
      )}
      <KeyboardGrid className="overflow-x-auto rounded-xl border border-neutral-200 bg-white">
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
                <td className="px-3 py-2">{formatNumber(row?.theoreticalConsumption ?? 0, 4)}</td>
                <td className="px-3 py-2">{formatNumber(row?.expectedStock ?? 0, 4)}</td>
                <KeyboardGridCell
                  row={index}
                  col={0}
                  navigable={!disabled}
                  disabled={disabled}
                  className="px-3 py-2 min-w-[100px]"
                >
                  {renderEditableField(index, "physicalCount", disabled)}
                </KeyboardGridCell>
                <KeyboardGridCell
                  row={index}
                  col={1}
                  navigable={!disabled}
                  disabled={disabled}
                  className="px-3 py-2 min-w-[90px]"
                >
                  {renderEditableField(index, "wasteQty", disabled)}
                </KeyboardGridCell>
                <KeyboardGridCell
                  row={index}
                  col={2}
                  navigable={!disabled}
                  disabled={disabled}
                  className="px-3 py-2 min-w-[90px]"
                >
                  {renderEditableField(index, "staffMealQty", disabled)}
                </KeyboardGridCell>
                <KeyboardGridCell
                  row={index}
                  col={3}
                  navigable={!disabled}
                  disabled={disabled}
                  className="px-3 py-2 min-w-[90px]"
                >
                  {renderEditableField(index, "complimentaryQty", disabled)}
                </KeyboardGridCell>
                <td className="px-3 py-2">{formatNumber(row?.actualConsumption ?? 0, 4)}</td>
                <td className={`px-3 py-2 font-medium ${Math.abs(row?.variance ?? 0) > 0.0001 ? "text-danger-600" : ""}`}>
                  {formatNumber(row?.variance ?? 0)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      </KeyboardGrid>
    </div>
  );
};
