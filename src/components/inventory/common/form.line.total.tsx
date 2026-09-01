import {Control, useWatch} from "react-hook-form";
import {useTranslation} from "react-i18next";
import {withCurrency} from "@/lib/utils.ts";
import {itemsSubtotal, PurchaseTotalLine} from "@/lib/inventory/purchase.totals.ts";

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
        "mt-3 flex items-center justify-end gap-2 border-t border-neutral-200 pt-3 text-sm"
      }
    >
      <span className="text-neutral-600">{t("totals.lineTotal")}</span>
      <span className="font-semibold text-neutral-900">{withCurrency(total)}</span>
    </div>
  );
};

interface LiveProps {
  control: Control<any>;
  name?: string;
  className?: string;
}

/** Live qty × price total from form line fields (price on each row). */
export const InventoryFormLineTotal = ({control, name = "items", className}: LiveProps) => {
  const lines = useWatch({control, name}) as PurchaseTotalLine[] | undefined;
  return <LineTotalDisplay total={itemsSubtotal(lines)} className={className} />;
};

interface PricedProps {
  lines: PurchaseTotalLine[] | null | undefined;
  className?: string;
}

/** Live total from precomputed priced lines (e.g. price resolved from linked purchase/issue). */
export const InventoryFormPricedLineTotal = ({lines, className}: PricedProps) => {
  return <LineTotalDisplay total={itemsSubtotal(lines)} className={className} />;
};
