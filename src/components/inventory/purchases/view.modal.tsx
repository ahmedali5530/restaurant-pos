import {useEffect, useMemo, useState} from "react";
import {useTranslation} from "react-i18next";
import {InventoryPurchase} from "@/api/model/inventory_purchase.ts";
import {Modal} from "@/components/common/react-aria/modal.tsx";
import {useDB} from "@/api/db/db.ts";
import {withInventoryCurrency} from "@/lib/inventory/rounding.ts";
import {mapPurchaseToInvoice} from "@/lib/inventory/invoice.mapper.ts";
import {InventoryInvoice} from "@/components/inventory/common/inventory.invoice.tsx";
import {InventoryDocumentAttachments} from "@/components/inventory/common/document.attachments.tsx";
import {shouldShowBusinessDate} from "@/lib/inventory/quantity.display.ts";
import {toAppBusinessDate} from "@/lib/datetime.ts";

interface Props {
  open: boolean;
  purchase: InventoryPurchase | null;
  onClose: () => void;
}

export const InventoryPurchaseViewModal = ({open, purchase, onClose}: Props) => {
  const {t} = useTranslation("inventory");
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
          `SELECT * FROM ONLY ${purchase.id} FETCH supplier, purchase_order, purchase_order.supplier, items, items.item, items.supplier, items.location, created_by, documents`
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

  const invoiceDoc = useMemo(
    () => (viewPurchase ? mapPurchaseToInvoice(viewPurchase) : null),
    [viewPurchase]
  );

  const showBizDate =
    viewPurchase &&
    shouldShowBusinessDate(
      viewPurchase.created_at,
      (viewPurchase as any).business_date,
      toAppBusinessDate
    );

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
          <div className="animate-spin rounded-full h-10 w-10 border-4 border-border border-t-primary" />
        </div>
      )}

      {!loading && viewPurchase && invoiceDoc && (
        <div className="space-y-6">
          {showBizDate && (
            <div className="text-sm text-muted">
              {t("columns.businessDate", {defaultValue: "Business date"})}:{" "}
              {(viewPurchase as any).business_date}
            </div>
          )}
          <InventoryInvoice doc={invoiceDoc} />

          {viewPurchase.cost_allocation_snapshot?.summary && (
            <div className="bg-surface-elevated rounded-xl shadow border border-border p-4 text-sm space-y-1">
              <div className="text-sm font-semibold text-foreground mb-2">
                {t("totals.finalInventoryValue")}
              </div>
              <div className="flex justify-between">
                <span className="text-muted">{t("totals.inventoryValueBefore")}</span>
                <span className="font-medium">
                  {withInventoryCurrency(viewPurchase.cost_allocation_snapshot.summary.purchase_value)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted">{t("totals.landedCost")}</span>
                <span className="font-medium">
                  {withInventoryCurrency(viewPurchase.cost_allocation_snapshot.summary.capitalized_extras)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted">{t("totals.tax")}</span>
                <span className="font-medium">
                  {withInventoryCurrency(viewPurchase.cost_allocation_snapshot.summary.capitalized_tax)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted">{t("totals.discount")}</span>
                <span className="font-medium">
                  {withInventoryCurrency(viewPurchase.cost_allocation_snapshot.summary.capitalized_discount)}
                </span>
              </div>
              <div className="flex justify-between border-t border-border pt-1 font-semibold">
                <span>{t("totals.inventoryValueAfter")}</span>
                <span>
                  {withInventoryCurrency(viewPurchase.cost_allocation_snapshot.summary.final_inventory_value)}
                </span>
              </div>
            </div>
          )}

          {viewPurchase.items?.some((item) => item.final_unit_cost != null) && (
            <div className="bg-surface-elevated rounded-xl shadow border border-border p-4">
              <div className="text-sm font-semibold text-foreground mb-3">
                {t("totals.finalUnitCost")}
              </div>
              <div className="divide-y divide-neutral-200 text-sm">
                {viewPurchase.items.map((item) =>
                  item.final_unit_cost == null ? null : (
                    <div key={item.id} className="py-2 flex justify-between gap-3">
                      <span>{item.item?.name ?? "Item"}</span>
                      <span className="font-medium tabular-nums">
                        {withInventoryCurrency(item.purchase_price ?? item.price)} →{" "}
                        {withInventoryCurrency(item.final_unit_cost)}
                      </span>
                    </div>
                  )
                )}
              </div>
            </div>
          )}

          <InventoryDocumentAttachments
            documents={viewPurchase.documents as any}
            downloadPrefix={`purchase-${viewPurchase.invoice_number}`}
          />
        </div>
      )}
    </Modal>
  );
};
