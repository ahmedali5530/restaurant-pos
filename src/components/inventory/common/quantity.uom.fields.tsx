import {Controller, type Control, type FieldPath, type FieldValues} from "react-hook-form";
import {useTranslation} from "react-i18next";
import {Input} from "@/components/common/input/input.tsx";
import {ReactSelect} from "@/components/common/input/custom.react.select.tsx";
import {
  getConvertibleUomOptions,
  isNonConvertibleStockUom,
  normalizeUom,
  type InventoryUom,
} from "@/utils/inventoryUom.ts";
import get from "lodash/get";

type Props<T extends FieldValues> = {
  control: Control<T>;
  quantityName: FieldPath<T>;
  uomName: FieldPath<T>;
  stockUom?: string | null;
  quantityLabel?: string;
  errors?: any;
  disabled?: boolean;
  className?: string;
};

/**
 * Quantity input plus a unit select limited to the item's convertible family.
 */
export function QuantityUomFields<T extends FieldValues>({
  control,
  quantityName,
  uomName,
  stockUom,
  quantityLabel,
  errors,
  disabled,
  className,
}: Props<T>) {
  const {t} = useTranslation(["inventory", "common"]);
  const options = getConvertibleUomOptions(stockUom);
  const packagingOnly = isNonConvertibleStockUom(stockUom);
  const canonicalStock = normalizeUom(stockUom);

  return (
    <div className={className ?? "flex gap-2 flex-1"}>
      <div className="flex-1">
        <Controller
          name={quantityName}
          control={control}
          render={({field}) => (
            <Input
              label={quantityLabel ?? t("forms.quantity")}
              type="number"
              value={field.value as number | string}
              onChange={field.onChange}
              error={get(errors, [...String(quantityName).split("."), "message"])}
              disabled={disabled}
            />
          )}
        />
      </div>
      <div className="w-28">
        <label className="text-sm">{t("columns.uom")}</label>
        <Controller
          name={uomName}
          control={control}
          render={({field}) => {
            const value = field.value
              ? {
                  label: String(
                    typeof field.value === "object" && field.value && "value" in field.value
                      ? (field.value as {value: string}).value
                      : field.value
                  ),
                  value: String(
                    typeof field.value === "object" && field.value && "value" in field.value
                      ? (field.value as {value: string}).value
                      : field.value
                  ) as InventoryUom,
                }
              : canonicalStock
                ? {label: canonicalStock, value: canonicalStock}
                : null;
            return (
              <ReactSelect
                value={value}
                onChange={(option) => field.onChange(option?.value ?? canonicalStock ?? "")}
                options={options}
                isDisabled={disabled || options.length <= 1}
                isClearable={false}
              />
            );
          }}
        />
        {packagingOnly && (
          <p className="text-xs text-muted mt-1">
            {t("forms.packagingNoConversion", {
              defaultValue: "Packaging units are not converted",
            })}
          </p>
        )}
      </div>
    </div>
  );
}

/** Prefer entered_* when reopening; otherwise stock quantity in the item unit. */
export function lineEnteredDefaults(line: {
  quantity?: number | null;
  price?: number | null;
  entered_quantity?: number | null;
  entered_uom?: string | null;
  entered_price?: number | null;
  item?: {uom?: string | null} | null;
}): {
  quantity: number;
  entered_uom: string;
  price: number;
} {
  const stockUom = normalizeUom(line.item?.uom) ?? line.item?.uom ?? "";
  return {
    quantity: Number(line.entered_quantity ?? line.quantity ?? 0),
    entered_uom: String(line.entered_uom ?? stockUom ?? ""),
    price: Number(line.entered_price ?? line.price ?? 0),
  };
}
