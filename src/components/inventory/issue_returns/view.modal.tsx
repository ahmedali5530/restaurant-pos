import {useEffect, useMemo, useState} from "react";
import {useTranslation} from "react-i18next";
import {InventoryIssueReturn} from "@/api/model/inventory_issue_return.ts";
import {Modal} from "@/components/common/react-aria/modal.tsx";
import {useDB} from "@/api/db/db.ts";
import {mapIssueReturnToInvoice} from "@/lib/inventory/invoice.mapper.ts";
import {InventoryInvoice} from "@/components/inventory/common/inventory.invoice.tsx";
import {InventoryDocumentAttachments} from "@/components/inventory/common/document.attachments.tsx";
import {shouldShowBusinessDate} from "@/lib/inventory/quantity.display.ts";
import {toAppBusinessDate} from "@/lib/datetime.ts";

interface Props {
  open: boolean;
  issueReturn: InventoryIssueReturn | null;
  onClose: () => void;
}

export const InventoryIssueReturnViewModal = ({open, issueReturn, onClose}: Props) => {
  const {t} = useTranslation("inventory");
  const db = useDB();
  const [viewReturn, setViewReturn] = useState<InventoryIssueReturn | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const fetchDetails = async () => {
      if (!open || !issueReturn?.id) {
        setViewReturn(null);
        return;
      }

      setLoading(true);
      try {
        const [result] = await db.query<[InventoryIssueReturn]>(
          `SELECT * FROM ONLY ${issueReturn.id} FETCH issuance, issuance.items, issuance.items.item, issuance.location, issued_to, location, created_by, items, items.item, items.issued_item, items.location, documents`
        );
        setViewReturn(result as InventoryIssueReturn);
      } catch (e) {
        console.error("Failed to load issue return details", e);
        setViewReturn(null);
      } finally {
        setLoading(false);
      }
    };

    fetchDetails();
  }, [open, issueReturn?.id]);

  const invoiceDoc = useMemo(
    () => (viewReturn ? mapIssueReturnToInvoice(viewReturn) : null),
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
      title={viewReturn ? `Issue return #${viewReturn.invoice_number}` : "Issue return"}
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
            downloadPrefix={`issue-return-${viewReturn.invoice_number}`}
          />
        </div>
      )}
    </Modal>
  );
};
