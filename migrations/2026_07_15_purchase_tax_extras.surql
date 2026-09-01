-- Purchase invoice tax (rate % of taxable lines) and freeform extras

DEFINE FIELD OVERWRITE tax_rate ON inventory_purchase TYPE none | float | null PERMISSIONS FULL;
DEFINE FIELD OVERWRITE tax_amount ON inventory_purchase TYPE none | float | null PERMISSIONS FULL;
DEFINE FIELD OVERWRITE extras ON inventory_purchase TYPE none | array | null PERMISSIONS FULL;

DEFINE FIELD OVERWRITE taxable ON inventory_purchase_item TYPE none | bool | null PERMISSIONS FULL;

DEFINE FIELD OVERWRITE taxable ON inventory_item TYPE none | bool | null PERMISSIONS FULL;
