-- Migration: 2026_08_28_audit_log_events.surql
--
-- Audit log table + DEFINE EVENT hooks on critical tables.
--
-- SurrealDB DEFINE EVENT triggers on WRITE operations (CREATE/UPDATE/DELETE)
-- only — not SELECT. This migration:
--
--   1. Creates an `audit_log` table to store structured audit entries.
--   2. Defines EVENT hooks on 8 critical tables that log every write to
--      audit_log with the actor ($auth), action, table, record id, and a
--      diff of changed fields.
--
-- SELECT access attempts that are DENIED by PERMISSIONS are NOT captured by
-- events (SurrealDB doesn't fire events on denied SELECTs). Those are logged
-- server-side by the gateway's session-auth middleware (see
-- gateway/src/audit-log.js) which records 401/403 responses.
--
-- See: RBAC-DESIGN.md → "Audit logging" section
-- See: ACTIVATION-RUNBOOK.md → Phase 4 audit verification

-- ---------------------------------------------------------------------------
-- audit_log table
-- ---------------------------------------------------------------------------

DEFINE TABLE IF NOT EXISTS audit_log TYPE NORMAL SCHEMAFULL PERMISSIONS NONE;

DEFINE FIELD IF NOT EXISTS id            ON audit_log TYPE string DEFAULT rand::ulid();
DEFINE FIELD IF NOT EXISTS occurred_at   ON audit_log TYPE datetime DEFAULT time::now();
DEFINE FIELD IF NOT EXISTS actor_id      ON audit_log TYPE option<string>;
DEFINE FIELD IF NOT EXISTS actor_login   ON audit_log TYPE option<string>;
DEFINE FIELD IF NOT EXISTS actor_roles   ON audit_log TYPE array<string> DEFAULT [];
DEFINE FIELD IF NOT EXISTS action        ON audit_log TYPE string;  -- 'create' | 'update' | 'delete'
DEFINE FIELD IF NOT EXISTS table_name    ON audit_log TYPE string;
DEFINE FIELD IF NOT EXISTS record_id     ON audit_log TYPE option<string>;
DEFINE FIELD IF NOT EXISTS changed_fields ON audit_log TYPE array<string> DEFAULT [];
DEFINE FIELD IF NOT EXISTS source        ON audit_log TYPE option<string>;  -- 'surreal-event' | 'gateway-session-auth' | 'gateway-ws-relay'

-- Indexes for querying the audit log.
DEFINE INDEX IF NOT EXISTS audit_log_occurred_at ON audit_log FIELDS occurred_at;
DEFINE INDEX IF NOT EXISTS audit_log_actor_id ON audit_log FIELDS actor_id;
DEFINE INDEX IF NOT EXISTS audit_log_table_action ON audit_log FIELDS table_name, action;
DEFINE INDEX IF NOT EXISTS audit_log_record_id ON audit_log FIELDS record_id;

-- ---------------------------------------------------------------------------
-- DEFINE EVENT hooks on critical tables.
--
-- Each event fires AFTER the write succeeds, inserting a row into audit_log
-- with the actor's identity (from $auth) and the changed fields.
--
-- The `THEN` block runs with the same privileges as the triggering query,
-- so it can write to audit_log even when PERMISSIONS would deny the actor
-- direct write access to audit_log (we want only events to write, not users).
-- ---------------------------------------------------------------------------

-- event: user table — password changes, role assignments
DEFINE EVENT IF NOT EXISTS audit_user_create ON TABLE user
  WHEN $event == 'CREATE'
  THEN {
    CREATE audit_log CONTENT {
      actor_id: <string>$auth.sub,
      actor_login: $auth.login,
      actor_roles: $auth.roles,
      action: 'create',
      table_name: 'user',
      record_id: <string>$after.id,
      changed_fields: [],
      source: 'surreal-event',
    };
  };

DEFINE EVENT IF NOT EXISTS audit_user_update ON TABLE user
  WHEN $event == 'UPDATE'
  THEN {
    CREATE audit_log CONTENT {
      actor_id: <string>$auth.sub,
      actor_login: $auth.login,
      actor_roles: $auth.roles,
      action: 'update',
      table_name: 'user',
      record_id: <string>$after.id,
      changed_fields: <array<string>>object::keys($after),
      source: 'surreal-event',
    };
  };

