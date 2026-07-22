import {useEffect, useMemo, useState} from "react";
import { useTranslation } from 'react-i18next';
import {InventoryPurchase} from "@/api/model/inventory_purchase.ts";
import {Modal} from "@/components/common/react-aria/modal.tsx";
import {useDB} from "@/api/db/db.ts";
import {FontAwesomeIcon} from "@fortawesome/react-fontawesome";
import {faDownload, faFile} from "@fortawesome/free-solid-svg-icons";
import {downloadArrayBuffer} from "@/utils/files.ts";
import {Button} from "@/components/common/input/button.tsx";
import {formatDateTime} from "@/lib/datetime.ts";
import {formatNumber, withCurrency} from "@/lib/utils.ts";
import {computePurchaseTotals} from "@/lib/inventory/purchase.totals.ts";
import {lineAmount} from "@/lib/inventory/line.cost.ts";

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

  const totals = useMemo(() => {
    if (!viewPurchase) return null;
    return computePurchaseTotals(
      viewPurchase.items,
      viewPurchase.tax_rate,
      viewPurchase.extras,
    );
  }, [viewPurchase]);

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
                {viewPurchase.created_at ? formatDateTime(viewPurchase.created_at) : "—"}
              </div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm text-neutral-700">
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
              <div>
                <div className="text-neutral-500 text-xs uppercase">{t('totals.taxRate')}</div>
                <div>{viewPurchase.tax_rate ?? 0}%</div>
              </div>
              <div className="md:col-span-2">
                <div className="text-neutral-500 text-xs uppercase">{t('forms.comments')}</div>
                <div>{viewPurchase.comments || "—"}</div>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow border border-neutral-200 p-4">
            <div className="text-sm font-semibold text-neutral-800 mb-3">
              {t('tabs.items')}
            </div>
            {viewPurchase.items && viewPurchase.items.length > 0 ? (
              <div className="overflow-x-auto max-h-80 overflow-y-auto rounded-lg border border-neutral-200">
                <table className="min-w-full divide-y divide-neutral-200 text-sm">
                  <thead className="bg-neutral-50 sticky top-0">
                    <tr>
                      <th className="py-2 pl-3 pr-2 text-left text-xs font-semibold text-neutral-600">{t('columns.name')}</th>
                      <th className="py-2 px-2 text-left text-xs font-semibold text-neutral-600">{t('columns.suppliers')}</th>
                      <th className="py-2 px-2 text-left text-xs font-semibold text-neutral-600">{t('columns.store')}</th>
                      <th className="py-2 px-2 text-right text-xs font-semibold text-neutral-600">{t('forms.quantity')}</th>
                      <th className="py-2 px-2 text-right text-xs font-semibold text-neutral-600">{t('columns.baseQuantity')}</th>
                      <th className="py-2 px-2 text-right text-xs font-semibold text-neutral-600">{t('columns.price')}</th>
                      <th className="py-2 px-2 text-right text-xs font-semibold text-neutral-600">{t('columns.amount')}</th>
                      <th className="py-2 px-2 text-center text-xs font-semibold text-neutral-600">{t('forms.taxable')}</th>
                      <th className="py-2 pl-2 pr-3 text-left text-xs font-semibold text-neutral-600">{t('forms.comments')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100 bg-white">
                    {viewPurchase.items.map((item) => {
                      const amount = lineAmount(item.price, item.quantity);
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
                            {item.supplier?.name ?? "—"}
                          </td>
                          <td className="py-2 px-2 align-top text-neutral-700">
                            {item.store?.name ?? "—"}
                          </td>
                          <td className="py-2 px-2 align-top text-right tabular-nums text-neutral-700">
                            {formatNumber(item.quantity)}
                          </td>
                          <td className="py-2 px-2 align-top text-right tabular-nums text-neutral-700">
                            {formatNumber(item.base_quantity)}
                          </td>
                          <td className="py-2 px-2 align-top text-right tabular-nums text-neutral-700">
                            {withCurrency(item.price)}
                          </td>
                          <td className="py-2 px-2 align-top text-right tabular-nums font-medium text-neutral-900">
                            {withCurrency(amount)}
                          </td>
                          <td className="py-2 px-2 align-top text-center text-neutral-700">
                            {item.taxable ? "Yes" : "No"}
                          </td>
                          <td className="py-2 pl-2 pr-3 align-top text-neutral-600 max-w-[160px] truncate" title={item.comments ?? undefined}>
                            {item.comments || "—"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-sm text-neutral-500">
                No items found for this purchase.
              </div>
            )}
          </div>

          {viewPurchase.extras && viewPurchase.extras.length > 0 && (
            <div className="bg-white rounded-xl shadow border border-neutral-200 p-4">
              <div className="text-sm font-semibold text-neutral-800 mb-3">{t('totals.extras')}</div>
              <div className="divide-y divide-neutral-200">
                {viewPurchase.extras.map((extra, index) => (
                  <div key={`${extra.name}-${index}`} className="py-2 flex justify-between text-sm gap-3">
                    <span>
                      {extra.name}
                      {extra.category ? (
                        <span className="text-neutral-500 text-xs ml-2">
                          ({t(`costCategories.${extra.category}`, { defaultValue: extra.category })})
                        </span>
                      ) : null}
                    </span>
                    <span className="font-medium">{withCurrency(extra.amount)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {totals && (
            <div className="bg-white rounded-xl shadow border border-neutral-200 p-4 text-sm space-y-1">
              <div className="flex justify-between">
                <span className="text-neutral-600">{t('totals.subtotal')}</span>
                <span className="font-medium">{withCurrency(totals.subtotal)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-neutral-600">{t('totals.tax')}</span>
                <span className="font-medium">
                  {withCurrency(viewPurchase.tax_amount ?? totals.taxAmount)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-neutral-600">{t('totals.extras')}</span>
                <span className="font-medium">{withCurrency(totals.extrasTotal)}</span>
              </div>
              <div className="flex justify-between border-t border-neutral-200 pt-1 font-semibold">
                <span>{t('totals.grandTotal')}</span>
                <span>
                  {withCurrency(
                    totals.subtotal +
                      (viewPurchase.tax_amount ?? totals.taxAmount) +
                      totals.extrasTotal
                  )}
                </span>
              </div>
            </div>
          )}

          {viewPurchase.cost_allocation_snapshot?.summary && (
            <div className="bg-white rounded-xl shadow border border-neutral-200 p-4 text-sm space-y-1">
              <div className="text-sm font-semibold text-neutral-800 mb-2">
                {t('totals.finalInventoryValue')}
              </div>
              <div className="flex justify-between">
                <span className="text-neutral-600">{t('totals.inventoryValueBefore')}</span>
                <span className="font-medium">
                  {withCurrency(viewPurchase.cost_allocation_snapshot.summary.purchase_value)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-neutral-600">{t('totals.landedCost')}</span>
                <span className="font-medium">
                  {withCurrency(viewPurchase.cost_allocation_snapshot.summary.capitalized_extras)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-neutral-600">{t('totals.tax')}</span>
                <span className="font-medium">
                  {withCurrency(viewPurchase.cost_allocation_snapshot.summary.capitalized_tax)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-neutral-600">{t('totals.discount')}</span>
                <span className="font-medium">
                  {withCurrency(viewPurchase.cost_allocation_snapshot.summary.capitalized_discount)}
                </span>
              </div>
              <div className="flex justify-between border-t border-neutral-200 pt-1 font-semibold">
                <span>{t('totals.inventoryValueAfter')}</span>
                <span>
                  {withCurrency(viewPurchase.cost_allocation_snapshot.summary.final_inventory_value)}
                </span>
              </div>
            </div>
          )}

          {viewPurchase.items?.some((item) => item.final_unit_cost != null) && (
            <div className="bg-white rounded-xl shadow border border-neutral-200 p-4">
              <div className="text-sm font-semibold text-neutral-800 mb-3">
                {t('totals.finalUnitCost')}
              </div>
              <div className="divide-y divide-neutral-200 text-sm">
                {viewPurchase.items.map((item) =>
                  item.final_unit_cost == null ? null : (
                    <div key={item.id} className="py-2 flex justify-between gap-3">
                      <span>{item.item?.name ?? "Item"}</span>
                      <span className="font-medium tabular-nums">
                        {withCurrency(item.purchase_price ?? item.price)} →{" "}
                        {withCurrency(item.final_unit_cost)}
                      </span>
                    </div>
                  )
                )}
              </div>
            </div>
          )}

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
