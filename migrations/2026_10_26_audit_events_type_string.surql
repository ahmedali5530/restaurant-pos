-- Migration: 2026_10_26_audit_events_type_string.surql
--
-- Fix audit_log DEFINE EVENT hooks that break role (and other) updates on
-- SurrealDB 3.x with:
--   Error while processing event … ANONYMOUS() … 'record' is not a function
--
-- Do NOT read $auth.sub / $auth.login / $auth.roles inside events. For system
-- users $auth is NONE; for record users $auth is a record id. Field access on
-- that record id inside the event closure can invoke the record as a function.
-- Actor identity for gateway traffic is already logged in gateway audit-log.
--
-- Use CREATE … SET + type::string($after.id) / object::keys($after).

DEFINE EVENT OVERWRITE audit_user_create ON TABLE user
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

DEFINE EVENT OVERWRITE audit_user_update ON TABLE user
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

DEFINE EVENT OVERWRITE audit_user_delete ON TABLE user
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

DEFINE EVENT OVERWRITE audit_user_role_create ON TABLE user_role
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

DEFINE EVENT OVERWRITE audit_user_role_update ON TABLE user_role
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

DEFINE EVENT OVERWRITE audit_oauth_credential_update ON TABLE integration_oauth_credential
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

DEFINE EVENT OVERWRITE audit_payment_type_update ON TABLE payment_type
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

DEFINE EVENT OVERWRITE audit_payroll_run_update ON TABLE payroll_run
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

DEFINE EVENT OVERWRITE audit_journal_entry_update ON TABLE account_journal_entry
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
