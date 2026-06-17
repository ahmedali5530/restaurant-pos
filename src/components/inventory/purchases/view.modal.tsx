import {useEffect, useState} from "react";
import { useTranslation } from 'react-i18next';
import {InventoryPurchase} from "@/api/model/inventory_purchase.ts";
import {Modal} from "@/components/common/react-aria/modal.tsx";
import {useDB} from "@/api/db/db.ts";
import {FontAwesomeIcon} from "@fortawesome/react-fontawesome";
import {faDownload, faFile} from "@fortawesome/free-solid-svg-icons";
import {downloadArrayBuffer} from "@/utils/files.ts";
import {Button} from "@/components/common/input/button.tsx";
import { toJsDate } from "@/lib/datetime.ts";

interface Props {
  open: boolean;
  purchase: InventoryPurchase | null;
  onClose: () => void;
}

export const InventoryPurchaseViewModal = ({open, purchase, onClose}: Props) => {
  const { t } = useTranslation('inventory');
  const db = useDB();
  const [viewPurchase, setViewPurchase] = useState<InventoryPurchase | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const fetchDetails = async () => {
      if (!open || !purchase?.id) {
        setViewPurchase(null);
        return;
      }

      setLoading(true);
      try {
        const [result] = await db.query(
          `SELECT * FROM ONLY ${purchase.id} FETCH supplier, purchase_order, purchase_order.supplier, items, items.item, items.supplier, items.store, created_by, documents`
        );
        setViewPurchase(result as any);
      } catch (e) {
        console.error("Failed to load purchase details", e);
        setViewPurchase(null);
      } finally {
        setLoading(false);
      }
    };

    fetchDetails();
  }, [open, purchase?.id]);

  if (!open) {
    return null;
  }

  return (
    <Modal
      title={viewPurchase ? `Purchase #${viewPurchase.invoice_number}` : "Purchase"}
      open={open}
      onClose={onClose}
      size="xl"
    >
      {loading && (
        <div className="flex items-center justify-center py-10">
          <div className="animate-spin rounded-full h-10 w-10 border-4 border-neutral-300 border-t-primary-500"></div>
        </div>
      )}

      {!loading && viewPurchase && (
        <div className="space-y-6">
          <div className="bg-white rounded-xl shadow border border-neutral-200 p-4 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <div className="text-lg font-semibold">
                Invoice #{viewPurchase.invoice_number}
              </div>
              <div className="text-xs text-neutral-500">
                {viewPurchase.created_at ? toJsDate(viewPurchase.created_at).toLocaleString() : "—"}
              </div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm text-neutral-700">
              <div>
                <div className="text-neutral-500 text-xs uppercase">Supplier</div>
                <div>{viewPurchase.supplier?.name ?? "—"}</div>
              </div>
              <div>
                <div className="text-neutral-500 text-xs uppercase">Purchase order</div>
                <div>{viewPurchase.purchase_order ? `PO #${viewPurchase.purchase_order.po_number}` : "—"}</div>
              </div>
              <div>
                <div className="text-neutral-500 text-xs uppercase">{t('columns.createdBy')}</div>
                <div>{viewPurchase.created_by?.first_name } {viewPurchase?.created_by?.last_name}</div>
              </div>
              <div>
                <div className="text-neutral-500 text-xs uppercase">Method</div>
                <div>{viewPurchase.method ?? "Manual"}</div>
              </div>
              <div className="md:col-span-2">
                <div className="text-neutral-500 text-xs uppercase">{t('forms.comments')}</div>
                <div>{viewPurchase.comments || "—"}</div>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow border border-neutral-200 p-4">
            <div className="text-sm font-semibold text-neutral-800 mb-3">
              Items
            </div>
            {viewPurchase.items && viewPurchase.items.length > 0 ? (
              <div className="max-h-64 overflow-auto divide-y divide-neutral-200">
                {viewPurchase.items.map((item) => (
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
                      <div className="text-xs text-neutral-500">
                        Base: {item.base_quantity}
                      </div>
                    </div>
                    <div className="w-24 text-right">
                      <div className="text-neutral-700">
                        Price: {item.price}
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
                No items found for this purchase.
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
            {viewPurchase.documents && viewPurchase.documents.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {viewPurchase.documents.map((doc, index) => (
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
                          doc.name ?? `purchase-${viewPurchase.invoice_number}-${index + 1}`,
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
                No documents attached to this purchase.
              </div>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
};

