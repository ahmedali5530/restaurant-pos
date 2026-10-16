-- Unblock inventory posting when ledger.inventory_location was left typed as
-- record<inventory_store> after the location cutover. Posting writes
-- inventory_location records; SCHEMAFULL rejected those creates and the
-- whole BEGIN/COMMIT transaction failed.
--
-- Widen first (Surreal revalidates existing field values on any UPDATE).
-- Prefer inventory_location_new when present, then drop the temp field.
-- Leave a union type so any leftover store refs remain readable; the
-- backfill-location-refs script can tighten to record<inventory_location>.

DEFINE FIELD OVERWRITE inventory_location ON inventory_ledger TYPE option<record<inventory_location> | record<inventory_store>> PERMISSIONS FULL;

DEFINE FIELD OVERWRITE inventory_location_new ON inventory_ledger TYPE option<record<inventory_location>> PERMISSIONS FULL;

UPDATE inventory_ledger SET inventory_location = inventory_location_new
  WHERE inventory_location_new != NONE;

REMOVE FIELD IF EXISTS inventory_location_new ON inventory_ledger;
UPDATE inventory_ledger UNSET inventory_location_new;
