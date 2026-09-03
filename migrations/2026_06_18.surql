-- Kitchen inventory end-of-day reconciliation

DEFINE TABLE kitchen_reconciliation SCHEMAFULL;
DEFINE FIELD kitchen ON kitchen_reconciliation TYPE record<kitchen> PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD business_date ON kitchen_reconciliation TYPE string PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD date_from ON kitchen_reconciliation TYPE datetime PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD date_to ON kitchen_reconciliation TYPE datetime PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD status ON kitchen_reconciliation TYPE string ASSERT $value IN ['draft','verified','missed'] PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD revision ON kitchen_reconciliation TYPE int DEFAULT 1 PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD parent ON kitchen_reconciliation TYPE option<record<kitchen_reconciliation>|null> PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD superseded_by ON kitchen_reconciliation TYPE option<record<kitchen_reconciliation>|null> PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD created_at ON kitchen_reconciliation TYPE datetime DEFAULT time::now() PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD created_by ON kitchen_reconciliation TYPE record<user> PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD verified_at ON kitchen_reconciliation TYPE option<datetime|null> PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD verified_by ON kitchen_reconciliation TYPE option<record<user>|null> PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD notes ON kitchen_reconciliation TYPE option<string|null> PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE INDEX kr_kitchen_date_rev ON kitchen_reconciliation FIELDS kitchen, business_date, revision UNIQUE;

DEFINE TABLE kitchen_reconciliation_item SCHEMAFULL;
DEFINE FIELD reconciliation ON kitchen_reconciliation_item TYPE record<kitchen_reconciliation> PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD item ON kitchen_reconciliation_item TYPE record<inventory_item> PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD opening_stock ON kitchen_reconciliation_item TYPE float DEFAULT 0 PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD issued_qty ON kitchen_reconciliation_item TYPE float DEFAULT 0 PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD transfers_in ON kitchen_reconciliation_item TYPE float DEFAULT 0 PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD transfers_out ON kitchen_reconciliation_item TYPE float DEFAULT 0 PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD theoretical_consumption ON kitchen_reconciliation_item TYPE float DEFAULT 0 PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD expected_stock ON kitchen_reconciliation_item TYPE float DEFAULT 0 PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD physical_count ON kitchen_reconciliation_item TYPE option<float|null> PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD waste_qty ON kitchen_reconciliation_item TYPE float DEFAULT 0 PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD staff_meal_qty ON kitchen_reconciliation_item TYPE float DEFAULT 0 PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD complimentary_qty ON kitchen_reconciliation_item TYPE float DEFAULT 0 PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD actual_consumption ON kitchen_reconciliation_item TYPE float DEFAULT 0 PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD variance ON kitchen_reconciliation_item TYPE float DEFAULT 0 PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD posted_to_ledger ON kitchen_reconciliation_item TYPE bool DEFAULT false PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE INDEX kr_item_unique ON kitchen_reconciliation_item FIELDS reconciliation, item UNIQUE;

DEFINE TABLE kitchen_stock_count SCHEMAFULL;
DEFINE FIELD reconciliation ON kitchen_stock_count TYPE record<kitchen_reconciliation> PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD item ON kitchen_stock_count TYPE record<inventory_item> PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD quantity ON kitchen_stock_count TYPE float PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD counted_at ON kitchen_stock_count TYPE datetime DEFAULT time::now() PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD counted_by ON kitchen_stock_count TYPE record<user> PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE INDEX ksc_recon_item ON kitchen_stock_count FIELDS reconciliation, item UNIQUE;

DEFINE TABLE kitchen_waste SCHEMAFULL;
DEFINE FIELD reconciliation ON kitchen_waste TYPE record<kitchen_reconciliation> PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD item ON kitchen_waste TYPE record<inventory_item> PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD quantity ON kitchen_waste TYPE float PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD reason ON kitchen_waste TYPE option<string|null> PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD created_at ON kitchen_waste TYPE datetime DEFAULT time::now() PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD created_by ON kitchen_waste TYPE record<user> PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD ledger_waste_item ON kitchen_waste TYPE option<record<inventory_item_waste_item>|null> PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;

DEFINE TABLE kitchen_staff_meal SCHEMAFULL;
DEFINE FIELD reconciliation ON kitchen_staff_meal TYPE record<kitchen_reconciliation> PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD item ON kitchen_staff_meal TYPE record<inventory_item> PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD quantity ON kitchen_staff_meal TYPE float PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD notes ON kitchen_staff_meal TYPE option<string|null> PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD dish ON kitchen_staff_meal TYPE option<record<menu_item>|null> PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD created_at ON kitchen_staff_meal TYPE datetime DEFAULT time::now() PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD created_by ON kitchen_staff_meal TYPE record<user> PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD ledger_waste_item ON kitchen_staff_meal TYPE option<record<inventory_item_waste_item>|null> PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;

DEFINE TABLE kitchen_complimentary_item SCHEMAFULL;
DEFINE FIELD reconciliation ON kitchen_complimentary_item TYPE record<kitchen_reconciliation> PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD item ON kitchen_complimentary_item TYPE record<inventory_item> PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD quantity ON kitchen_complimentary_item TYPE float PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD order_item ON kitchen_complimentary_item TYPE option<record<order_item>|null> PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD created_at ON kitchen_complimentary_item TYPE datetime DEFAULT time::now() PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD created_by ON kitchen_complimentary_item TYPE record<user> PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD ledger_waste_item ON kitchen_complimentary_item TYPE option<record<inventory_item_waste_item>|null> PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;

DEFINE TABLE kitchen_reconciliation_revision SCHEMAFULL;
DEFINE FIELD reconciliation ON kitchen_reconciliation_revision TYPE record<kitchen_reconciliation> PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD revision_number ON kitchen_reconciliation_revision TYPE int PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD change_type ON kitchen_reconciliation_revision TYPE string PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD changed_by ON kitchen_reconciliation_revision TYPE record<user> PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD changed_at ON kitchen_reconciliation_revision TYPE datetime DEFAULT time::now() PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD snapshot_before ON kitchen_reconciliation_revision TYPE any PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD snapshot_after ON kitchen_reconciliation_revision TYPE any PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD field_changes ON kitchen_reconciliation_revision TYPE any DEFAULT [] PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;

DEFINE TABLE stock_transfer SCHEMAFULL;
DEFINE FIELD from_kitchen ON stock_transfer TYPE option<record<kitchen>|null> PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD to_kitchen ON stock_transfer TYPE option<record<kitchen>|null> PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD from_store ON stock_transfer TYPE option<record<inventory_store>|null> PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD to_store ON stock_transfer TYPE option<record<inventory_store>|null> PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD created_at ON stock_transfer TYPE datetime DEFAULT time::now() PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD created_by ON stock_transfer TYPE record<user> PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD notes ON stock_transfer TYPE option<string|null> PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;

DEFINE TABLE stock_transfer_item SCHEMAFULL;
DEFINE FIELD transfer ON stock_transfer_item TYPE record<stock_transfer> PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD item ON stock_transfer_item TYPE record<inventory_item> PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD quantity ON stock_transfer_item TYPE float PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
