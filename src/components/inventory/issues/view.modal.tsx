import {useEffect, useMemo, useState} from "react";
import {useTranslation} from "react-i18next";
import {InventoryIssue} from "@/api/model/inventory_issue.ts";
import {Modal} from "@/components/common/react-aria/modal.tsx";
import {useDB} from "@/api/db/db.ts";
import {mapIssueToInvoice} from "@/lib/inventory/invoice.mapper.ts";
import {InventoryInvoice} from "@/components/inventory/common/inventory.invoice.tsx";
import {InventoryDocumentAttachments} from "@/components/inventory/common/document.attachments.tsx";
import {shouldShowBusinessDate} from "@/lib/inventory/quantity.display.ts";
import {toAppBusinessDate} from "@/lib/datetime.ts";

interface Props {
  open: boolean;
  issue: InventoryIssue | null;
  onClose: () => void;
}

export const InventoryIssueViewModal = ({open, issue, onClose}: Props) => {
  const {t} = useTranslation("inventory");
  const db = useDB();
  const [viewIssue, setViewIssue] = useState<InventoryIssue | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const fetchDetails = async () => {
      if (!open || !issue?.id) {
        setViewIssue(null);
        return;
      }

      setLoading(true);
      try {
        const [result] = await db.query<[InventoryIssue]>(
          `SELECT * FROM ONLY ${issue.id} FETCH created_by, issued_to, location, items.item, items.location, documents`
        );
        setViewIssue(result as InventoryIssue);
      } catch (e) {
        console.error("Failed to load issue details", e);
        setViewIssue(null);
      } finally {
        setLoading(false);
      }
    };

    fetchDetails();
  }, [open, issue?.id]);

  const invoiceDoc = useMemo(
    () => (viewIssue ? mapIssueToInvoice(viewIssue) : null),
    [viewIssue]
  );

  const showBizDate =
    viewIssue &&
    shouldShowBusinessDate(
      viewIssue.created_at,
      (viewIssue as any).business_date,
      toAppBusinessDate
    );

  if (!open) {
    return null;
  }

  return (
    <Modal
      title={viewIssue ? `Issue #${viewIssue.invoice_number}` : "Issue"}
      open={open}
      onClose={onClose}
      size="xl"
    >
      {loading && (
        <div className="flex items-center justify-center py-10">
          <div className="animate-spin rounded-full h-10 w-10 border-4 border-border border-t-primary" />
        </div>
      )}

      {!loading && viewIssue && invoiceDoc && (
        <div className="space-y-6">
          {showBizDate && (
            <div className="text-sm text-muted">
              {t("columns.businessDate", {defaultValue: "Business date"})}:{" "}
              {(viewIssue as any).business_date}
            </div>
          )}
          <InventoryInvoice doc={invoiceDoc} />
          <InventoryDocumentAttachments
            documents={viewIssue.documents as any}
            downloadPrefix={`issue-${viewIssue.invoice_number}`}
          />
        </div>
      )}
    </Modal>
  );
};
