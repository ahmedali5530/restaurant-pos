import {useEffect, useMemo} from "react";
import {formatInventoryNumber} from "@/lib/inventory/rounding.ts";
import {useTranslation} from "react-i18next";
import {Controller, useForm, useFieldArray} from "react-hook-form";
import {faSave} from "@fortawesome/free-solid-svg-icons";
import {KitchenReconciliationItem} from "@/api/model/kitchen_reconciliation_item.ts";
import {computeLine} from "@/lib/kitchen/reconciliation.calculations.ts";
import {normalizeInventoryItemId, ManualLineInput} from "@/lib/kitchen/reconciliation.service.ts";
import {Input} from "@/components/common/input/input.tsx";
import {Button} from "@/components/common/input/button.tsx";
import {ReactSelect} from "@/components/common/input/custom.react.select.tsx";
import {KitchenReconciliationStatus} from "@/api/model/kitchen_reconciliation.ts";
import {KeyboardGrid, KeyboardGridCell} from "@/components/common/table/keyboard.grid.tsx";
import {convertEnteredQtyToStock} from "@/lib/inventory/unit.convert.ts";
import {
  getConvertibleUomOptions,
  isNonConvertibleStockUom,
  normalizeUom,
} from "@/utils/inventoryUom.ts";

type GridRow = {
  itemId: string;
  itemName: string;
  itemCode?: string;
  stockUom?: string;
  enteredUom: string;
  openingStock: number;
  issuedQty: number;
  transfersIn: number;
  transfersOut: number;
  theoreticalConsumption: number;
  expectedStock: number;
  /** Entered-unit values shown in inputs. */
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
  const stockUom = normalizeUom(line.item?.uom) ?? line.item?.uom ?? "";
  const enteredUom = String(
    line.entered_uom ?? stockUom ?? ""
  );

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

  const physicalEntered =
    line.entered_physical_count != null
      ? line.entered_physical_count
      : line.physical_count;
  const wasteEntered =
    line.entered_waste_qty != null ? line.entered_waste_qty : line.waste_qty;
  const staffEntered =
    line.entered_staff_meal_qty != null
      ? line.entered_staff_meal_qty
      : line.staff_meal_qty;
  const complimentaryEntered =
    line.entered_complimentary_qty != null
      ? line.entered_complimentary_qty
      : line.complimentary_qty;

  return {
    itemId,
    itemName: line.item?.name ?? itemId,
    itemCode: line.item?.code,
    stockUom,
    enteredUom,
    openingStock: computed.openingStock,
    issuedQty: computed.issuedQty,
    transfersIn: computed.transfersIn,
    transfersOut: computed.transfersOut,
    theoreticalConsumption: computed.theoreticalConsumption,
    expectedStock: computed.expectedStock,
    physicalCount: physicalEntered != null ? String(physicalEntered) : "",
    wasteQty: String(wasteEntered ?? 0),
    staffMealQty: String(staffEntered ?? 0),
    complimentaryQty: String(complimentaryEntered ?? 0),
    actualConsumption: computed.actualConsumption,
    variance: computed.variance,
  };
};

