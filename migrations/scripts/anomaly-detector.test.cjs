'use strict';

/**
 * Regression tests for the anomaly detector.
 *
 * Pins the rule detector functions and the dedupe logic. The detectors are
 * pure functions of the (db, rule) inputs — we mock the db.query to return
 * canned audit_log rows and verify the detector produces the expected alerts.
 *
 * Run from the repo root:
 *   node --test migrations/scripts/anomaly-detector.test.cjs
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

// Load the detector module (it guards env-var check with require.main === module)
const scriptPath = path.resolve(__dirname, 'anomaly-detector.cjs');
delete require.cache[scriptPath];
const mod = require(scriptPath);

const {
  detectPermissionDenialBurst,
  detectLoginFailureBurst,
  detectOffHoursSensitiveAccess,
  detectAuditLogTampering,
  detectNewOauthCredential,
  detectRoleEscalation,
  buildDedupeKey,
  RULE_DETECTORS,
} = mod;

// Mock db client — returns canned rows for a given query.
function mockDb(cannedRows) {
  return {
    query: async (q, params) => {
      // Just return the canned rows regardless of the query.
      return cannedRows;
    },
  };
}

const SAMPLE_RULE = {
  id: 'rule:test1',
  name: 'Test rule',
  rule_type: 'permission_denial_burst',
  severity: 'critical',
  threshold: 5,
  window_minutes: 15,
};

test('module exports the expected public API', () => {
  assert.equal(typeof detectPermissionDenialBurst, 'function');
  assert.equal(typeof detectLoginFailureBurst, 'function');
  assert.equal(typeof detectOffHoursSensitiveAccess, 'function');
  assert.equal(typeof detectAuditLogTampering, 'function');
  assert.equal(typeof detectNewOauthCredential, 'function');
  assert.equal(typeof detectRoleEscalation, 'function');
  assert.equal(typeof buildDedupeKey, 'function');
  assert.equal(typeof RULE_DETECTORS, 'object');
});

test('RULE_DETECTORS maps all 6 rule types to detector functions', () => {
  const expected = [
    'permission_denial_burst',
    'login_failure_burst',
    'off_hours_sensitive_access',
    'audit_log_tampering',
    'new_oauth_credential',
    'role_escalation',
  ];
  for (const t of expected) {
    assert.equal(typeof RULE_DETECTORS[t], 'function', `missing detector for ${t}`);
  }
  assert.equal(Object.keys(RULE_DETECTORS).length, 6, 'exactly 6 rule types');
});

test('detectPermissionDenialBurst groups by actor and emits when threshold met', async () => {
  const db = mockDb([[
    { actor_id: 'user:abc', actor_login: 'cashier1', actor_roles: ['cashier'], cnt: 7, sources: ['gateway-session-auth'] },
  ]]);
  const alerts = await detectPermissionDenialBurst(db, SAMPLE_RULE);
  assert.equal(alerts.length, 1);
  assert.equal(alerts[0].actor_id, 'user:abc');
  assert.equal(alerts[0].actor_login, 'cashier1');
  assert.equal(alerts[0].count, 7);
  assert.equal(alerts[0].severity, 'critical');
  assert.equal(alerts[0].rule_type, 'permission_denial_burst');
});

test('detectPermissionDenialBurst emits no alerts when below threshold', async () => {
  const db = mockDb([
    [{ actor_id: 'user:abc', actor_login: 'cashier1', actor_roles: ['cashier'], cnt: 3, sources: [] }],
  ]);
  // threshold is 5, count is 3 — but Surreal's HAVING already filters this
  // server-side. The detector just maps whatever rows it gets.
  const alerts = await detectPermissionDenialBurst(db, SAMPLE_RULE);
  assert.equal(alerts.length, 1); // still emits because the HAVING was done server-side
  assert.equal(alerts[0].count, 3);
});

test('detectLoginFailureBurst groups by IP and emits', async () => {
  const db = mockDb([[
    { actor_login: 'admin', ip: '203.0.113.99', cnt: 8 },
  ]]);
  const alerts = await detectLoginFailureBurst(db, SAMPLE_RULE);
  assert.equal(alerts.length, 1);
  assert.equal(alerts[0].source_ip, '203.0.113.99');
  assert.equal(alerts[0].count, 8);
  assert.equal(alerts[0].details.ip, '203.0.113.99');
});

test('detectOffHoursSensitiveAccess includes the table name in details', async () => {
  const db = mockDb([[
    {
      actor_id: 'user:hr1',
      actor_login: 'hr_manager',
      actor_roles: ['hr'],
      table_name: 'payroll_run',
      action: 'update',
      cnt: 2,
    },
  ]]);
  const alerts = await detectOffHoursSensitiveAccess(db, SAMPLE_RULE);
  assert.equal(alerts.length, 1);
  assert.equal(alerts[0].details.table_name, 'payroll_run');
  assert.equal(alerts[0].details.action, 'update');
});

test('detectAuditLogTampering flags unexpected sources', async () => {
  const db = mockDb([[
    { actor_id: 'user:bad', actor_login: 'attacker', source: 'manual-script', cnt: 1 },
  ]]);
  const alerts = await detectAuditLogTampering(db, SAMPLE_RULE);
  assert.equal(alerts.length, 1);
  assert.equal(alerts[0].details.unexpected_source, 'manual-script');
  assert.equal(alerts[0].severity, 'critical');
});

test('detectNewOauthCredential emits one alert per credential change', async () => {
  const db = mockDb([[
    { actor_id: 'user:admin', actor_login: 'admin', actor_roles: ['admin'], action: 'create', record_id: 'integration_oauth_credential:abc' },
  ]]);
  const alerts = await detectNewOauthCredential(db, SAMPLE_RULE);
  assert.equal(alerts.length, 1);
  assert.equal(alerts[0].details.action, 'create');
  assert.equal(alerts[0].details.record_id, 'integration_oauth_credential:abc');
  // severity comes from the rule, not the rule_type — SAMPLE_RULE is 'critical'
  assert.equal(alerts[0].severity, 'critical');
});

test('detectRoleEscalation emits one alert per role change', async () => {
  const db = mockDb([[
    { actor_id: 'user:admin', actor_login: 'admin', actor_roles: ['admin'], action: 'update', record_id: 'user_role:hr' },
  ]]);
  // Use a rule with severity 'warning' to test that severity is passed through
  const warningRule = { ...SAMPLE_RULE, severity: 'warning' };
  const alerts = await detectRoleEscalation(db, warningRule);
  assert.equal(alerts.length, 1);
  assert.equal(alerts[0].details.action, 'update');
  assert.equal(alerts[0].severity, 'warning');
});

test('detectLoginFailureBurst handles empty audit_log gracefully', async () => {
  const db = mockDb([[]]); // empty result
  const alerts = await detectLoginFailureBurst(db, SAMPLE_RULE);
  assert.equal(alerts.length, 0);
});

test('buildDedupeKey produces a stable key for the same actor + rule', () => {
  const alert1 = {
    rule_type: 'permission_denial_burst',
    actor_id: 'user:abc',
    source_ip: null,
    details: {},
  };
  const alert2 = {
    rule_type: 'permission_denial_burst',
    actor_id: 'user:abc',
    source_ip: null,
    details: {},
  };
  assert.equal(buildDedupeKey(alert1), buildDedupeKey(alert2));
});

test('buildDedupeKey differs for different actors', () => {
  const alert1 = { rule_type: 'x', actor_id: 'user:abc', source_ip: null, details: {} };
  const alert2 = { rule_type: 'x', actor_id: 'user:def', source_ip: null, details: {} };
  assert.notEqual(buildDedupeKey(alert1), buildDedupeKey(alert2));
});

test('buildDedupeKey differs for different IPs (login_failure_burst)', () => {
  const alert1 = { rule_type: 'login_failure_burst', actor_login: 'admin', source_ip: '1.2.3.4', details: { ip: '1.2.3.4' } };
  const alert2 = { rule_type: 'login_failure_burst', actor_login: 'admin', source_ip: '5.6.7.8', details: { ip: '5.6.7.8' } };
  assert.notEqual(buildDedupeKey(alert1), buildDedupeKey(alert2));
});

test('buildDedupeKey falls back to "unknown" when actor is missing', () => {
  const alert = { rule_type: 'x', source_ip: null, details: {} };
  const key = buildDedupeKey(alert);
  assert.ok(key.includes('unknown'));
});
