-- Manual FOH availability (sold-out) + optional sale count window.
-- available defaults true; available_qty null = unlimited; set_at stamps when qty is saved.

DEFINE FIELD IF NOT EXISTS available ON menu_item TYPE option<bool> DEFAULT true PERMISSIONS FULL;
DEFINE FIELD IF NOT EXISTS available_qty ON menu_item TYPE option<float|null> PERMISSIONS FULL;
DEFINE FIELD IF NOT EXISTS available_qty_set_at ON menu_item TYPE option<datetime|null> PERMISSIONS FULL;
