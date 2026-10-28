-- Optional entered_* fields so documents reopen in the unit the user typed.
-- quantity / price remain the stock-unit pair used by posting and costing.

DEFINE FIELD OVERWRITE entered_quantity ON inventory_purchase_item TYPE none | float | null PERMISSIONS FULL;
DEFINE FIELD OVERWRITE entered_uom ON inventory_purchase_item TYPE none | string | null PERMISSIONS FULL;
DEFINE FIELD OVERWRITE entered_price ON inventory_purchase_item TYPE none | float | null PERMISSIONS FULL;

DEFINE FIELD OVERWRITE entered_quantity ON inventory_purchase_order_item TYPE none | float | null PERMISSIONS FULL;
DEFINE FIELD OVERWRITE entered_uom ON inventory_purchase_order_item TYPE none | string | null PERMISSIONS FULL;
DEFINE FIELD OVERWRITE entered_price ON inventory_purchase_order_item TYPE none | float | null PERMISSIONS FULL;

DEFINE FIELD OVERWRITE entered_quantity ON inventory_purchase_return_item TYPE none | float | null PERMISSIONS FULL;
DEFINE FIELD OVERWRITE entered_uom ON inventory_purchase_return_item TYPE none | string | null PERMISSIONS FULL;
DEFINE FIELD OVERWRITE entered_price ON inventory_purchase_return_item TYPE none | float | null PERMISSIONS FULL;

DEFINE FIELD OVERWRITE entered_quantity ON inventory_issue_item TYPE none | float | null PERMISSIONS FULL;
DEFINE FIELD OVERWRITE entered_uom ON inventory_issue_item TYPE none | string | null PERMISSIONS FULL;
DEFINE FIELD OVERWRITE entered_price ON inventory_issue_item TYPE none | float | null PERMISSIONS FULL;

DEFINE FIELD OVERWRITE entered_quantity ON inventory_issue_return_item TYPE none | float | null PERMISSIONS FULL;
DEFINE FIELD OVERWRITE entered_uom ON inventory_issue_return_item TYPE none | string | null PERMISSIONS FULL;
DEFINE FIELD OVERWRITE entered_price ON inventory_issue_return_item TYPE none | float | null PERMISSIONS FULL;

DEFINE FIELD OVERWRITE entered_quantity ON inventory_item_waste_item TYPE none | float | null PERMISSIONS FULL;
DEFINE FIELD OVERWRITE entered_uom ON inventory_item_waste_item TYPE none | string | null PERMISSIONS FULL;
DEFINE FIELD OVERWRITE entered_price ON inventory_item_waste_item TYPE none | float | null PERMISSIONS FULL;

DEFINE FIELD OVERWRITE entered_quantity ON inventory_adjustment_item TYPE none | float | null PERMISSIONS FULL;
DEFINE FIELD OVERWRITE entered_uom ON inventory_adjustment_item TYPE none | string | null PERMISSIONS FULL;
DEFINE FIELD OVERWRITE entered_price ON inventory_adjustment_item TYPE none | float | null PERMISSIONS FULL;

DEFINE FIELD OVERWRITE entered_quantity ON stock_transfer_item TYPE none | float | null PERMISSIONS FULL;
DEFINE FIELD OVERWRITE entered_uom ON stock_transfer_item TYPE none | string | null PERMISSIONS FULL;
DEFINE FIELD OVERWRITE entered_price ON stock_transfer_item TYPE none | float | null PERMISSIONS FULL;

DEFINE FIELD OVERWRITE entered_quantity ON menu_item_recipe TYPE none | float | null PERMISSIONS FULL;
DEFINE FIELD OVERWRITE entered_uom ON menu_item_recipe TYPE none | string | null PERMISSIONS FULL;
DEFINE FIELD OVERWRITE entered_price ON menu_item_recipe TYPE none | float | null PERMISSIONS FULL;

DEFINE FIELD OVERWRITE entered_quantity ON recipe_item TYPE none | float | null PERMISSIONS FULL;
DEFINE FIELD OVERWRITE entered_uom ON recipe_item TYPE none | string | null PERMISSIONS FULL;
DEFINE FIELD OVERWRITE entered_price ON recipe_item TYPE none | float | null PERMISSIONS FULL;
