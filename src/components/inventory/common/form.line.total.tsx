import {useMemo} from "react";
import {Control, useWatch} from "react-hook-form";
import {useTranslation} from "react-i18next";
import {
  itemsSubtotal,
  itemsSubtotalQuantityOnly,
  PurchaseTotalLine,
  QuantityOnlyTotalLine,
} from "@/lib/inventory/purchase.totals.ts";
import {withInventoryCurrency} from "@/lib/inventory/rounding.ts";

interface DisplayProps {
  total: number;
  className?: string;
}

const LineTotalDisplay = ({total, className}: DisplayProps) => {
  const {t} = useTranslation("inventory");

  return (
    <div
      className={
        className ??
        "mt-3 flex items-center justify-end gap-2 border-t border-border pt-3 text-sm"
      }
    >
      <span className="text-muted">{t("totals.lineTotal")}</span>
      <span className="font-semibold text-foreground">{withInventoryCurrency(total)}</span>
    </div>
  );
};

interface LiveProps {
  control: Control<any>;
  name?: string;
  className?: string;
  /**
   * When provided, price is treated as per stock unit and qty is converted from
   * entered_uom → stock UOM before totaling (issues / quantity-only docs).
   */
  resolveStockUom?: (line: QuantityOnlyTotalLine, index: number) => string | null | undefined;
}

/** Live qty × price total from form line fields (price on each row). */
export const InventoryFormLineTotal = ({
  control,
  name = "items",
  className,
  resolveStockUom,
}: LiveProps) => {
  const lines = useWatch({control, name}) as PurchaseTotalLine[] | undefined;
  const total = useMemo(() => {
    if (resolveStockUom) {
      return itemsSubtotalQuantityOnly(lines as QuantityOnlyTotalLine[] | undefined, resolveStockUom);
    }
    return itemsSubtotal(lines);
  }, [lines, resolveStockUom]);
  return <LineTotalDisplay total={total} className={className} />;
};

interface PricedProps {
  lines: PurchaseTotalLine[] | QuantityOnlyTotalLine[] | null | undefined;
  className?: string;
  /**
   * When provided, price is per stock unit and qty is converted from
   * entered_uom → stock UOM before totaling.
   */
  resolveStockUom?: (line: QuantityOnlyTotalLine, index: number) => string | null | undefined;
}

/** Live total from precomputed priced lines (e.g. price resolved from linked purchase/issue). */
export const InventoryFormPricedLineTotal = ({
  lines,
  className,
  resolveStockUom,
}: PricedProps) => {
  const total = useMemo(() => {
    if (resolveStockUom) {
      return itemsSubtotalQuantityOnly(
        lines as QuantityOnlyTotalLine[] | undefined,
        resolveStockUom
      );
    }
    return itemsSubtotal(lines);
  }, [lines, resolveStockUom]);
  return <LineTotalDisplay total={total} className={className} />;
};
