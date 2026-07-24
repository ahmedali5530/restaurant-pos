-- Order bill print tracking (temp / final attempts)
-- SurrealDB 3.x — apply with:
--   ./migrations/scripts/apply-migration.sh migrations/2026_07_24_order_print.surql

DEFINE TABLE IF NOT EXISTS order_print TYPE NORMAL SCHEMAFULL PERMISSIONS NONE;

DEFINE FIELD OVERWRITE order ON order_print TYPE record<order> PERMISSIONS FULL;
DEFINE FIELD OVERWRITE print_type ON order_print TYPE string ASSERT $value INSIDE ['temp', 'final'] PERMISSIONS FULL;
DEFINE FIELD OVERWRITE printed_by ON order_print TYPE option<record<user>> PERMISSIONS FULL;
DEFINE FIELD OVERWRITE printed_at ON order_print TYPE datetime DEFAULT time::now() PERMISSIONS FULL;
DEFINE FIELD OVERWRITE is_override ON order_print TYPE bool DEFAULT false PERMISSIONS FULL;
DEFINE FIELD OVERWRITE is_duplicate ON order_print TYPE bool DEFAULT false PERMISSIONS FULL;

DEFINE INDEX IF NOT EXISTS order_print_order_type ON order_print FIELDS order, print_type;
