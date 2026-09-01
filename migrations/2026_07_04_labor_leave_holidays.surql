-- Enterprise Labor & HR: leave management + public holidays

DEFINE TABLE leave_type SCHEMAFULL;
DEFINE FIELD code ON leave_type TYPE string PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD name ON leave_type TYPE string PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD paid ON leave_type TYPE bool DEFAULT true PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD requires_approval ON leave_type TYPE bool DEFAULT true PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD max_days_per_year ON leave_type TYPE option<float|null> PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD accrual_rate ON leave_type TYPE option<float|null> PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD is_active ON leave_type TYPE bool DEFAULT true PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD deleted_at ON leave_type TYPE option<datetime|null> PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE INDEX IF NOT EXISTS lt_code ON leave_type FIELDS code UNIQUE;

DEFINE TABLE leave_balance SCHEMAFULL;
DEFINE FIELD employee ON leave_balance TYPE record<employee> PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD leave_type ON leave_balance TYPE record<leave_type> PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD year ON leave_balance TYPE int PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD accrued ON leave_balance TYPE float DEFAULT 0 PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD used ON leave_balance TYPE float DEFAULT 0 PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD pending ON leave_balance TYPE float DEFAULT 0 PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD carried_over ON leave_balance TYPE float DEFAULT 0 PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE INDEX IF NOT EXISTS lb_employee_type_year ON leave_balance FIELDS employee, leave_type, year UNIQUE;

DEFINE TABLE leave_request SCHEMAFULL;
DEFINE FIELD employee ON leave_request TYPE record<employee> PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD leave_type ON leave_request TYPE record<leave_type> PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD start_date ON leave_request TYPE datetime PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD end_date ON leave_request TYPE datetime PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD days ON leave_request TYPE float PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD status ON leave_request TYPE string DEFAULT 'pending' PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD reason ON leave_request TYPE option<string|null> PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD approved_by ON leave_request TYPE option<record<user>|null> PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD approved_at ON leave_request TYPE option<datetime|null> PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD auth_permission ON leave_request TYPE option<record<auth_permission>|null> PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD created_at ON leave_request TYPE datetime DEFAULT time::now() PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD created_by ON leave_request TYPE option<record<user>|null> PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE INDEX IF NOT EXISTS lr_employee ON leave_request FIELDS employee;

DEFINE TABLE public_holiday SCHEMAFULL;
DEFINE FIELD name ON public_holiday TYPE string PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD date ON public_holiday TYPE datetime PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD country_code ON public_holiday TYPE option<string|null> PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD is_recurring ON public_holiday TYPE bool DEFAULT false PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD recurrence_rule ON public_holiday TYPE any PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD labor_policy ON public_holiday TYPE option<record<labor_policy>|null> PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD is_active ON public_holiday TYPE bool DEFAULT true PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD deleted_at ON public_holiday TYPE option<datetime|null> PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE INDEX IF NOT EXISTS ph_date ON public_holiday FIELDS date;
