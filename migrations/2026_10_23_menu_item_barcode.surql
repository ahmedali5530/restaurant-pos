-- Sellable barcode / UPC / EAN for Quick Order (retail) scanning.
-- Null/empty is allowed for non-barcoded items (lookup falls back to menu_item.number).

DEFINE FIELD IF NOT EXISTS barcode ON menu_item TYPE option<string|null> PERMISSIONS FULL;
DEFINE INDEX IF NOT EXISTS mi_barcode ON menu_item FIELDS barcode;
