import {useEffect, useMemo, useState} from "react";
import {useTranslation} from "react-i18next";
import {StockTransfer} from "@/api/model/stock_transfer.ts";
import {Modal} from "@/components/common/react-aria/modal.tsx";
import {useDB} from "@/api/db/db.ts";
import {getStockTransfer} from "@/lib/inventory/stock_transfer.service.ts";
import {mapStockTransferToInvoice} from "@/lib/inventory/invoice.mapper.ts";
import {InventoryInvoice} from "@/components/inventory/common/inventory.invoice.tsx";
import {shouldShowBusinessDate} from "@/lib/inventory/quantity.display.ts";
import {toAppBusinessDate} from "@/lib/datetime.ts";

interface Props {
  open: boolean;
  transfer: StockTransfer | null;
  onClose: () => void;
}

const toRecordIdString = (id: unknown): string => {
  if (!id) return "";
  if (typeof id === "string") return id;
  if (typeof id === "object" && id !== null && "toString" in id) {
    return (id as {toString(): string}).toString();
  }
  return String(id);
};

export const StockTransferViewModal = ({open, transfer, onClose}: Props) => {
  const {t} = useTranslation("inventory");
  const db = useDB();
  const [viewTransfer, setViewTransfer] = useState<StockTransfer | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const fetchDetails = async () => {
      if (!open || !transfer?.id) {
        setViewTransfer(null);
        return;
      }

      setLoading(true);
      try {
        const result = await getStockTransfer(db, toRecordIdString(transfer.id));
        setViewTransfer(result);
      } catch (error) {
        console.error("Failed to load stock transfer details", error);
        setViewTransfer(null);
      } finally {
        setLoading(false);
      }
    };

    void fetchDetails();
  }, [open, transfer?.id]);

  const invoiceDoc = useMemo(
    () => (viewTransfer ? mapStockTransferToInvoice(viewTransfer) : null),
    [viewTransfer]
  );

  const showBizDate =
    viewTransfer &&
    shouldShowBusinessDate(
      viewTransfer.created_at,
      (viewTransfer as any).business_date,
      toAppBusinessDate
    );

  if (!open) {
    return null;
  }

  return (
    <Modal
      title={t("stockTransfer.viewTitle")}
      open={open}
      onClose={onClose}
      size="xl"
    >
      {loading && (
        <div className="flex items-center justify-center py-10">
          <div className="animate-spin rounded-full h-10 w-10 border-4 border-border border-t-primary" />
        </div>
      )}

      {!loading && viewTransfer && invoiceDoc && (
        <div className="space-y-6">
          {showBizDate && (
            <div className="text-sm text-muted">
              {t("columns.businessDate", {defaultValue: "Business date"})}:{" "}
              {(viewTransfer as any).business_date}
            </div>
          )}
          <InventoryInvoice doc={invoiceDoc} />
        </div>
      )}
    </Modal>
  );
};
