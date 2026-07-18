-- Unified inventory ledger (Phase 2)
-- Single source of truth for stock movements. Backfill via
-- migrations/scripts/backfill-inventory-ledger.cjs before enabling
-- inventory_settings.inventory_ledger_enabled.
--
-- SurrealDB 3.x — apply with the container CLI (host surreal 2.x is incompatible):
--   ./migrations/scripts/apply-migration.sh migrations/2026_07_17_inventory_ledger.surql

DEFINE TABLE IF NOT EXISTS inventory_ledger TYPE NORMAL SCHEMAFULL PERMISSIONS NONE;

DEFINE FIELD OVERWRITE created_at ON inventory_ledger TYPE datetime DEFAULT time::now() PERMISSIONS FULL;
DEFINE FIELD OVERWRITE created_by ON inventory_ledger TYPE option<record<user>> PERMISSIONS FULL;
DEFINE FIELD OVERWRITE business_date ON inventory_ledger TYPE string PERMISSIONS FULL;
DEFINE FIELD OVERWRITE inventory_item ON inventory_ledger TYPE record<inventory_item> PERMISSIONS FULL;
DEFINE FIELD OVERWRITE inventory_location ON inventory_ledger TYPE record<inventory_store> PERMISSIONS FULL;
DEFINE FIELD OVERWRITE quantity_change ON inventory_ledger TYPE float PERMISSIONS FULL;
DEFINE FIELD OVERWRITE unit_cost ON inventory_ledger TYPE option<float> PERMISSIONS FULL;
DEFINE FIELD OVERWRITE total_cost ON inventory_ledger TYPE option<float> PERMISSIONS FULL;
DEFINE FIELD OVERWRITE reference_type ON inventory_ledger TYPE string PERMISSIONS FULL;
DEFINE FIELD OVERWRITE reference_id ON inventory_ledger TYPE string PERMISSIONS FULL;
DEFINE FIELD OVERWRITE reference_item ON inventory_ledger TYPE option<string> PERMISSIONS FULL;
DEFINE FIELD OVERWRITE reversal_of ON inventory_ledger TYPE option<record<inventory_ledger>> PERMISSIONS FULL;
DEFINE FIELD OVERWRITE notes ON inventory_ledger TYPE option<string> PERMISSIONS FULL;
DEFINE FIELD OVERWRITE ledger_key ON inventory_ledger TYPE string PERMISSIONS FULL;

DEFINE INDEX IF NOT EXISTS inventory_ledger_key ON inventory_ledger FIELDS ledger_key UNIQUE;
DEFINE INDEX IF NOT EXISTS inventory_ledger_item_location ON inventory_ledger FIELDS inventory_item, inventory_location;
DEFINE INDEX IF NOT EXISTS inventory_ledger_reference ON inventory_ledger FIELDS reference_type, reference_id;
DEFINE INDEX IF NOT EXISTS inventory_ledger_business_date ON inventory_ledger FIELDS business_date;
