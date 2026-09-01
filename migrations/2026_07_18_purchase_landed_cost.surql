-- Purchase landed cost: calculated line fields + header allocation snapshot.
-- Extends 2026_07_15_purchase_tax_extras (tax/extras remain freeform arrays).

-- Purchase header: tax/extras (idempotent if already applied) + allocation snapshot
DEFINE FIELD OVERWRITE tax_rate ON inventory_purchase TYPE none | float | null PERMISSIONS FULL;
DEFINE FIELD OVERWRITE tax_amount ON inventory_purchase TYPE none | float | null PERMISSIONS FULL;
DEFINE FIELD OVERWRITE extras ON inventory_purchase TYPE none | array | null PERMISSIONS FULL;
DEFINE FIELD OVERWRITE cost_allocation_snapshot ON inventory_purchase TYPE any PERMISSIONS FULL;

-- Purchase line: tax flag + calculated landed-cost fields (written at post only)
DEFINE FIELD OVERWRITE taxable ON inventory_purchase_item TYPE none | bool | null PERMISSIONS FULL;
DEFINE FIELD OVERWRITE purchase_price ON inventory_purchase_item TYPE none | float | null PERMISSIONS FULL;
DEFINE FIELD OVERWRITE allocated_extra_cost ON inventory_purchase_item TYPE none | float | null PERMISSIONS FULL;
DEFINE FIELD OVERWRITE allocated_tax ON inventory_purchase_item TYPE none | float | null PERMISSIONS FULL;
DEFINE FIELD OVERWRITE allocated_discount ON inventory_purchase_item TYPE none | float | null PERMISSIONS FULL;
DEFINE FIELD OVERWRITE final_unit_cost ON inventory_purchase_item TYPE none | float | null PERMISSIONS FULL;
DEFINE FIELD OVERWRITE total_inventory_cost ON inventory_purchase_item TYPE none | float | null PERMISSIONS FULL;

-- Catalog taxable flag (idempotent)
DEFINE FIELD OVERWRITE taxable ON inventory_item TYPE none | bool | null PERMISSIONS FULL;
