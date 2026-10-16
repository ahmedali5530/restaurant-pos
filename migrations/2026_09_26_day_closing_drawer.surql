-- ------------------------------
-- day_closing: drawer float, variance, batch + shift recap
-- ------------------------------

DEFINE FIELD IF NOT EXISTS drawer_float ON day_closing TYPE option<float> PERMISSIONS FULL;
DEFINE FIELD OVERWRITE variance_reason ON day_closing TYPE none | string | null PERMISSIONS FULL;
DEFINE FIELD IF NOT EXISTS batch_totals ON day_closing TYPE any PERMISSIONS FULL;
DEFINE FIELD IF NOT EXISTS shift_recap ON day_closing TYPE any PERMISSIONS FULL;
