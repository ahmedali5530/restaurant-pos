-- Per parent-dish overrides for modifier option availability (86 / sale limit).
-- Missing row = inherit global menu_item.available / available_qty only.
-- Contextual sold counts selections of `option` under immediate parent `parent`.

DEFINE TABLE IF NOT EXISTS menu_item_modifier_availability TYPE NORMAL SCHEMAFULL PERMISSIONS NONE;

DEFINE FIELD IF NOT EXISTS parent ON menu_item_modifier_availability TYPE record<menu_item> PERMISSIONS FULL;
DEFINE FIELD IF NOT EXISTS option ON menu_item_modifier_availability TYPE record<menu_item> PERMISSIONS FULL;
DEFINE FIELD IF NOT EXISTS available ON menu_item_modifier_availability TYPE option<bool> DEFAULT true PERMISSIONS FULL;
DEFINE FIELD IF NOT EXISTS available_qty ON menu_item_modifier_availability TYPE option<float|null> PERMISSIONS FULL;
DEFINE FIELD IF NOT EXISTS available_qty_set_at ON menu_item_modifier_availability TYPE option<datetime|null> PERMISSIONS FULL;

DEFINE INDEX IF NOT EXISTS menu_item_modifier_availability_parent_option
  ON menu_item_modifier_availability FIELDS parent, option UNIQUE;
DEFINE INDEX IF NOT EXISTS menu_item_modifier_availability_parent
  ON menu_item_modifier_availability FIELDS parent;
