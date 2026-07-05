-- Enterprise Labor & HR: extend time_entry + breaks

DEFINE FIELD OVERWRITE employee ON time_entry TYPE option<record<employee>|null> PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD OVERWRITE shift_template ON time_entry TYPE option<record<shift>|null> PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD OVERWRITE attendance_status ON time_entry TYPE string DEFAULT 'present' PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD OVERWRITE approval_status ON time_entry TYPE option<string|null> PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD OVERWRITE approved_by ON time_entry TYPE option<record<user>|null> PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD OVERWRITE approved_at ON time_entry TYPE option<datetime|null> PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD OVERWRITE source ON time_entry TYPE string DEFAULT 'clock' PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD OVERWRITE notes ON time_entry TYPE option<string|null> PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD OVERWRITE late_minutes ON time_entry TYPE option<float|null> PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD OVERWRITE early_leave_minutes ON time_entry TYPE option<float|null> PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD OVERWRITE original_time_entry ON time_entry TYPE option<record<time_entry>|null> PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;

DEFINE TABLE time_entry_break SCHEMAFULL;
DEFINE FIELD time_entry ON time_entry_break TYPE record<time_entry> PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD break_type ON time_entry_break TYPE string DEFAULT 'unpaid' PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD start_at ON time_entry_break TYPE datetime PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD end_at ON time_entry_break TYPE option<datetime|null> PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD duration_seconds ON time_entry_break VALUE (IF $after.end_at != NONE { time::unix($after.end_at) - time::unix($after.start_at) } ELSE { NONE }) PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD missed ON time_entry_break TYPE bool DEFAULT false PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD approved_by ON time_entry_break TYPE option<record<user>|null> PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE INDEX IF NOT EXISTS teb_time_entry ON time_entry_break FIELDS time_entry;
