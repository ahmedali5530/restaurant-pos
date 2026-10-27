import {useEffect, useMemo, useState} from "react";
import {useTranslation} from "react-i18next";
import {InventoryWaste} from "@/api/model/inventory_waste.ts";
import {Modal} from "@/components/common/react-aria/modal.tsx";
import {useDB} from "@/api/db/db.ts";
import {mapWasteToInvoice} from "@/lib/inventory/invoice.mapper.ts";
import {InventoryInvoice} from "@/components/inventory/common/inventory.invoice.tsx";
import {InventoryDocumentAttachments} from "@/components/inventory/common/document.attachments.tsx";
import {shouldShowBusinessDate} from "@/lib/inventory/quantity.display.ts";
import {toAppBusinessDate} from "@/lib/datetime.ts";

interface Props {
  open: boolean;
  waste: InventoryWaste | null;
  onClose: () => void;
}

export const InventoryWasteViewModal = ({open, waste, onClose}: Props) => {
  const {t} = useTranslation("inventory");
  const db = useDB();
  const [viewWaste, setViewWaste] = useState<InventoryWaste | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const fetchDetails = async () => {
      if (!open || !waste?.id) {
        setViewWaste(null);
        return;
      }

      setLoading(true);
      try {
        const [result] = await db.query<[InventoryWaste]>(
          `SELECT * FROM ONLY ${waste.id} FETCH purchase, issue, created_by, items, items.item, items.location, items.purchase_item, items.purchase_item.location, items.issue_item, items.issue_item.location, documents`
        );
        setViewWaste(result as InventoryWaste);
      } catch (e) {
        console.error("Failed to load waste details", e);
        setViewWaste(null);
      } finally {
        setLoading(false);
      }
    };

    fetchDetails();
  }, [open, waste?.id]);

  const invoiceDoc = useMemo(
    () => (viewWaste ? mapWasteToInvoice(viewWaste) : null),
    [viewWaste]
  );

  const showBizDate =
    viewWaste &&
    shouldShowBusinessDate(
      viewWaste.created_at,
      (viewWaste as any).business_date,
      toAppBusinessDate
    );

  if (!open) {
    return null;
  }

  return (
    <Modal
      title={viewWaste ? `Waste #${viewWaste.invoice_number}` : "Waste"}
      open={open}
      onClose={onClose}
      size="xl"
    >
      {loading && (
        <div className="flex items-center justify-center py-10">
          <div className="animate-spin rounded-full h-10 w-10 border-4 border-border border-t-primary" />
        </div>
      )}

      {!loading && viewWaste && invoiceDoc && (
        <div className="space-y-6">
          {showBizDate && (
            <div className="text-sm text-muted">
              {t("columns.businessDate", {defaultValue: "Business date"})}:{" "}
              {(viewWaste as any).business_date}
            </div>
          )}
          <InventoryInvoice doc={invoiceDoc} />
          <InventoryDocumentAttachments
            documents={viewWaste.documents as any}
            downloadPrefix={`waste-${viewWaste.invoice_number}`}
          />
        </div>
      )}
    </Modal>
  );
};
