-- Freeze the currency a payroll snapshot's amounts were calculated in, so
-- historical snapshots are not re-labeled when the linked pay profile's
-- currency is later changed.

DEFINE FIELD IF NOT EXISTS currency ON payroll_snapshot TYPE option<string|null>
  PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
