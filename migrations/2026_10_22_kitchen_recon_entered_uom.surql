-- Kitchen reconciliation: allow counting in a related UOM (same pattern as dish recipes).
-- physical_count / waste_qty / staff_meal_qty / complimentary_qty remain stock-unit values
-- used by variance math and posting. entered_* store what the user typed.

DEFINE FIELD OVERWRITE entered_uom ON kitchen_reconciliation_item TYPE none | string | null PERMISSIONS FULL;
DEFINE FIELD OVERWRITE entered_physical_count ON kitchen_reconciliation_item TYPE none | float | null PERMISSIONS FULL;
DEFINE FIELD OVERWRITE entered_waste_qty ON kitchen_reconciliation_item TYPE none | float | null PERMISSIONS FULL;
DEFINE FIELD OVERWRITE entered_staff_meal_qty ON kitchen_reconciliation_item TYPE none | float | null PERMISSIONS FULL;
DEFINE FIELD OVERWRITE entered_complimentary_qty ON kitchen_reconciliation_item TYPE none | float | null PERMISSIONS FULL;
