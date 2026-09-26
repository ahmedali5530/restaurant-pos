-- Snapshot formatted invoice display at mint so later policy edits do not rewrite old checks.
-- invoice_number stays int for fiscal / sort; invoice_display is the cashier-facing string.

DEFINE FIELD OVERWRITE invoice_display ON order TYPE none | string | null PERMISSIONS FULL;
