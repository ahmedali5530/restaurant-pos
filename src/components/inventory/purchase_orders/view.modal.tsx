import {useEffect, useMemo, useState} from "react";
import { useTranslation } from 'react-i18next';
import {InventoryPurchaseOrder} from "@/api/model/inventory_purchase_order.ts";
import {Modal} from "@/components/common/react-aria/modal.tsx";
import {useDB} from "@/api/db/db.ts";
import {FontAwesomeIcon} from "@fortawesome/react-fontawesome";
import {faDownload, faFile} from "@fortawesome/free-solid-svg-icons";
import {downloadArrayBuffer} from "@/utils/files.ts";
import {Button} from "@/components/common/input/button.tsx";
import {formatDateTime} from "@/lib/datetime.ts";
import {formatNumber, withCurrency} from "@/lib/utils.ts";
import {itemsSubtotal} from "@/lib/inventory/purchase.totals.ts";
import {lineAmount} from "@/lib/inventory/line.cost.ts";

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
          `SELECT * FROM only ${order.id} FETCH supplier, items, items.item, items.supplier, items.store, documents`
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

  const itemsTotal = useMemo(
    () => itemsSubtotal(viewOrder?.items),
    [viewOrder?.items],
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
                <div className="text-neutral-500 text-xs uppercase">{t('columns.suppliers')}</div>
                <div>{viewOrder.supplier?.name ?? "—"}</div>
              </div>
              <div>
                <div className="text-neutral-500 text-xs uppercase">{t('columns.createdAt')}</div>
                <div>{viewOrder.created_at ? formatDateTime(viewOrder.created_at) : "—"}</div>
              </div>
              {viewOrder.submitted_at && (
                <div>
                  <div className="text-neutral-500 text-xs uppercase">{t('purchaseOrder.submittedAt')}</div>
                  <div>{formatDateTime(viewOrder.submitted_at)}</div>
                </div>
              )}
              {viewOrder.approved_at && (
                <div>
                  <div className="text-neutral-500 text-xs uppercase">{t('purchaseOrder.approvedAt')}</div>
                  <div>{formatDateTime(viewOrder.approved_at)}</div>
                </div>
              )}
              {viewOrder.rejected_at && (
                <div>
                  <div className="text-neutral-500 text-xs uppercase">{t('purchaseOrder.rejectedAt')}</div>
                  <div>{formatDateTime(viewOrder.rejected_at)}</div>
                </div>
              )}
            </div>
          </div>

          <div className="bg-white rounded-xl shadow border border-neutral-200 p-4">
            <div className="text-sm font-semibold text-neutral-800 mb-3">
              {t('tabs.items')}
            </div>
            {viewOrder.items && viewOrder.items.length > 0 ? (
              <>
                <div className="overflow-x-auto max-h-80 overflow-y-auto rounded-lg border border-neutral-200">
                  <table className="min-w-full divide-y divide-neutral-200 text-sm">
                    <thead className="bg-neutral-50 sticky top-0">
                      <tr>
                        <th className="py-2 pl-3 pr-2 text-left text-xs font-semibold text-neutral-600">{t('columns.name')}</th>
                        <th className="py-2 px-2 text-left text-xs font-semibold text-neutral-600">{t('columns.suppliers')}</th>
                        <th className="py-2 px-2 text-right text-xs font-semibold text-neutral-600">{t('forms.quantity')}</th>
                        <th className="py-2 px-2 text-right text-xs font-semibold text-neutral-600">{t('columns.price')}</th>
                        <th className="py-2 pl-2 pr-3 text-right text-xs font-semibold text-neutral-600">{t('columns.amount')}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-100 bg-white">
                      {viewOrder.items.map((item) => {
                        const price = item.price ?? 0;
                        const amount = lineAmount(price, item.quantity);
                        return (
                          <tr key={item.id}>
                            <td className="py-2 pl-3 pr-2 align-top">
                              <div className="font-medium text-neutral-900">
                                {item.item?.name ?? "Item"}
                              </div>
                              {item.item?.code && (
                                <div className="text-xs text-neutral-500">{item.item.code}</div>
                              )}
                            </td>
                            <td className="py-2 px-2 align-top text-neutral-700">
                              {item.supplier?.name ?? viewOrder.supplier?.name ?? "—"}
                            </td>
                            <td className="py-2 px-2 align-top text-right tabular-nums text-neutral-700">
                              {formatNumber(item.quantity)}
                            </td>
                            <td className="py-2 px-2 align-top text-right tabular-nums text-neutral-700">
                              {withCurrency(price)}
                            </td>
                            <td className="py-2 pl-2 pr-3 align-top text-right tabular-nums font-medium text-neutral-900">
                              {withCurrency(amount)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <div className="mt-3 flex justify-end text-sm">
                  <span className="text-neutral-600 mr-2">{t('totals.lineTotal')}</span>
                  <span className="font-semibold text-neutral-900">{withCurrency(itemsTotal)}</span>
                </div>
              </>
            ) : (
              <div className="text-sm text-neutral-500">
                No items found for this purchase order.
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
