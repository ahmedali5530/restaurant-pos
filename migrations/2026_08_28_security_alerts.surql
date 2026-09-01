-- Migration: 2026_08_28_security_alerts.surql
--
-- Security alerting infrastructure: detects suspicious patterns in the
-- audit_log table and surfaces them as structured alerts for operator review.
--
-- Components:
--   1. security_alert_rules table — configurable detection rules (thresholds,
--      time windows, severity)
--   2. security_alerts table — emitted alerts when a rule fires
--   3. anomaly-detector.cjs — periodic script that runs the rules against
--      audit_log and inserts alerts
--
-- See: RBAC-DESIGN.md → "Structured alerting" section
-- See: migrations/scripts/anomaly-detector.cjs (the detector)

-- ---------------------------------------------------------------------------
-- security_alert_rules: configurable detection rules
-- ---------------------------------------------------------------------------

DEFINE TABLE IF NOT EXISTS security_alert_rules TYPE NORMAL SCHEMAFULL PERMISSIONS NONE;

DEFINE FIELD IF NOT EXISTS id          ON security_alert_rules TYPE string DEFAULT rand::ulid();
DEFINE FIELD IF NOT EXISTS name        ON security_alert_rules TYPE string;
DEFINE FIELD IF NOT EXISTS description ON security_alert_rules TYPE option<string>;
DEFINE FIELD IF NOT EXISTS rule_type   ON security_alert_rules TYPE string;
  -- 'permission_denial_burst'  — N denials in T minutes
  -- 'login_failure_burst'      — N failed logins from same IP in T minutes
  -- 'off_hours_sensitive_access' — access to critical tables outside business hours
  -- 'audit_log_tampering'     — direct user writes to audit_log (not via events)
  -- 'new_oauth_credential'    — OAuth credential saved (worth reviewing)
  -- 'role_escalation'         — user_role.roles changed
DEFINE FIELD IF NOT EXISTS threshold   ON security_alert_rules TYPE option<int>;
DEFINE FIELD IF NOT EXISTS window_minutes ON security_alert_rules TYPE option<int>;
DEFINE FIELD IF NOT EXISTS severity    ON security_alert_rules TYPE string DEFAULT 'warning';
  -- 'info' | 'warning' | 'critical'
DEFINE FIELD IF NOT EXISTS enabled      ON security_alert_rules TYPE bool DEFAULT true;
DEFINE FIELD IF NOT EXISTS created_at  ON security_alert_rules TYPE datetime DEFAULT time::now();

DEFINE INDEX IF NOT EXISTS security_alert_rules_type ON security_alert_rules FIELDS rule_type;
DEFINE INDEX IF NOT EXISTS security_alert_rules_enabled ON security_alert_rules FIELDS enabled;

-- ---------------------------------------------------------------------------
-- security_alerts: emitted alerts
-- ---------------------------------------------------------------------------

DEFINE TABLE IF NOT EXISTS security_alerts TYPE NORMAL SCHEMAFULL PERMISSIONS NONE;

DEFINE FIELD IF NOT EXISTS id            ON security_alerts TYPE string DEFAULT rand::ulid();
DEFINE FIELD IF NOT EXISTS emitted_at    ON security_alerts TYPE datetime DEFAULT time::now();
DEFINE FIELD IF NOT EXISTS rule_id       ON security_alerts TYPE option<string>;
DEFINE FIELD IF NOT EXISTS rule_name     ON security_alerts TYPE string;
DEFINE FIELD IF NOT EXISTS rule_type     ON security_alerts TYPE string;
DEFINE FIELD IF NOT EXISTS severity      ON security_alerts TYPE string;
  -- 'info' | 'warning' | 'critical'
