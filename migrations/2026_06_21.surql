-- Buffet management system

DEFINE FIELD OVERWRITE store ON TABLE inventory_item_waste_item TYPE option<record<inventory_store>|null> PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;

DEFINE TABLE buffet_menu SCHEMAFULL;
DEFINE FIELD name ON buffet_menu TYPE string PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD code ON buffet_menu TYPE option<string|null> PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD session_type ON buffet_menu TYPE string DEFAULT 'lunch' ASSERT $value IN ['breakfast','lunch','dinner'] PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD is_active ON buffet_menu TYPE bool DEFAULT true PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD notes ON buffet_menu TYPE option<string|null> PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD created_at ON buffet_menu TYPE datetime DEFAULT time::now() PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD created_by ON buffet_menu TYPE record<user> PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE INDEX bm_active ON buffet_menu FIELDS is_active;

DEFINE TABLE buffet_menu_item SCHEMAFULL;
DEFINE FIELD menu ON buffet_menu_item TYPE record<buffet_menu> PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD recipe ON buffet_menu_item TYPE record<recipe> PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD per_guest_qty ON buffet_menu_item TYPE float DEFAULT 1 PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD sort_order ON buffet_menu_item TYPE int DEFAULT 0 PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE INDEX bmi_menu ON buffet_menu_item FIELDS menu;

DEFINE TABLE buffet_session SCHEMAFULL;
DEFINE FIELD menu ON buffet_session TYPE record<buffet_menu> PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD store ON buffet_session TYPE record<inventory_store> PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD business_date ON buffet_session TYPE string PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD session_type ON buffet_session TYPE string DEFAULT 'lunch' ASSERT $value IN ['breakfast','lunch','dinner'] PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD status ON buffet_session TYPE string DEFAULT 'draft' ASSERT $value IN ['draft','planned','in_progress','closing','closed','voided'] PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD expected_guests ON buffet_session TYPE int DEFAULT 0 PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD actual_guests ON buffet_session TYPE int DEFAULT 0 PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD buffet_price ON buffet_session TYPE float DEFAULT 0 PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD scheduled_start ON buffet_session TYPE option<datetime|null> PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD scheduled_end ON buffet_session TYPE option<datetime|null> PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD session_number ON buffet_session TYPE string PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD posted_to_ledger ON buffet_session TYPE bool DEFAULT false PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD notes ON buffet_session TYPE option<string|null> PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD created_at ON buffet_session TYPE datetime DEFAULT time::now() PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD created_by ON buffet_session TYPE record<user> PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD started_at ON buffet_session TYPE option<datetime|null> PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD closed_at ON buffet_session TYPE option<datetime|null> PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD closed_by ON buffet_session TYPE option<record<user>|null> PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE INDEX bs_store_date_type ON buffet_session FIELDS store, business_date, session_type;

DEFINE TABLE buffet_production_batch SCHEMAFULL;
DEFINE FIELD session ON buffet_production_batch TYPE record<buffet_session> PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD menu_item ON buffet_production_batch TYPE record<buffet_menu_item> PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD production_batch ON buffet_production_batch TYPE option<record<production_batch>|null> PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD planned_qty ON buffet_production_batch TYPE float DEFAULT 0 PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD status ON buffet_production_batch TYPE string DEFAULT 'planned' ASSERT $value IN ['planned','completed','skipped'] PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE INDEX bpb_session ON buffet_production_batch FIELDS session;

DEFINE TABLE buffet_stock_snapshot SCHEMAFULL;
DEFINE FIELD session ON buffet_stock_snapshot TYPE record<buffet_session> PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD item ON buffet_stock_snapshot TYPE record<inventory_item> PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD snapshot_type ON buffet_stock_snapshot TYPE string ASSERT $value IN ['start','end','refill'] PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD quantity ON buffet_stock_snapshot TYPE float PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD captured_at ON buffet_stock_snapshot TYPE datetime DEFAULT time::now() PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD captured_by ON buffet_stock_snapshot TYPE record<user> PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD production_batch ON buffet_stock_snapshot TYPE option<record<production_batch>|null> PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD notes ON buffet_stock_snapshot TYPE option<string|null> PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE INDEX bss_session_item_type ON buffet_stock_snapshot FIELDS session, item, snapshot_type UNIQUE;

DEFINE TABLE buffet_guest_count SCHEMAFULL;
DEFINE FIELD session ON buffet_guest_count TYPE record<buffet_session> PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD count_type ON buffet_guest_count TYPE string ASSERT $value IN ['expected','actual','checkpoint'] PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD guest_count ON buffet_guest_count TYPE int PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD recorded_at ON buffet_guest_count TYPE datetime DEFAULT time::now() PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD recorded_by ON buffet_guest_count TYPE record<user> PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE INDEX bgc_session ON buffet_guest_count FIELDS session;

DEFINE TABLE buffet_waste_log SCHEMAFULL;
DEFINE FIELD session ON buffet_waste_log TYPE record<buffet_session> PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD item ON buffet_waste_log TYPE record<inventory_item> PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD quantity ON buffet_waste_log TYPE float PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD reason ON buffet_waste_log TYPE option<string|null> PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD ledger_waste_item ON buffet_waste_log TYPE option<record<inventory_item_waste_item>|null> PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD created_at ON buffet_waste_log TYPE datetime DEFAULT time::now() PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD created_by ON buffet_waste_log TYPE record<user> PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE INDEX bwl_session_item ON buffet_waste_log FIELDS session, item;

DEFINE TABLE buffet_consumption_log SCHEMAFULL;
DEFINE FIELD session ON buffet_consumption_log TYPE record<buffet_session> PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD item ON buffet_consumption_log TYPE record<inventory_item> PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD produced_qty ON buffet_consumption_log TYPE float DEFAULT 0 PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD leftover_qty ON buffet_consumption_log TYPE float DEFAULT 0 PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD total_consumed ON buffet_consumption_log TYPE float DEFAULT 0 PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD guest_consumption ON buffet_consumption_log TYPE float DEFAULT 0 PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD waste_qty ON buffet_consumption_log TYPE float DEFAULT 0 PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD staff_meal_qty ON buffet_consumption_log TYPE float DEFAULT 0 PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD theoretical_guest_qty ON buffet_consumption_log TYPE float DEFAULT 0 PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD variance_qty ON buffet_consumption_log TYPE float DEFAULT 0 PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD unit_food_cost ON buffet_consumption_log TYPE float DEFAULT 0 PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD total_food_cost ON buffet_consumption_log TYPE float DEFAULT 0 PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD posted_to_ledger ON buffet_consumption_log TYPE bool DEFAULT false PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE INDEX bcl_session_item ON buffet_consumption_log FIELDS session, item UNIQUE;