const parseOptionalNumber = (value: string): number | null => {
  if (value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const stockFromRow = (row: GridRow) => {
  const enteredUom = row.enteredUom || row.stockUom;
  const stockUom = row.stockUom || enteredUom;
  return {
    physicalCount: convertEnteredQtyToStock(
      parseOptionalNumber(row.physicalCount),
      enteredUom,
      stockUom
    ),
    wasteQty:
      convertEnteredQtyToStock(Number(row.wasteQty) || 0, enteredUom, stockUom) ?? 0,
    staffMealQty:
      convertEnteredQtyToStock(Number(row.staffMealQty) || 0, enteredUom, stockUom) ??
      0,
    complimentaryQty:
      convertEnteredQtyToStock(
        Number(row.complimentaryQty) || 0,
        enteredUom,
        stockUom
      ) ?? 0,
  };
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
            line.entered_uom,
            line.entered_physical_count,
            line.entered_waste_qty,
            line.entered_staff_meal_qty,
            line.entered_complimentary_qty,
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

    const stock = stockFromRow(row);
    const computed = computeLine({
      openingStock: row.openingStock,
      issuedQty: row.issuedQty,
      transfersIn: row.transfersIn,
      transfersOut: row.transfersOut,
      theoreticalConsumption: row.theoreticalConsumption,
      physicalCount: stock.physicalCount,
      wasteQty: stock.wasteQty,
      staffMealQty: stock.staffMealQty,
      complimentaryQty: stock.complimentaryQty,
    });

    setValue(`rows.${index}.expectedStock`, computed.expectedStock);
    setValue(`rows.${index}.actualConsumption`, computed.actualConsumption);
    setValue(`rows.${index}.variance`, computed.variance);
  };

  const handleSaveDraft = async () => {
    const formRows = getValues("rows");
    const lines: ManualLineInput[] = formRows.map((row) => {
      const stock = stockFromRow(row);
      const enteredPhysical = parseOptionalNumber(row.physicalCount);
      return {
        itemId: row.itemId,
        physicalCount: stock.physicalCount,
        wasteQty: stock.wasteQty,
        staffMealQty: stock.staffMealQty,
        complimentaryQty: stock.complimentaryQty,
        enteredUom: row.enteredUom || row.stockUom || null,
        enteredPhysicalCount: enteredPhysical,
        enteredWasteQty: Number(row.wasteQty) || 0,
        enteredStaffMealQty: Number(row.staffMealQty) || 0,
        enteredComplimentaryQty: Number(row.complimentaryQty) || 0,
      };
    });
    await onSave(lines);
  };

  const renderEditableField = (
    index: number,
    name: keyof Pick<GridRow, "physicalCount" | "wasteQty" | "staffMealQty" | "complimentaryQty">,
    fieldDisabled: boolean,
  ) => (
    <Controller
      control={control}
      name={`rows.${index}.${name}`}
      render={({field}) => (
        <Input
          type="number"
          disabled={fieldDisabled}
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
      <div className="rounded-lg border border-border bg-surface p-8 text-center text-muted">
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
          <p className="text-xs text-muted">{t("kitchenReconciliation.keyboardHint")}</p>
        </div>
      )}
      <KeyboardGrid className="overflow-x-auto rounded-xl border border-border bg-surface-elevated">
      <table className="w-full text-sm">
        <thead className="bg-surface text-left">
          <tr>
            <th className="px-3 py-2">{t("columns.name")}</th>
            <th className="px-3 py-2">{t("columns.code")}</th>
            <th className="px-3 py-2 min-w-[110px]">
              {t("forms.uom", {defaultValue: "UOM"})}
            </th>
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
            const stockUom = row?.stockUom;
            const uomOptions = getConvertibleUomOptions(stockUom);
            const packagingOnly = isNonConvertibleStockUom(stockUom);
            const enteredDiffers =
              Boolean(row?.enteredUom) &&
              Boolean(stockUom) &&
              normalizeUom(row?.enteredUom) !== normalizeUom(stockUom);

            return (
              <tr key={field.id} className="border-t border-border">
                <td className="px-3 py-2 whitespace-nowrap">{row?.itemName}</td>
                <td className="px-3 py-2">{row?.itemCode ?? "—"}</td>
                <td className="px-3 py-2 min-w-[120px]">
                  <Controller
                    control={control}
                    name={`rows.${index}.enteredUom`}
                    render={({field: uomField}) => {
                      const value = uomField.value
                        ? {label: String(uomField.value), value: String(uomField.value)}
                        : stockUom
                          ? {label: stockUom, value: stockUom}
                          : null;
                      return (
                        <div>
                          <ReactSelect
                            value={value}
                            onChange={(option) => {
                              uomField.onChange(option?.value ?? stockUom ?? "");
                              recomputeRow(index);
                            }}
                            options={uomOptions}
                            isDisabled={disabled || uomOptions.length <= 1}
                            isClearable={false}
                            menuPortalTarget={
                              typeof document !== "undefined" ? document.body : undefined
                            }
                            styles={{
                              control: (base: any) => ({
                                ...base,
                                minHeight: 32,
                                fontSize: "0.8125rem",
                              }),
                            }}
                          />
                          {enteredDiffers && stockUom && (
                            <div className="text-[10px] text-muted mt-0.5">
                              {t("kitchenReconciliation.stockUomHint", {
                                defaultValue: "Stock: {{uom}}",
                                uom: stockUom,
                              })}
                            </div>
                          )}
                          {packagingOnly && (
                            <div className="text-[10px] text-muted mt-0.5">
                              {t("forms.packagingNoConversion", {
                                defaultValue: "Packaging units are not converted",
                              })}
                            </div>
                          )}
                        </div>
                      );
                    }}
                  />
                </td>
                <td className="px-3 py-2">{formatInventoryNumber(row?.openingStock ?? 0)}</td>
                <td className="px-3 py-2">{formatInventoryNumber(row?.issuedQty ?? 0)}</td>
                <td className="px-3 py-2">{formatInventoryNumber(row?.transfersIn ?? 0)}</td>
                <td className="px-3 py-2">{formatInventoryNumber(row?.transfersOut ?? 0)}</td>
                <td className="px-3 py-2">{formatInventoryNumber(row?.theoreticalConsumption ?? 0)}</td>
                <td className="px-3 py-2">{formatInventoryNumber(row?.expectedStock ?? 0)}</td>
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
                <td className="px-3 py-2">{formatInventoryNumber(row?.actualConsumption ?? 0)}</td>
                <td className={`px-3 py-2 font-medium ${Math.abs(row?.variance ?? 0) > 0.0001 ? "text-danger-600" : ""}`}>
                  {formatInventoryNumber(row?.variance ?? 0)}
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
