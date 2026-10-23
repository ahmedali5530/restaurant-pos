import {useEffect, useMemo, useState} from "react";
import {useTranslation} from "react-i18next";
import {InventoryPurchaseReturn} from "@/api/model/inventory_purchase_return.ts";
import {Modal} from "@/components/common/react-aria/modal.tsx";
import {useDB} from "@/api/db/db.ts";
import {mapPurchaseReturnToInvoice} from "@/lib/inventory/invoice.mapper.ts";
import {InventoryInvoice} from "@/components/inventory/common/inventory.invoice.tsx";
import {InventoryDocumentAttachments} from "@/components/inventory/common/document.attachments.tsx";
import {shouldShowBusinessDate} from "@/lib/inventory/quantity.display.ts";
import {toAppBusinessDate} from "@/lib/datetime.ts";

interface Props {
  open: boolean;
  purchaseReturn: InventoryPurchaseReturn | null;
  onClose: () => void;
}

export const InventoryPurchaseReturnViewModal = ({open, purchaseReturn, onClose}: Props) => {
  const {t} = useTranslation("inventory");
  const db = useDB();
  const [viewReturn, setViewReturn] = useState<InventoryPurchaseReturn | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const fetchDetails = async () => {
      if (!open || !purchaseReturn?.id) {
        setViewReturn(null);
        return;
      }

      setLoading(true);
      try {
        const [result] = await db.query(
          `SELECT * FROM ONLY ${purchaseReturn.id} FETCH purchase, purchase.supplier, items, items.item, items.location, items.supplier, created_by, documents`
        );
        setViewReturn(result as any);
      } catch (e) {
        console.error("Failed to load purchase return details", e);
        setViewReturn(null);
      } finally {
        setLoading(false);
      }
    };

    fetchDetails();
  }, [open, purchaseReturn?.id]);

  const invoiceDoc = useMemo(
    () => (viewReturn ? mapPurchaseReturnToInvoice(viewReturn) : null),
    [viewReturn]
  );

  const showBizDate =
    viewReturn &&
    shouldShowBusinessDate(
      viewReturn.created_at,
      (viewReturn as any).business_date,
      toAppBusinessDate
    );

  if (!open) {
    return null;
  }

  return (
    <Modal
      title={viewReturn ? `Purchase return #${viewReturn.invoice_number}` : "Purchase return"}
      open={open}
      onClose={onClose}
      size="xl"
    >
      {loading && (
        <div className="flex items-center justify-center py-10">
          <div className="animate-spin rounded-full h-10 w-10 border-4 border-border border-t-primary" />
        </div>
      )}

      {!loading && viewReturn && invoiceDoc && (
        <div className="space-y-6">
          {showBizDate && (
            <div className="text-sm text-muted">
              {t("columns.businessDate", {defaultValue: "Business date"})}:{" "}
              {(viewReturn as any).business_date}
            </div>
          )}
          <InventoryInvoice doc={invoiceDoc} />
          <InventoryDocumentAttachments
            documents={viewReturn.documents as any}
            downloadPrefix={`purchase-return-${viewReturn.invoice_number}`}
          />
        </div>
      )}
    </Modal>
  );
};
