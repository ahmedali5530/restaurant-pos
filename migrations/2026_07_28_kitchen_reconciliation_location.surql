-- Kitchen reconciliation: location is the stock identity (no kitchen required).
-- Legacy kitchen field remains optional for old rows; new writes set location.

DEFINE FIELD OVERWRITE location ON kitchen_reconciliation TYPE none | record<inventory_location> | null PERMISSIONS FULL;
DEFINE FIELD OVERWRITE kitchen ON kitchen_reconciliation TYPE none | record<kitchen> | null PERMISSIONS FULL;

REMOVE INDEX IF EXISTS kr_kitchen_date_rev ON kitchen_reconciliation;
DEFINE INDEX IF NOT EXISTS kr_location_date_rev ON kitchen_reconciliation FIELDS location, business_date, revision UNIQUE;
