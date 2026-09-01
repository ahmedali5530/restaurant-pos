-- Flexible payroll: pay-type basis, work days, and snapshot overrides

DEFINE FIELD expected_work_days ON employee_pay_profile TYPE option<float|null>
  PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD work_weekdays ON employee_pay_profile TYPE any DEFAULT []
  PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;

DEFINE FIELD pay_type ON payroll_snapshot TYPE option<string|null>
  PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD paid_days ON payroll_snapshot TYPE option<float|null>
  PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD unpaid_leave_days ON payroll_snapshot TYPE option<float|null>
  PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD expected_work_days ON payroll_snapshot TYPE option<float|null>
  PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD is_overridden ON payroll_snapshot TYPE bool DEFAULT false
  PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD overridden_by ON payroll_snapshot TYPE option<record<user>|null>
  PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD overridden_at ON payroll_snapshot TYPE option<datetime|null>
  PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD override_note ON payroll_snapshot TYPE option<string|null>
  PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
