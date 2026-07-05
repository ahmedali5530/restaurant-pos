-- Enterprise Labor & HR: documents, performance notes, audit log

DEFINE TABLE employee_document SCHEMAFULL;
DEFINE FIELD employee ON employee_document TYPE record<employee> PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD document ON employee_document TYPE record<document> PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD category ON employee_document TYPE string DEFAULT 'other' PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD title ON employee_document TYPE string PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD expires_at ON employee_document TYPE option<datetime|null> PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD uploaded_by ON employee_document TYPE option<record<user>|null> PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD uploaded_at ON employee_document TYPE datetime DEFAULT time::now() PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE INDEX IF NOT EXISTS ed_employee ON employee_document FIELDS employee;

DEFINE TABLE employee_performance_note SCHEMAFULL;
DEFINE FIELD employee ON employee_performance_note TYPE record<employee> PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD type ON employee_performance_note TYPE string PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD title ON employee_performance_note TYPE string PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD content ON employee_performance_note TYPE string PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD severity ON employee_performance_note TYPE option<string|null> PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD created_by ON employee_performance_note TYPE option<record<user>|null> PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD created_at ON employee_performance_note TYPE datetime DEFAULT time::now() PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD visible_to_employee ON employee_performance_note TYPE bool DEFAULT false PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE INDEX IF NOT EXISTS epn_employee ON employee_performance_note FIELDS employee;

DEFINE TABLE labor_audit_log SCHEMAFULL;
DEFINE FIELD entity_type ON labor_audit_log TYPE string PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD entity_id ON labor_audit_log TYPE string PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD action ON labor_audit_log TYPE string PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD before ON labor_audit_log TYPE any PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD after ON labor_audit_log TYPE any PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD changed_by ON labor_audit_log TYPE option<record<user>|null> PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD changed_at ON labor_audit_log TYPE datetime DEFAULT time::now() PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE INDEX IF NOT EXISTS lal_entity ON labor_audit_log FIELDS entity_type, entity_id;