DEFINE FIELD IF NOT EXISTS actor_id      ON security_alerts TYPE option<string>;
DEFINE FIELD IF NOT EXISTS actor_login   ON security_alerts TYPE option<string>;
DEFINE FIELD IF NOT EXISTS actor_roles   ON security_alerts TYPE array<string> DEFAULT [];
DEFINE FIELD IF NOT EXISTS source_ip     ON security_alerts TYPE option<string>;
DEFINE FIELD IF NOT EXISTS count         ON security_alerts TYPE int DEFAULT 1;
DEFINE FIELD IF NOT EXISTS details        ON security_alerts TYPE option<any>;
DEFINE FIELD IF NOT EXISTS status        ON security_alerts TYPE string DEFAULT 'open';
  -- 'open' | 'acknowledged' | 'resolved' | 'false_positive'
DEFINE FIELD IF NOT EXISTS acknowledged_by ON security_alerts TYPE option<string>;
DEFINE FIELD IF NOT EXISTS acknowledged_at ON security_alerts TYPE option<datetime>;
DEFINE FIELD IF NOT EXISTS resolution_notes ON security_alerts TYPE option<string>;

DEFINE INDEX IF NOT EXISTS security_alerts_emitted_at ON security_alerts FIELDS emitted_at;
DEFINE INDEX IF NOT EXISTS security_alerts_status ON security_alerts FIELDS status;
DEFINE INDEX IF NOT EXISTS security_alerts_severity ON security_alerts FIELDS severity;
DEFINE INDEX IF NOT EXISTS security_alerts_actor ON security_alerts FIELDS actor_id;
DEFINE INDEX IF NOT EXISTS security_alerts_rule ON security_alerts FIELDS rule_id;

-- ---------------------------------------------------------------------------
-- Default alert rules (seeded)
-- ---------------------------------------------------------------------------

-- Rule 1: 5+ permission denials from the same actor in 15 minutes
CREATE security_alert_rules CONTENT {
  name: 'Permission denial burst',
  description: '5+ permission denials from the same actor in 15 minutes — likely brute-force or privilege escalation attempt',
  rule_type: 'permission_denial_burst',
  threshold: 5,
  window_minutes: 15,
  severity: 'critical',
  enabled: true,
};

-- Rule 2: 5+ failed logins from the same IP in 15 minutes
CREATE security_alert_rules CONTENT {
  name: 'Login failure burst from IP',
  description: '5+ failed logins from the same IP in 15 minutes — brute-force PIN/password attack',
  rule_type: 'login_failure_burst',
  threshold: 5,
  window_minutes: 15,
  severity: 'critical',
  enabled: true,
};

-- Rule 3: Access to sensitive tables outside business hours (22:00–06:00)
CREATE security_alert_rules CONTENT {
  name: 'Off-hours sensitive access',
  description: 'Access to user/payroll/oauth tables outside business hours (22:00–06:00) — unusual activity',
  rule_type: 'off_hours_sensitive_access',
  threshold: 1,
  window_minutes: 60,
  severity: 'warning',
  enabled: true,
};

-- Rule 4: Direct user writes to audit_log (not via DEFINE EVENT)
CREATE security_alert_rules CONTENT {
  name: 'Audit log tampering attempt',
  description: 'Direct user write to audit_log table (bypassing DEFINE EVENT) — possible log manipulation',
  rule_type: 'audit_log_tampering',
  threshold: 1,
  window_minutes: 60,
  severity: 'critical',
  enabled: true,
};

-- Rule 5: OAuth credential saved (worth reviewing)
CREATE security_alert_rules CONTENT {
  name: 'OAuth credential saved',
  description: 'A new OAuth credential was saved — review to confirm it was authorised',
  rule_type: 'new_oauth_credential',
  threshold: 1,
  window_minutes: 60,
  severity: 'info',
  enabled: true,
};

-- Rule 6: Role assignment changed (privilege escalation vector)
CREATE security_alert_rules CONTENT {
  name: 'Role assignment changed',
  description: 'user_role.roles was modified — review to confirm the change was authorised',
  rule_type: 'role_escalation',
  threshold: 1,
  window_minutes: 60,
  severity: 'warning',
  enabled: true,
};
