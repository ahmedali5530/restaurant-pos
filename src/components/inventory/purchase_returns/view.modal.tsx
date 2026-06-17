import {useEffect, useState} from "react";
import { useTranslation } from 'react-i18next';
import {InventoryPurchaseReturn} from "@/api/model/inventory_purchase_return.ts";
import {Modal} from "@/components/common/react-aria/modal.tsx";
import {useDB} from "@/api/db/db.ts";
import {FontAwesomeIcon} from "@fortawesome/react-fontawesome";
import {faDownload, faFile} from "@fortawesome/free-solid-svg-icons";
import {downloadArrayBuffer} from "@/utils/files.ts";
import {Button} from "@/components/common/input/button.tsx";
import { toJsDate } from "@/lib/datetime.ts";

interface Props {
  open: boolean;
  purchaseReturn: InventoryPurchaseReturn | null;
  onClose: () => void;
}

export const InventoryPurchaseReturnViewModal = ({open, purchaseReturn, onClose}: Props) => {
  const { t } = useTranslation('inventory');
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
          `SELECT * FROM ONLY ${purchaseReturn.id} FETCH purchase, purchase.supplier, items, items.item, items.store, items.supplier, created_by, documents`
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

  if (!open) {
    return null;
  }

  return (
    <Modal
      title={viewReturn ? `Return #${viewReturn.invoice_number}` : "Purchase return"}
      open={open}
      onClose={onClose}
      size="xl"
    >
      {loading && (
        <div className="flex items-center justify-center py-10">
          <div className="animate-spin rounded-full h-10 w-10 border-4 border-neutral-300 border-t-primary-500"></div>
        </div>
      )}

      {!loading && viewReturn && (
        <div className="space-y-6">
          <div className="bg-white rounded-xl shadow border border-neutral-200 p-4 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <div className="text-lg font-semibold">
                Return invoice #{viewReturn.invoice_number}
              </div>
              <div className="text-xs text-neutral-500">
                {viewReturn.created_at ? toJsDate(viewReturn.created_at).toLocaleString() : "—"}
              </div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm text-neutral-700">
              <div>
                <div className="text-neutral-500 text-xs uppercase">Purchase invoice</div>
                <div>{viewReturn.purchase ? `Invoice #${viewReturn.purchase.invoice_number}` : "—"}</div>
              </div>
              <div>
                <div className="text-neutral-500 text-xs uppercase">Supplier</div>
                <div>{viewReturn.purchase?.supplier?.name ?? "—"}</div>
              </div>
              <div>
                <div className="text-neutral-500 text-xs uppercase">{t('columns.createdBy')}</div>
                <div>{viewReturn.created_by?.first_name} {viewReturn.created_by?.last_name}</div>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow border border-neutral-200 p-4">
            <div className="text-sm font-semibold text-neutral-800 mb-3">
              Items
            </div>
            {viewReturn.items && viewReturn.items.length > 0 ? (
              <div className="max-h-64 overflow-auto divide-y divide-neutral-200">
                {viewReturn.items.map((item) => (
                  <div key={item.id} className="py-2 flex flex-wrap gap-2 text-sm">
                    <div className="flex-1 min-w-[160px]">
                      <div className="font-medium">
                        {item.item?.name ?? "Item"}{item.item?.code ? ` - ${item.item.code}` : ""}
                      </div>
                      <div className="text-xs text-neutral-500">
                        {item.store?.name ? `Store: ${item.store.name}` : ""}
                      </div>
                    </div>
                    <div className="w-24 text-right">
                      <div className="text-neutral-700">
                        Qty: {item.quantity}
                      </div>
                    </div>
                    <div className="flex-1 min-w-[120px] text-xs text-neutral-500">
                      {item.supplier?.name && <div>Supplier: {item.supplier.name}</div>}
                      {item.comments && <div className="truncate">Note: {item.comments}</div>}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-sm text-neutral-500">
                No items found for this return.
              </div>
            )}
          </div>

          <div className="bg-white rounded-xl shadow border border-neutral-200 p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="text-sm font-semibold text-neutral-800 flex items-center gap-2">
                <FontAwesomeIcon icon={faFile}/>
                <span>{t('upload.attachDocuments')}</span>
              </div>
            </div>
            {viewReturn.documents && viewReturn.documents.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {viewReturn.documents.map((doc, index) => (
                  <div
                    key={doc.id ?? index}
                    className="flex items-center justify-between px-3 py-2 rounded-lg border border-neutral-200 bg-neutral-50"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="h-8 w-8 rounded-md bg-primary-50 text-primary-600 flex items-center justify-center">
                        <FontAwesomeIcon icon={faFile}/>
                      </div>
                      <div className="flex flex-col min-w-0">
                        <span className="text-sm font-medium text-neutral-800 truncate">
                          {doc.name ?? `Document ${index + 1}`}
                        </span>
                        <span className="text-xs text-neutral-500">
                          {doc.mimeType ?? "File"}
                        </span>
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="primary"
                      onClick={() =>
                        downloadArrayBuffer(
                          doc.content,
                          doc.name ?? `purchase-return-${viewReturn.invoice_number}-${index + 1}`,
                          doc.mimeType ?? "application/octet-stream"
                        )
                      }
                    >
                      <FontAwesomeIcon icon={faDownload} className="mr-1"/>
                      Download
                    </Button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-sm text-neutral-500">
                No documents attached to this purchase return.
              </div>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
};

