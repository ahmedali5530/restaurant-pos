-- Enterprise Labor & HR: scheduling

DEFINE TABLE schedule_template SCHEMAFULL;
DEFINE FIELD name ON schedule_template TYPE string PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD shift_template ON schedule_template TYPE option<record<shift>|null> PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD department ON schedule_template TYPE option<record<department>|null> PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD position ON schedule_template TYPE option<record<position>|null> PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD cost_center ON schedule_template TYPE option<record<cost_center>|null> PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD days_of_week ON schedule_template TYPE array<int> DEFAULT [] PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD start_time ON schedule_template TYPE string PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD end_time ON schedule_template TYPE string PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD break_minutes ON schedule_template TYPE option<float|null> PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD is_active ON schedule_template TYPE bool DEFAULT true PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD deleted_at ON schedule_template TYPE option<datetime|null> PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;

DEFINE TABLE work_schedule SCHEMAFULL;
DEFINE FIELD name ON work_schedule TYPE string PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD period_start ON work_schedule TYPE datetime PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD period_end ON work_schedule TYPE datetime PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD status ON work_schedule TYPE string DEFAULT 'draft' PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD published_at ON work_schedule TYPE option<datetime|null> PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD published_by ON work_schedule TYPE option<record<user>|null> PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE INDEX IF NOT EXISTS ws_period ON work_schedule FIELDS period_start, period_end;

DEFINE TABLE scheduled_shift SCHEMAFULL;
DEFINE FIELD work_schedule ON scheduled_shift TYPE option<record<work_schedule>|null> PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD employee ON scheduled_shift TYPE record<employee> PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD shift_template ON scheduled_shift TYPE option<record<shift>|null> PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD department ON scheduled_shift TYPE option<record<department>|null> PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD position ON scheduled_shift TYPE option<record<position>|null> PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD cost_center ON scheduled_shift TYPE option<record<cost_center>|null> PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD start_at ON scheduled_shift TYPE datetime PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD end_at ON scheduled_shift TYPE datetime PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD status ON scheduled_shift TYPE string DEFAULT 'scheduled' PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD notes ON scheduled_shift TYPE option<string|null> PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE INDEX IF NOT EXISTS ss_employee_start ON scheduled_shift FIELDS employee, start_at;
DEFINE INDEX IF NOT EXISTS ss_schedule ON scheduled_shift FIELDS work_schedule;

DEFINE TABLE shift_swap_request SCHEMAFULL;
DEFINE FIELD scheduled_shift ON shift_swap_request TYPE record<scheduled_shift> PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD requesting_employee ON shift_swap_request TYPE record<employee> PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD target_employee ON shift_swap_request TYPE option<record<employee>|null> PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD proposed_shift ON shift_swap_request TYPE option<record<scheduled_shift>|null> PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD status ON shift_swap_request TYPE string DEFAULT 'pending' PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD approved_by ON shift_swap_request TYPE option<record<user>|null> PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD approved_at ON shift_swap_request TYPE option<datetime|null> PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD auth_permission ON shift_swap_request TYPE option<record<auth_permission>|null> PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;

DEFINE FIELD OVERWRITE scheduled_shift ON time_entry TYPE option<record<scheduled_shift>|null> PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
