import {InventoryAdjustmentItem} from "@/api/model/inventory_adjustment.ts";
import {InventoryIssueItem} from "@/api/model/inventory_issue.ts";
import {InventoryIssueReturnItem} from "@/api/model/inventory_issue_return.ts";
import {InventoryPurchase} from "@/api/model/inventory_purchase.ts";
import {InventoryPurchaseOrderItem} from "@/api/model/inventory_purchase_order.ts";
import {InventoryPurchaseReturnItem} from "@/api/model/inventory_purchase_return.ts";
import {InventoryWasteItem} from "@/api/model/inventory_waste.ts";
import {
  lineAmount,
  resolveCatalogUnitCost,
  resolveInventoryLineUnitCost,
} from "@/lib/inventory/line.cost.ts";
import {computePurchaseTotals} from "@/lib/inventory/purchase.totals.ts";
import {safeNumber} from "@/lib/utils.ts";

/** Purchase list total matches receipt grand total (subtotal + tax + extras). */
export const purchaseListTotal = (purchase: InventoryPurchase | null | undefined): number => {
  if (!purchase) return 0;
  const totals = computePurchaseTotals(purchase.items, purchase.tax_rate, purchase.extras);
  const tax = purchase.tax_amount ?? totals.taxAmount;
  return totals.subtotal + tax + totals.extrasTotal;
};

export const purchaseOrderListTotal = (
  items: InventoryPurchaseOrderItem[] | null | undefined,
): number =>
  (items ?? []).reduce((sum, item) => {
    const qty = safeNumber(item.quantity);
    const unitCost = resolveInventoryLineUnitCost({
      price: item.price,
      item: item.item,
    });
    return sum + lineAmount(unitCost, qty);
  }, 0);

export const purchaseReturnListTotal = (
  items: InventoryPurchaseReturnItem[] | null | undefined,
): number =>
  (items ?? []).reduce((sum, item) => {
    const qty = safeNumber(item.quantity);
    const unitCost = resolveInventoryLineUnitCost({
      price: item.price,
      purchaseItem: item.purchase_item,
      item: item.item,
    });
    return sum + lineAmount(unitCost, qty);
  }, 0);

export const issueListTotal = (
  items: InventoryIssueItem[] | null | undefined,
): number =>
  (items ?? []).reduce((sum, item) => {
    const qty = safeNumber(item.quantity);
    const unitCost = resolveInventoryLineUnitCost({
      price: item.price,
      item: item.item,
    });
    return sum + lineAmount(unitCost, qty);
  }, 0);

export const issueReturnListTotal = (
  items: InventoryIssueReturnItem[] | null | undefined,
): number =>
  (items ?? []).reduce((sum, item) => {
    const qty = safeNumber(item.quantity);
    const unitCost = resolveInventoryLineUnitCost({
      price: item.price,
      issuedItem: item.issued_item,
      item: item.item,
    });
    return sum + lineAmount(unitCost, qty);
  }, 0);

export const wasteListTotal = (
  items: InventoryWasteItem[] | null | undefined,
): number =>
  (items ?? []).reduce((sum, item) => {
    const qty = safeNumber(item.quantity);
    const unitCost = resolveInventoryLineUnitCost({
      price: item.price,
      purchaseItem: item.purchase_item,
      issueItem: item.issue_item,
      item: item.item,
    });
    return sum + lineAmount(unitCost, qty);
  }, 0);

export const adjustmentListTotal = (
  items: InventoryAdjustmentItem[] | null | undefined,
): number =>
  (items ?? []).reduce((sum, item) => {
    const qty = Math.abs(safeNumber(item.quantity_change));
    const unitCost =
      item.unit_cost != null && Number.isFinite(Number(item.unit_cost))
        ? safeNumber(item.unit_cost)
        : resolveCatalogUnitCost(item.item);
    return sum + lineAmount(unitCost, qty);
  }, 0);
