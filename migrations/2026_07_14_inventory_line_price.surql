-- Snapshot unit cost on issue return and waste line items for historical amounts

DEFINE FIELD OVERWRITE price ON inventory_issue_return_item TYPE none | float | null PERMISSIONS FULL;
DEFINE FIELD OVERWRITE price ON inventory_item_waste_item TYPE none | float | null PERMISSIONS FULL;
