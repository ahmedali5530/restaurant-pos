-- Inventory document revisions (Phase 5) + adjustments (Phase 7) + locations (Phase 8)
-- Optional ledger batch/expiry columns (Phase 9)
-- SurrealDB 3.x — apply via:
--   ./migrations/scripts/apply-migration.sh migrations/2026_07_18_inventory_phases_5_9.surql

-- ===== Phase 5: revision fields on purchase / issue =====
DEFINE FIELD OVERWRITE revision ON inventory_purchase TYPE int DEFAULT 1 PERMISSIONS FULL;
DEFINE FIELD OVERWRITE parent ON inventory_purchase TYPE option<record<inventory_purchase>> PERMISSIONS FULL;
DEFINE FIELD OVERWRITE superseded_by ON inventory_purchase TYPE option<record<inventory_purchase>> PERMISSIONS FULL;

DEFINE FIELD OVERWRITE revision ON inventory_issue TYPE int DEFAULT 1 PERMISSIONS FULL;
DEFINE FIELD OVERWRITE parent ON inventory_issue TYPE option<record<inventory_issue>> PERMISSIONS FULL;
DEFINE FIELD OVERWRITE superseded_by ON inventory_issue TYPE option<record<inventory_issue>> PERMISSIONS FULL;

UPDATE inventory_purchase SET revision = 1 WHERE revision = NONE;
UPDATE inventory_issue SET revision = 1 WHERE revision = NONE;

-- ===== Phase 7: inventory adjustments =====
DEFINE TABLE IF NOT EXISTS inventory_adjustment TYPE NORMAL SCHEMAFULL PERMISSIONS NONE;
DEFINE FIELD OVERWRITE created_at ON inventory_adjustment TYPE datetime DEFAULT time::now() PERMISSIONS FULL;
DEFINE FIELD OVERWRITE created_by ON inventory_adjustment TYPE option<record<user>> PERMISSIONS FULL;
DEFINE FIELD OVERWRITE invoice_number ON inventory_adjustment TYPE int PERMISSIONS FULL;
DEFINE FIELD OVERWRITE status ON inventory_adjustment TYPE string DEFAULT 'draft' PERMISSIONS FULL;
DEFINE FIELD OVERWRITE reason ON inventory_adjustment TYPE string PERMISSIONS FULL;
DEFINE FIELD OVERWRITE notes ON inventory_adjustment TYPE option<string> PERMISSIONS FULL;
DEFINE FIELD OVERWRITE store ON inventory_adjustment TYPE option<record<inventory_store>> PERMISSIONS FULL;
DEFINE FIELD OVERWRITE items ON inventory_adjustment TYPE option<array<record<inventory_adjustment_item>>> PERMISSIONS FULL;
DEFINE FIELD OVERWRITE approved_at ON inventory_adjustment TYPE option<datetime> PERMISSIONS FULL;
DEFINE FIELD OVERWRITE approved_by ON inventory_adjustment TYPE option<record<user>> PERMISSIONS FULL;
DEFINE FIELD OVERWRITE posted_at ON inventory_adjustment TYPE option<datetime> PERMISSIONS FULL;
DEFINE FIELD OVERWRITE posted_by ON inventory_adjustment TYPE option<record<user>> PERMISSIONS FULL;
DEFINE FIELD OVERWRITE voided_at ON inventory_adjustment TYPE option<datetime> PERMISSIONS FULL;
DEFINE FIELD OVERWRITE voided_by ON inventory_adjustment TYPE option<record<user>> PERMISSIONS FULL;
DEFINE FIELD OVERWRITE cancelled_at ON inventory_adjustment TYPE option<datetime> PERMISSIONS FULL;
DEFINE FIELD OVERWRITE cancelled_by ON inventory_adjustment TYPE option<record<user>> PERMISSIONS FULL;
DEFINE INDEX IF NOT EXISTS inventory_adjustment_invoice ON inventory_adjustment FIELDS invoice_number UNIQUE;

DEFINE TABLE IF NOT EXISTS inventory_adjustment_item TYPE NORMAL SCHEMAFULL PERMISSIONS NONE;
DEFINE FIELD OVERWRITE adjustment ON inventory_adjustment_item TYPE option<record<inventory_adjustment>> PERMISSIONS FULL;
DEFINE FIELD OVERWRITE item ON inventory_adjustment_item TYPE record<inventory_item> PERMISSIONS FULL;
DEFINE FIELD OVERWRITE store ON inventory_adjustment_item TYPE option<record<inventory_store>> PERMISSIONS FULL;
DEFINE FIELD OVERWRITE quantity_change ON inventory_adjustment_item TYPE float PERMISSIONS FULL;
DEFINE FIELD OVERWRITE unit_cost ON inventory_adjustment_item TYPE option<float> PERMISSIONS FULL;
DEFINE FIELD OVERWRITE comments ON inventory_adjustment_item TYPE option<string> PERMISSIONS FULL;

-- ===== Phase 8: inventory locations (shim over stores / kitchens) =====
DEFINE TABLE IF NOT EXISTS inventory_location TYPE NORMAL SCHEMAFULL PERMISSIONS NONE;
DEFINE FIELD OVERWRITE created_at ON inventory_location TYPE datetime DEFAULT time::now() PERMISSIONS FULL;
DEFINE FIELD OVERWRITE name ON inventory_location TYPE string PERMISSIONS FULL;
DEFINE FIELD OVERWRITE type ON inventory_location TYPE string PERMISSIONS FULL;
DEFINE FIELD OVERWRITE linked_store ON inventory_location TYPE option<record<inventory_store>> PERMISSIONS FULL;
DEFINE FIELD OVERWRITE linked_kitchen ON inventory_location TYPE option<record<kitchen>> PERMISSIONS FULL;
DEFINE FIELD OVERWRITE is_active ON inventory_location TYPE bool DEFAULT true PERMISSIONS FULL;
DEFINE INDEX IF NOT EXISTS inventory_location_store ON inventory_location FIELDS linked_store;
DEFINE INDEX IF NOT EXISTS inventory_location_kitchen ON inventory_location FIELDS linked_kitchen;

-- Backfill one location per store (type Store). Kitchen locations created on demand by shim.
-- SurrealQL: INSERT INTO table (SELECT ...) — not SQL-style INSERT (cols) SELECT ...
LET $existing_store_locations = (
	SELECT VALUE linked_store FROM inventory_location WHERE linked_store != NONE
);
INSERT INTO inventory_location (
	SELECT
		name,
		'Store' AS type,
		id AS linked_store,
		true AS is_active,
		time::now() AS created_at
	FROM inventory_store
	WHERE id NOT IN $existing_store_locations
);

-- ===== Phase 9: optional batch / expiry on ledger =====
DEFINE FIELD OVERWRITE batch_code ON inventory_ledger TYPE option<string> PERMISSIONS FULL;
DEFINE FIELD OVERWRITE expiry_date ON inventory_ledger TYPE option<string> PERMISSIONS FULL;
DEFINE FIELD OVERWRITE manufacturing_date ON inventory_ledger TYPE option<string> PERMISSIONS FULL;
