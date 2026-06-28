-- Multiple taxes and inclusive/exclusive pricing support for menu items

-- Add new fields to menu_menu_item table
DEFINE FIELD OVERWRITE taxes ON TABLE menu_menu_item TYPE option<array<record<tax>>|null> PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD OVERWRITE tax_mode ON TABLE menu_menu_item TYPE string DEFAULT 'exclusive' ASSERT $value IN ['exclusive', 'inclusive'] PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD OVERWRITE base_price ON TABLE menu_menu_item TYPE option<float|null> PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;

-- Add tax_mode field to order_item table
DEFINE FIELD OVERWRITE tax_mode ON TABLE order_item TYPE string DEFAULT 'exclusive' ASSERT $value IN ['exclusive', 'inclusive'] PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;

-- Create junction table for menu_menu_item taxes
DEFINE TABLE menu_menu_item_tax SCHEMAFULL;
DEFINE FIELD menu_menu_item ON menu_menu_item_tax TYPE record<menu_menu_item> PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD tax ON menu_menu_item_tax TYPE record<tax> PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD priority ON menu_menu_item_tax TYPE int DEFAULT 0 PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE INDEX mmit_unique ON menu_menu_item_tax FIELDS menu_menu_item, tax UNIQUE;

-- Data migration: Set tax_mode to 'exclusive' for all existing order_item records
UPDATE order_item SET tax_mode = 'exclusive';

-- Note: We do NOT migrate existing menu_menu_item records to preserve legacy items
-- Legacy items will continue to use the single 'tax' field
