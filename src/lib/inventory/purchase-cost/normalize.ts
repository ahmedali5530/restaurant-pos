import type {
  InventoryPurchaseExtra,
  PurchaseAllocationMethod,
  PurchaseCostCategory,
  PurchaseInventoryTreatment,
  PurchaseTaxBehavior,
} from "@/api/model/inventory_purchase.ts";
import type { InventorySettings } from "@/api/model/inventory_settings.ts";
import { safeNumber } from "@/lib/utils.ts";
import type { NormalizedPurchaseExtra } from "@/lib/inventory/purchase-cost/types.ts";

const KNOWN_CATEGORIES: PurchaseCostCategory[] = [
  "Shipping",
  "Freight",
  "Insurance",
  "Customs",
  "ImportDuty",
  "Handling",
  "Tax",
  "Discount",
  "Miscellaneous",
];

const capitalizeCategories = new Set([
  "Shipping",
  "Freight",
  "Insurance",
  "Customs",
  "ImportDuty",
  "Handling",
  "Discount",
  "Miscellaneous",
]);

export const inferCategoryFromName = (name: string | null | undefined): PurchaseCostCategory => {
  const n = (name ?? "").toLowerCase();
  if (!n) return "Miscellaneous";
  if (n.includes("discount") || n.includes("rebate")) return "Discount";
  if (n.includes("shipping") || n.includes("ship")) return "Shipping";
  if (n.includes("freight")) return "Freight";
  if (n.includes("insurance")) return "Insurance";
  if (n.includes("customs") || n.includes("custom")) return "Customs";
  if (n.includes("duty") || n.includes("import")) return "ImportDuty";
  if (n.includes("handling") || n.includes("handle")) return "Handling";
  if (n.includes("tax") || n.includes("vat") || n.includes("gst")) return "Tax";
  return "Miscellaneous";
};

export const defaultTreatmentForCategory = (
  category: PurchaseCostCategory
): PurchaseInventoryTreatment => {
  if (category === "Tax") return "ignore"; // refined by tax_behavior in allocate
  if (capitalizeCategories.has(category)) return "capitalize";
  return "capitalize";
};

export const defaultTaxBehaviorForCategory = (
  category: PurchaseCostCategory,
  settings?: Pick<InventorySettings, "default_purchase_tax_behavior">
): PurchaseTaxBehavior | null => {
  if (category !== "Tax") return null;
  return settings?.default_purchase_tax_behavior ?? "non_recoverable";
};

const VALID_METHODS = new Set<PurchaseAllocationMethod>([
  "by_value",
  "by_quantity",
  "by_weight",
  "by_volume",
  "equal",
  "manual",
]);

const VALID_TREATMENTS = new Set<PurchaseInventoryTreatment>([
  "capitalize",
  "expense",
  "ignore",
]);

const VALID_TAX = new Set<PurchaseTaxBehavior>([
  "recoverable",
  "non_recoverable",
  "inclusive",
  "exclusive",
]);

export const normalizePurchaseExtra = (
  extra: InventoryPurchaseExtra | null | undefined,
  settings?: Pick<
    InventorySettings,
    "default_allocation_method" | "default_purchase_tax_behavior"
  >
): NormalizedPurchaseExtra | null => {
  if (!extra) return null;
  const name = String(extra.name ?? "").trim() || "Extra";
  const amount = safeNumber(extra.amount);
  const rawCategory = extra.category?.trim();
  const category: PurchaseCostCategory =
    rawCategory && (KNOWN_CATEGORIES.includes(rawCategory) || rawCategory.length > 0)
      ? rawCategory
      : inferCategoryFromName(name);

  const allocation_method: PurchaseAllocationMethod =
    extra.allocation_method && VALID_METHODS.has(extra.allocation_method)
      ? extra.allocation_method
      : settings?.default_allocation_method ?? "by_value";

  let inventory_treatment: PurchaseInventoryTreatment =
    extra.inventory_treatment && VALID_TREATMENTS.has(extra.inventory_treatment)
      ? extra.inventory_treatment
      : defaultTreatmentForCategory(category);

  let tax_behavior: PurchaseTaxBehavior | null =
    extra.tax_behavior && VALID_TAX.has(extra.tax_behavior)
      ? extra.tax_behavior
      : defaultTaxBehaviorForCategory(category, settings);

  // Non-recoverable tax capitalizes; recoverable/inclusive ignore for inventory
  if (category === "Tax" && !extra.inventory_treatment) {
    if (tax_behavior === "non_recoverable" || tax_behavior === "exclusive") {
      inventory_treatment = "capitalize";
    } else {
      inventory_treatment = "ignore";
    }
  }

  // Discount amounts should reduce inventory: store as negative if UI gave positive
  let normalizedAmount = amount;
  if (category === "Discount" && normalizedAmount > 0) {
    normalizedAmount = -normalizedAmount;
  }

  return {
    name,
    amount: normalizedAmount,
    category,
    allocation_method,
    inventory_treatment,
    tax_behavior,
    notes: extra.notes,
    account_hint: extra.account_hint,
    manual_allocations: extra.manual_allocations,
  };
};

export const normalizePurchaseExtras = (
  extras: InventoryPurchaseExtra[] | null | undefined,
  settings?: Pick<
    InventorySettings,
    "default_allocation_method" | "default_purchase_tax_behavior"
  >
): NormalizedPurchaseExtra[] =>
  (extras ?? [])
    .map((e) => normalizePurchaseExtra(e, settings))
    .filter((e): e is NormalizedPurchaseExtra => e != null);

/** Build a typed extra payload for persistence from UI convenience fields. */
export const buildTypedExtra = (params: {
  name: string;
  amount: number;
  category: PurchaseCostCategory;
  allocation_method?: PurchaseAllocationMethod;
  inventory_treatment?: PurchaseInventoryTreatment;
  tax_behavior?: PurchaseTaxBehavior | null;
  notes?: string;
}): InventoryPurchaseExtra => ({
  name: params.name,
  amount: params.amount,
  category: params.category,
  allocation_method: params.allocation_method ?? "by_value",
  inventory_treatment: params.inventory_treatment ?? defaultTreatmentForCategory(params.category),
  tax_behavior: params.tax_behavior ?? defaultTaxBehaviorForCategory(params.category),
  notes: params.notes,
});
