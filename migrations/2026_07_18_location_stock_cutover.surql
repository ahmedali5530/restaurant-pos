-- Location stock SoT cutover
-- SurrealDB 3.x — apply via:
--   ./migrations/scripts/apply-migration.sh migrations/2026_07_18_location_stock_cutover.surql
-- Then run data remap:
--   ./migrations/scripts/run-backfill-location-refs.sh

-- Ensure location table fields exist
DEFINE TABLE IF NOT EXISTS inventory_location TYPE NORMAL SCHEMAFULL PERMISSIONS NONE;
DEFINE FIELD OVERWRITE created_at ON inventory_location TYPE datetime DEFAULT time::now() PERMISSIONS FULL;
DEFINE FIELD OVERWRITE name ON inventory_location TYPE string PERMISSIONS FULL;
DEFINE FIELD OVERWRITE type ON inventory_location TYPE string PERMISSIONS FULL;
DEFINE FIELD OVERWRITE linked_store ON inventory_location TYPE option<record<inventory_store>> PERMISSIONS FULL;
DEFINE FIELD OVERWRITE linked_kitchen ON inventory_location TYPE option<record<kitchen>> PERMISSIONS FULL;
DEFINE FIELD OVERWRITE is_active ON inventory_location TYPE bool DEFAULT true PERMISSIONS FULL;
DEFINE INDEX IF NOT EXISTS inventory_location_store ON inventory_location FIELDS linked_store;
DEFINE INDEX IF NOT EXISTS inventory_location_kitchen ON inventory_location FIELDS linked_kitchen;

-- Ensure store/kitchen locations exist (idempotent insert)
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

LET $existing_kitchen_locations = (
	SELECT VALUE linked_kitchen FROM inventory_location WHERE linked_kitchen != NONE
);
INSERT INTO inventory_location (
	SELECT
		name,
		'Kitchen' AS type,
		id AS linked_kitchen,
		true AS is_active,
		time::now() AS created_at
	FROM kitchen
	WHERE deleted_at = NONE AND id NOT IN $existing_kitchen_locations
);

-- Document location fields (keep legacy store fields for historical rows)
DEFINE FIELD OVERWRITE location ON inventory_purchase TYPE option<record<inventory_location>> PERMISSIONS FULL;
DEFINE FIELD OVERWRITE location ON inventory_purchase_item TYPE option<record<inventory_location>> PERMISSIONS FULL;
DEFINE FIELD OVERWRITE location ON inventory_purchase_order TYPE option<record<inventory_location>> PERMISSIONS FULL;
DEFINE FIELD OVERWRITE location ON inventory_purchase_return TYPE option<record<inventory_location>> PERMISSIONS FULL;
DEFINE FIELD OVERWRITE location ON inventory_purchase_return_item TYPE option<record<inventory_location>> PERMISSIONS FULL;
DEFINE FIELD OVERWRITE location ON inventory_issue TYPE option<record<inventory_location>> PERMISSIONS FULL;
DEFINE FIELD OVERWRITE location ON inventory_issue_item TYPE option<record<inventory_location>> PERMISSIONS FULL;
DEFINE FIELD OVERWRITE location ON inventory_issue_return TYPE option<record<inventory_location>> PERMISSIONS FULL;
DEFINE FIELD OVERWRITE location ON inventory_issue_return_item TYPE option<record<inventory_location>> PERMISSIONS FULL;
DEFINE FIELD OVERWRITE location ON inventory_item_waste_item TYPE option<record<inventory_location>> PERMISSIONS FULL;
DEFINE FIELD OVERWRITE location ON inventory_adjustment TYPE option<record<inventory_location>> PERMISSIONS FULL;
DEFINE FIELD OVERWRITE location ON inventory_adjustment_item TYPE option<record<inventory_location>> PERMISSIONS FULL;
DEFINE FIELD OVERWRITE location ON production_batch TYPE option<record<inventory_location>> PERMISSIONS FULL;
DEFINE FIELD OVERWRITE location ON production_batch_input TYPE option<record<inventory_location>> PERMISSIONS FULL;
DEFINE FIELD OVERWRITE location ON production_batch_output TYPE option<record<inventory_location>> PERMISSIONS FULL;
DEFINE FIELD OVERWRITE location ON buffet_session TYPE option<record<inventory_location>> PERMISSIONS FULL;

DEFINE FIELD OVERWRITE locations ON inventory_item TYPE option<array<record<inventory_location>>> PERMISSIONS FULL;

DEFINE FIELD OVERWRITE from_location ON stock_transfer TYPE option<record<inventory_location>> PERMISSIONS FULL;
DEFINE FIELD OVERWRITE to_location ON stock_transfer TYPE option<record<inventory_location>> PERMISSIONS FULL;

-- Temporary field for ledger remap (script fills, then swaps type).
-- After remap, backfill-location-refs.cjs removes inventory_location (store-typed)
-- and redefines it as record<inventory_location>. Do not redefine here while
-- existing rows still hold inventory_store ids — that would fail coercion.
DEFINE FIELD OVERWRITE inventory_location_new ON inventory_ledger TYPE option<record<inventory_location>> PERMISSIONS FULL;
