import type {
  InventoryPurchaseExtra,
  PurchaseAllocationMethod,
  PurchaseCostCategory,
  PurchaseInventoryTreatment,
  PurchaseTaxBehavior,
} from "@/api/model/inventory_purchase.ts";
import type { InventorySettings } from "@/api/model/inventory_settings.ts";

export type NormalizedPurchaseExtra = Required<
  Pick<
    InventoryPurchaseExtra,
    "name" | "amount" | "category" | "allocation_method" | "inventory_treatment"
  >
> & {
  tax_behavior: PurchaseTaxBehavior | null;
  notes?: string;
  account_hint?: string;
  manual_allocations?: InventoryPurchaseExtra["manual_allocations"];
  /** True when this component was synthesized from header tax_rate */
  synthetic?: boolean;
};

export type AllocationLineInput = {
  id: string;
  quantity: number;
  price: number;
  taxable?: boolean | null;
  weight?: number | null;
  volume?: number | null;
};

export type LineAllocationResult = {
  purchase_item_id: string;
  quantity: number;
  purchase_price: number;
  /** Total (line) allocated extras before /qty — used to derive per-unit */
  allocated_extra_total: number;
  allocated_tax_total: number;
  allocated_discount_total: number;
  allocated_extra_cost: number;
  allocated_tax: number;
  allocated_discount: number;
  final_unit_cost: number;
  total_inventory_cost: number;
};

export type ComponentAllocationBreakdown = {
  name: string;
  category: PurchaseCostCategory;
  amount: number;
  inventory_treatment: PurchaseInventoryTreatment;
  allocation_method: PurchaseAllocationMethod;
  capitalized: boolean;
  line_amounts: { purchase_item_id: string; amount: number }[];
};

export type PurchaseCostAllocationResult = {
  lines: LineAllocationResult[];
  components: ComponentAllocationBreakdown[];
  summary: {
    purchase_value: number;
    capitalized_extras: number;
    capitalized_tax: number;
    capitalized_discount: number;
    final_inventory_value: number;
    expense_total: number;
    ignored_total: number;
  };
};

export type AllocatePurchaseCostsInput = {
  lines: AllocationLineInput[];
  extras?: InventoryPurchaseExtra[] | null;
  tax_rate?: number | string | null;
  tax_amount?: number | string | null;
  settings: Pick<
    InventorySettings,
    | "enable_landed_costs"
    | "enable_purchase_discounts"
    | "enable_purchase_taxes"
    | "default_allocation_method"
    | "default_purchase_tax_behavior"
  >;
};

export type AllocatorLine = {
  id: string;
  quantity: number;
  value: number;
  weight?: number;
  volume?: number;
};

export type CostAllocator = (
  total: number,
  lines: AllocatorLine[],
  extra: NormalizedPurchaseExtra
) => { id: string; amount: number }[];
