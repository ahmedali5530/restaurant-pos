import {useEffect, useState} from "react";
import { useTranslation } from 'react-i18next';
import {InventoryPurchaseOrder} from "@/api/model/inventory_purchase_order.ts";
import {Modal} from "@/components/common/react-aria/modal.tsx";
import {useDB} from "@/api/db/db.ts";
import {FontAwesomeIcon} from "@fortawesome/react-fontawesome";
import {faDownload, faFile} from "@fortawesome/free-solid-svg-icons";
import {downloadArrayBuffer} from "@/utils/files.ts";
import {Button} from "@/components/common/input/button.tsx";
import { toJsDate } from "@/lib/datetime.ts";

interface Props {
  open: boolean;
  order: InventoryPurchaseOrder | null;
  onClose: () => void;
}

export const InventoryPurchaseOrderViewModal = ({open, order, onClose}: Props) => {
  const { t } = useTranslation('inventory');
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
        // @ts-ignore
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

  if (!open) {
    return null;
  }

  return (
    <Modal
      title={viewOrder ? `Purchase order #${viewOrder.po_number}` : "Purchase order"}
      open={open}
      onClose={onClose}
      size="lg"
    >
      {loading && (
        <div className="flex items-center justify-center py-10">
          <div className="animate-spin rounded-full h-10 w-10 border-4 border-neutral-300 border-t-primary-500"></div>
        </div>
      )}

      {!loading && viewOrder && (
        <div className="space-y-6">
          <div className="bg-white rounded-xl shadow border border-neutral-200 p-4 flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <div className="text-lg font-semibold">
                PO #{viewOrder.po_number}
              </div>
              <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-neutral-100 text-neutral-800">
                {viewOrder.status}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm text-neutral-700">
              <div>
                <div className="text-neutral-500 text-xs uppercase">Supplier</div>
                <div>{viewOrder.supplier?.name ?? "—"}</div>
              </div>
              <div>
                <div className="text-neutral-500 text-xs uppercase">{t('columns.createdAt')}</div>
                <div>{viewOrder.created_at ? toJsDate(viewOrder.created_at).toLocaleString() : "—"}</div>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow border border-neutral-200 p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="text-sm font-semibold text-neutral-800 flex items-center gap-2">
                <FontAwesomeIcon icon={faFile}/>
                <span>{t('upload.attachDocuments')}</span>
              </div>
            </div>
            {viewOrder.documents && viewOrder.documents.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {viewOrder.documents.map((doc, index) => (
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
                          doc.name ?? `purchase-order-${viewOrder.po_number}-${index + 1}`,
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
                No documents attached to this purchase order.
              </div>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
};