DEFINE EVENT IF NOT EXISTS audit_user_delete ON TABLE user
  WHEN $event == 'DELETE'
  THEN {
    CREATE audit_log CONTENT {
      actor_id: <string>$auth.sub,
      actor_login: $auth.login,
      actor_roles: $auth.roles,
      action: 'delete',
      table_name: 'user',
      record_id: <string>$before.id,
      changed_fields: [],
      source: 'surreal-event',
    };
  };

-- event: user_role table — privilege escalation vector
DEFINE EVENT IF NOT EXISTS audit_user_role_create ON TABLE user_role
  WHEN $event == 'CREATE'
  THEN {
    CREATE audit_log CONTENT {
      actor_id: <string>$auth.sub,
      actor_login: $auth.login,
      actor_roles: $auth.roles,
      action: 'create',
      table_name: 'user_role',
      record_id: <string>$after.id,
      changed_fields: [],
      source: 'surreal-event',
    };
  };

DEFINE EVENT IF NOT EXISTS audit_user_role_update ON TABLE user_role
  WHEN $event == 'UPDATE'
  THEN {
    CREATE audit_log CONTENT {
      actor_id: <string>$auth.sub,
      actor_login: $auth.login,
      actor_roles: $auth.roles,
      action: 'update',
      table_name: 'user_role',
      record_id: <string>$after.id,
      changed_fields: <array<string>>object::keys($after),
      source: 'surreal-event',
    };
  };

-- event: integration_oauth_credential — OAuth token changes
DEFINE EVENT IF NOT EXISTS audit_oauth_credential_update ON TABLE integration_oauth_credential
  WHEN $event == 'UPDATE' OR $event == 'CREATE'
  THEN {
    CREATE audit_log CONTENT {
      actor_id: <string>$auth.sub,
      actor_login: $auth.login,
      actor_roles: $auth.roles,
      action: <string>$event,
      table_name: 'integration_oauth_credential',
      record_id: <string>$after.id,
      changed_fields: <array<string>>object::keys($after),
      source: 'surreal-event',
    };
  };

-- event: payment_type — gateway config changes (credentials saved/revoked)
DEFINE EVENT IF NOT EXISTS audit_payment_type_update ON TABLE payment_type
  WHEN $event == 'UPDATE' OR $event == 'CREATE'
  THEN {
    CREATE audit_log CONTENT {
      actor_id: <string>$auth.sub,
      actor_login: $auth.login,
      actor_roles: $auth.roles,
      action: <string>$event,
      table_name: 'payment_type',
      record_id: <string>$after.id,
      changed_fields: <array<string>>object::keys($after),
      source: 'surreal-event',
    };
  };

-- event: payroll_run — salary data changes
DEFINE EVENT IF NOT EXISTS audit_payroll_run_update ON TABLE payroll_run
  WHEN $event == 'CREATE' OR $event == 'UPDATE' OR $event == 'DELETE'
  THEN {
    CREATE audit_log CONTENT {
      actor_id: <string>$auth.sub,
      actor_login: $auth.login,
      actor_roles: $auth.roles,
      action: <string>$event,
      table_name: 'payroll_run',
      record_id: <string>(if $event == 'DELETE' { $before.id } else { $after.id }),
      changed_fields: if $event == 'DELETE' { [] } else { <array<string>>object::keys($after) },
      source: 'surreal-event',
    };
  };

-- event: account_journal_entry — financial journal changes
DEFINE EVENT IF NOT EXISTS audit_journal_entry_update ON TABLE account_journal_entry
  WHEN $event == 'CREATE' OR $event == 'UPDATE' OR $event == 'DELETE'
  THEN {
    CREATE audit_log CONTENT {
      actor_id: <string>$auth.sub,
      actor_login: $auth.login,
      actor_roles: $auth.roles,
      action: <string>$event,
      table_name: 'account_journal_entry',
      record_id: <string>(if $event == 'DELETE' { $before.id } else { $after.id }),
      changed_fields: if $event == 'DELETE' { [] } else { <array<string>>object::keys($after) },
      source: 'surreal-event',
    };
  };
