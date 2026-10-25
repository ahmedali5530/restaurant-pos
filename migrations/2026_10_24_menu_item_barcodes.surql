-- Extra sellable barcodes / UPCs / EANs for Quick Order (case, sleeve, alt codes).
-- Primary code remains menu_item.barcode; this array holds aliases.

DEFINE FIELD IF NOT EXISTS barcodes ON menu_item TYPE option<array<string>|null> PERMISSIONS FULL;
