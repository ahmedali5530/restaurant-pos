-- Migration: 2026_10_26_audit_events_type_string.surql
--
-- Harden audit_log DEFINE EVENT hooks for SurrealDB 3.x.
--
-- Updating user_role (and other audited tables) could fail with:
--   Error while processing event audit_user_role_update:
--   There was a problem running the ANONYMOUS() function. 'record' is not a function
--
-- Root cause: the event THEN block used angle-bracket casts (`<string> $after.id`,
-- `<string> $auth.sub`) and passed `$auth.*` through without guarding NONE. Under
-- SurrealDB 3.x those paths can end up invoking a record id as a callable inside
-- the event closure. Use type::string() and null-safe $auth instead.
--
-- OVERWRITE so DEFINE EVENT IF NOT EXISTS installs from 2026_08_28 are replaced.

DEFINE EVENT OVERWRITE audit_user_create ON TABLE user
  WHEN $event == 'CREATE'
  THEN {
    CREATE audit_log CONTENT {
      actor_id: IF $auth = NONE OR $auth.sub = NONE { NONE } ELSE { type::string($auth.sub) },
      actor_login: IF $auth = NONE { NONE } ELSE { $auth.login },
      actor_roles: IF $auth = NONE OR $auth.roles = NONE { [] } ELSE { $auth.roles },
      action: 'create',
      table_name: 'user',
      record_id: type::string($after.id),
      changed_fields: [],
      source: 'surreal-event',
    };
  };

DEFINE EVENT OVERWRITE audit_user_update ON TABLE user
  WHEN $event == 'UPDATE'
  THEN {
    CREATE audit_log CONTENT {
      actor_id: IF $auth = NONE OR $auth.sub = NONE { NONE } ELSE { type::string($auth.sub) },
      actor_login: IF $auth = NONE { NONE } ELSE { $auth.login },
      actor_roles: IF $auth = NONE OR $auth.roles = NONE { [] } ELSE { $auth.roles },
      action: 'update',
      table_name: 'user',
      record_id: type::string($after.id),
      changed_fields: object::keys($after) ?? [],
      source: 'surreal-event',
    };
  };

DEFINE EVENT OVERWRITE audit_user_delete ON TABLE user
  WHEN $event == 'DELETE'
  THEN {
    CREATE audit_log CONTENT {
      actor_id: IF $auth = NONE OR $auth.sub = NONE { NONE } ELSE { type::string($auth.sub) },
      actor_login: IF $auth = NONE { NONE } ELSE { $auth.login },
      actor_roles: IF $auth = NONE OR $auth.roles = NONE { [] } ELSE { $auth.roles },
      action: 'delete',
      table_name: 'user',
      record_id: type::string($before.id),
      changed_fields: [],
      source: 'surreal-event',
    };
  };

DEFINE EVENT OVERWRITE audit_user_role_create ON TABLE user_role
  WHEN $event == 'CREATE'
  THEN {
    CREATE audit_log CONTENT {
      actor_id: IF $auth = NONE OR $auth.sub = NONE { NONE } ELSE { type::string($auth.sub) },
      actor_login: IF $auth = NONE { NONE } ELSE { $auth.login },
      actor_roles: IF $auth = NONE OR $auth.roles = NONE { [] } ELSE { $auth.roles },
      action: 'create',
      table_name: 'user_role',
      record_id: type::string($after.id),
      changed_fields: [],
      source: 'surreal-event',
    };
  };

DEFINE EVENT OVERWRITE audit_user_role_update ON TABLE user_role
  WHEN $event == 'UPDATE'
  THEN {
    CREATE audit_log CONTENT {
      actor_id: IF $auth = NONE OR $auth.sub = NONE { NONE } ELSE { type::string($auth.sub) },
      actor_login: IF $auth = NONE { NONE } ELSE { $auth.login },
      actor_roles: IF $auth = NONE OR $auth.roles = NONE { [] } ELSE { $auth.roles },
      action: 'update',
      table_name: 'user_role',
      record_id: type::string($after.id),
      changed_fields: object::keys($after) ?? [],
      source: 'surreal-event',
    };
  };

DEFINE EVENT OVERWRITE audit_oauth_credential_update ON TABLE integration_oauth_credential
  WHEN $event == 'UPDATE' OR $event == 'CREATE'
  THEN {
    CREATE audit_log CONTENT {
      actor_id: IF $auth = NONE OR $auth.sub = NONE { NONE } ELSE { type::string($auth.sub) },
      actor_login: IF $auth = NONE { NONE } ELSE { $auth.login },
      actor_roles: IF $auth = NONE OR $auth.roles = NONE { [] } ELSE { $auth.roles },
      action: type::string($event),
      table_name: 'integration_oauth_credential',
      record_id: type::string($after.id),
      changed_fields: object::keys($after) ?? [],
      source: 'surreal-event',
    };
  };

DEFINE EVENT OVERWRITE audit_payment_type_update ON TABLE payment_type
  WHEN $event == 'UPDATE' OR $event == 'CREATE'
  THEN {
    CREATE audit_log CONTENT {
      actor_id: IF $auth = NONE OR $auth.sub = NONE { NONE } ELSE { type::string($auth.sub) },
      actor_login: IF $auth = NONE { NONE } ELSE { $auth.login },
      actor_roles: IF $auth = NONE OR $auth.roles = NONE { [] } ELSE { $auth.roles },
      action: type::string($event),
      table_name: 'payment_type',
      record_id: type::string($after.id),
      changed_fields: object::keys($after) ?? [],
      source: 'surreal-event',
    };
  };

DEFINE EVENT OVERWRITE audit_payroll_run_update ON TABLE payroll_run
  WHEN $event == 'CREATE' OR $event == 'UPDATE' OR $event == 'DELETE'
  THEN {
    CREATE audit_log CONTENT {
      actor_id: IF $auth = NONE OR $auth.sub = NONE { NONE } ELSE { type::string($auth.sub) },
      actor_login: IF $auth = NONE { NONE } ELSE { $auth.login },
      actor_roles: IF $auth = NONE OR $auth.roles = NONE { [] } ELSE { $auth.roles },
      action: type::string($event),
      table_name: 'payroll_run',
      record_id: type::string(IF $event == 'DELETE' { $before.id } ELSE { $after.id }),
      changed_fields: IF $event == 'DELETE' { [] } ELSE { object::keys($after) ?? [] },
      source: 'surreal-event',
    };
  };

DEFINE EVENT OVERWRITE audit_journal_entry_update ON TABLE account_journal_entry
  WHEN $event == 'CREATE' OR $event == 'UPDATE' OR $event == 'DELETE'
  THEN {
    CREATE audit_log CONTENT {
      actor_id: IF $auth = NONE OR $auth.sub = NONE { NONE } ELSE { type::string($auth.sub) },
      actor_login: IF $auth = NONE { NONE } ELSE { $auth.login },
      actor_roles: IF $auth = NONE OR $auth.roles = NONE { [] } ELSE { $auth.roles },
      action: type::string($event),
      table_name: 'account_journal_entry',
      record_id: type::string(IF $event == 'DELETE' { $before.id } ELSE { $after.id }),
      changed_fields: IF $event == 'DELETE' { [] } ELSE { object::keys($after) ?? [] },
      source: 'surreal-event',
    };
  };
