-- Soft-delete support for inventory items (deactivate when still referenced).
DEFINE FIELD IF NOT EXISTS deleted_at ON inventory_item TYPE option<datetime|null> PERMISSIONS FULL;
