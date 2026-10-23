import {useEffect, useMemo, useState} from "react";
import {useTranslation} from "react-i18next";
import {InventoryPurchaseOrder} from "@/api/model/inventory_purchase_order.ts";
import {Modal} from "@/components/common/react-aria/modal.tsx";
import {useDB} from "@/api/db/db.ts";
import {mapPurchaseOrderToInvoice} from "@/lib/inventory/invoice.mapper.ts";
import {InventoryInvoice} from "@/components/inventory/common/inventory.invoice.tsx";
import {InventoryDocumentAttachments} from "@/components/inventory/common/document.attachments.tsx";
import {shouldShowBusinessDate} from "@/lib/inventory/quantity.display.ts";
import {toAppBusinessDate} from "@/lib/datetime.ts";

interface Props {
  open: boolean;
  order: InventoryPurchaseOrder | null;
  onClose: () => void;
}

export const InventoryPurchaseOrderViewModal = ({open, order, onClose}: Props) => {
  const {t} = useTranslation("inventory");
  const db = useDB();
  const [viewOrder, setViewOrder] = useState<InventoryPurchaseOrder | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const fetchDetails = async () => {
      if (!open || !order?.id) {
        setViewOrder(null);
        return;
      }

      setLoading(true);
      try {
        const [result] = await db.query<[InventoryPurchaseOrder]>(
          `SELECT * FROM only ${order.id} FETCH supplier, items, items.item, items.supplier, documents`
        );
        const record = (result as any)?.result?.[0] ?? result;
        setViewOrder(record as InventoryPurchaseOrder);
      } catch (e) {
        console.error("Failed to load purchase order details", e);
        setViewOrder(null);
      } finally {
        setLoading(false);
      }
    };

    fetchDetails();
  }, [open, order?.id]);

  const invoiceDoc = useMemo(
    () => (viewOrder ? mapPurchaseOrderToInvoice(viewOrder) : null),
    [viewOrder]
  );

  const showBizDate =
    viewOrder &&
    shouldShowBusinessDate(
      viewOrder.created_at,
      (viewOrder as any).business_date,
      toAppBusinessDate
    );

  if (!open) {
    return null;
  }

  return (
    <Modal
      title={viewOrder ? `Purchase order #${viewOrder.po_number}` : "Purchase order"}
      open={open}
      onClose={onClose}
      size="xl"
    >
      {loading && (
        <div className="flex items-center justify-center py-10">
          <div className="animate-spin rounded-full h-10 w-10 border-4 border-border border-t-primary" />
        </div>
      )}

      {!loading && viewOrder && invoiceDoc && (
        <div className="space-y-6">
          {showBizDate && (
            <div className="text-sm text-muted">
              {t("columns.businessDate", {defaultValue: "Business date"})}:{" "}
              {(viewOrder as any).business_date}
            </div>
          )}
          <InventoryInvoice doc={invoiceDoc} />
          <InventoryDocumentAttachments
            documents={viewOrder.documents as any}
            downloadPrefix={`purchase-order-${viewOrder.po_number}`}
          />
        </div>
      )}
    </Modal>
  );
};
