-- ------------------------------
-- day_closing: shift linkage
-- ------------------------------
-- Lets multiple closings coexist for the same closing-cycle window (one per
-- shift) instead of every closing in the window sharing a single record.

DEFINE FIELD IF NOT EXISTS shift ON day_closing TYPE option<record<shift>> PERMISSIONS FULL;
DEFINE INDEX IF NOT EXISTS dc_date_from_shift ON day_closing FIELDS date_from, shift;
