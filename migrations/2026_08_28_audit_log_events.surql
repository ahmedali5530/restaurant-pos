-- Migration: 2026_08_28_audit_log_events.surql
--
-- Audit log table + DEFINE EVENT hooks on critical tables.
--
-- SurrealDB DEFINE EVENT triggers on WRITE operations (CREATE/UPDATE/DELETE)
-- only — not SELECT. This migration:
--
--   1. Creates an `audit_log` table to store structured audit entries.
--   2. Defines EVENT hooks on critical tables that log every write to
--      audit_log with action, table, record id, and changed field keys.
--
-- SurrealDB 3.x: do not read $auth.sub / $auth.login / $auth.roles inside
-- events (record-user $auth is a record id; field access can throw
-- "'record' is not a function"). Actor identity for gateway traffic is
-- logged by gateway/src/audit-log.js. See also
-- 2026_10_26_audit_events_type_string.surql for OVERWRITE on existing DBs.
--
-- See: RBAC-DESIGN.md → "Audit logging" section
-- See: ACTIVATION-RUNBOOK.md → Phase 4 audit verification

DEFINE TABLE IF NOT EXISTS audit_log TYPE NORMAL SCHEMAFULL PERMISSIONS NONE;

DEFINE FIELD IF NOT EXISTS occurred_at   ON audit_log TYPE datetime DEFAULT time::now();
DEFINE FIELD IF NOT EXISTS actor_id      ON audit_log TYPE option<string>;
DEFINE FIELD IF NOT EXISTS actor_login   ON audit_log TYPE option<string>;
DEFINE FIELD IF NOT EXISTS actor_roles   ON audit_log TYPE array<string> DEFAULT [];
DEFINE FIELD IF NOT EXISTS action        ON audit_log TYPE string;
DEFINE FIELD IF NOT EXISTS table_name    ON audit_log TYPE string;
DEFINE FIELD IF NOT EXISTS record_id     ON audit_log TYPE option<string>;
DEFINE FIELD IF NOT EXISTS changed_fields ON audit_log TYPE array<string> DEFAULT [];
DEFINE FIELD IF NOT EXISTS source        ON audit_log TYPE option<string>;

DEFINE INDEX IF NOT EXISTS audit_log_occurred_at ON audit_log FIELDS occurred_at;
DEFINE INDEX IF NOT EXISTS audit_log_actor_id ON audit_log FIELDS actor_id;
DEFINE INDEX IF NOT EXISTS audit_log_table_action ON audit_log FIELDS table_name, action;
DEFINE INDEX IF NOT EXISTS audit_log_record_id ON audit_log FIELDS record_id;

DEFINE EVENT IF NOT EXISTS audit_user_create ON TABLE user
  WHEN $event == 'CREATE'
  THEN {
    CREATE audit_log SET
      action = 'create',
      table_name = 'user',
      record_id = type::string($after.id),
      changed_fields = [],
      actor_roles = [],
      source = 'surreal-event';
  };

DEFINE EVENT IF NOT EXISTS audit_user_update ON TABLE user
  WHEN $event == 'UPDATE'
  THEN {
    CREATE audit_log SET
      action = 'update',
      table_name = 'user',
      record_id = type::string($after.id),
      changed_fields = object::keys($after),
      actor_roles = [],
      source = 'surreal-event';
  };

DEFINE EVENT IF NOT EXISTS audit_user_delete ON TABLE user
  WHEN $event == 'DELETE'
  THEN {
    CREATE audit_log SET
      action = 'delete',
      table_name = 'user',
      record_id = type::string($before.id),
      changed_fields = [],
      actor_roles = [],
      source = 'surreal-event';
  };

DEFINE EVENT IF NOT EXISTS audit_user_role_create ON TABLE user_role
  WHEN $event == 'CREATE'
  THEN {
    CREATE audit_log SET
      action = 'create',
      table_name = 'user_role',
      record_id = type::string($after.id),
      changed_fields = [],
      actor_roles = [],
      source = 'surreal-event';
  };

DEFINE EVENT IF NOT EXISTS audit_user_role_update ON TABLE user_role
  WHEN $event == 'UPDATE'
  THEN {
    CREATE audit_log SET
      action = 'update',
      table_name = 'user_role',
      record_id = type::string($after.id),
      changed_fields = object::keys($after),
      actor_roles = [],
      source = 'surreal-event';
  };

DEFINE EVENT IF NOT EXISTS audit_oauth_credential_update ON TABLE integration_oauth_credential
  WHEN $event == 'UPDATE' OR $event == 'CREATE'
  THEN {
    CREATE audit_log SET
      action = type::string($event),
      table_name = 'integration_oauth_credential',
      record_id = type::string($after.id),
      changed_fields = object::keys($after),
      actor_roles = [],
      source = 'surreal-event';
  };

DEFINE EVENT IF NOT EXISTS audit_payment_type_update ON TABLE payment_type
  WHEN $event == 'UPDATE' OR $event == 'CREATE'
  THEN {
    CREATE audit_log SET
      action = type::string($event),
      table_name = 'payment_type',
      record_id = type::string($after.id),
      changed_fields = object::keys($after),
      actor_roles = [],
      source = 'surreal-event';
  };

DEFINE EVENT IF NOT EXISTS audit_payroll_run_update ON TABLE payroll_run
  WHEN $event == 'CREATE' OR $event == 'UPDATE' OR $event == 'DELETE'
  THEN {
    CREATE audit_log SET
      action = type::string($event),
      table_name = 'payroll_run',
      record_id = type::string(IF $event == 'DELETE' { $before.id } ELSE { $after.id }),
      changed_fields = IF $event == 'DELETE' { [] } ELSE { object::keys($after) },
      actor_roles = [],
      source = 'surreal-event';
  };

DEFINE EVENT IF NOT EXISTS audit_journal_entry_update ON TABLE account_journal_entry
  WHEN $event == 'CREATE' OR $event == 'UPDATE' OR $event == 'DELETE'
  THEN {
    CREATE audit_log SET
      action = type::string($event),
      table_name = 'account_journal_entry',
      record_id = type::string(IF $event == 'DELETE' { $before.id } ELSE { $after.id }),
      changed_fields = IF $event == 'DELETE' { [] } ELSE { object::keys($after) },
      actor_roles = [],
      source = 'surreal-event';
  };
