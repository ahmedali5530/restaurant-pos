-- Flexible payroll: pay-type basis, work days, and snapshot overrides

DEFINE FIELD IF NOT EXISTS expected_work_days ON employee_pay_profile TYPE option<float|null>
  PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD IF NOT EXISTS work_weekdays ON employee_pay_profile TYPE any DEFAULT []
  PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;

DEFINE FIELD IF NOT EXISTS pay_type ON payroll_snapshot TYPE option<string|null>
  PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD IF NOT EXISTS paid_days ON payroll_snapshot TYPE option<float|null>
  PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD IF NOT EXISTS unpaid_leave_days ON payroll_snapshot TYPE option<float|null>
  PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD IF NOT EXISTS expected_work_days ON payroll_snapshot TYPE option<float|null>
  PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD IF NOT EXISTS is_overridden ON payroll_snapshot TYPE bool DEFAULT false
  PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD IF NOT EXISTS overridden_by ON payroll_snapshot TYPE option<record<user>|null>
  PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD IF NOT EXISTS overridden_at ON payroll_snapshot TYPE option<datetime|null>
  PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD IF NOT EXISTS override_note ON payroll_snapshot TYPE option<string|null>
  PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
