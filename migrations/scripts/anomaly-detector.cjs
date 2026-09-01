'use strict';

/**
 * Anomaly detector: periodic script that runs alert rules against the
 * audit_log table and emits structured security_alerts.
 *
 * Run modes:
 *   1. One-shot: run all rules once and exit
 *      node migrations/scripts/anomaly-detector.cjs
 *
 *   2. Periodic: run every N minutes (default 5)
 *      ANOMALY_DETECTOR_INTERVAL_MS=300000 node migrations/scripts/anomaly-detector.cjs --watch
 *
 *   3. Dry run: report what would be alerted without writing
 *      DRY_RUN=1 node migrations/scripts/anomaly-detector.cjs
 *
 * Each rule type has a detector function that:
 *   1. Queries audit_log for matching events in the time window
 *   2. Groups by actor / IP / table as appropriate
 *   3. Emits a security_alert when the threshold is exceeded
 *
 * Idempotency: each alert includes a dedupe_key (rule_id + actor + bucket)
 * so re-running the detector in the same window doesn't duplicate alerts.
 *
 * Env vars:
 *   SURREAL_USER / SURREAL_PASS (required, no root/root fallback)
 *   SURREAL_URL (default ws://surrealdb:8000/rpc)
 *   SURREAL_NS / SURREAL_DB (default posr)
 *   ANOMALY_DETECTOR_INTERVAL_MS (default 300000 = 5 min)
 *   DRY_RUN=1 (report without writing)
 *
 * See: migrations/2026_08_28_security_alerts.surql (tables + default rules)
 * See: RBAC-DESIGN.md → "Structured alerting" section
 */

const { Surreal } = require('surrealdb');

const DB_NS = process.env.SURREAL_NS || 'posr';
const DB_NAME = process.env.SURREAL_DB || 'posr';
const DB_URL = process.env.SURREAL_URL || 'ws://surrealdb:8000/rpc';
const DB_USER = process.env.SURREAL_USER;
const DB_PASS = process.env.SURREAL_PASS;
const DRY_RUN = process.env.DRY_RUN === '1' || process.env.DRY_RUN === 'true';
const WATCH_MODE = process.argv.includes('--watch');
const INTERVAL_MS = Number(process.env.ANOMALY_DETECTOR_INTERVAL_MS || 5 * 60 * 1000);

if (require.main === module && (!DB_USER || !DB_PASS)) {
  console.error('ERROR: SURREAL_USER and SURREAL_PASS are required (no root/root fallback).');
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Rule detectors. Each function receives the db client and a rule definition,
// queries audit_log, and returns an array of alert payloads to emit.
// ---------------------------------------------------------------------------

/**
 * Rule: permission_denial_burst
 * Detects N+ permission_denied events from the same actor in T minutes.
 */
async function detectPermissionDenialBurst(db, rule) {
  const threshold = rule.threshold || 5;
  const windowMin = rule.window_minutes || 15;
  const query = `
    SELECT actor_id, actor_login, actor_roles, count() AS cnt,
           array::group(source) AS sources
    FROM audit_log
    WHERE action = 'permission_denied'
      AND occurred_at > time::now() - ${windowMin}m
    GROUP BY actor_id, actor_login, actor_roles
    HAVING cnt >= $threshold;
  `;
  const result = await db.query(query, { threshold });
  const rows = Array.isArray(result) ? result[0] || result : result;
  const list = Array.isArray(rows) ? rows : [];
  return list.map((row) => ({
    rule_id: rule.id,
    rule_name: rule.name,
    rule_type: rule.rule_type,
    severity: rule.severity,
    actor_id: row.actor_id,
    actor_login: row.actor_login,
    actor_roles: row.actor_roles || [],
    count: row.cnt,
    details: {
      threshold,
      window_minutes: windowMin,
      sources: row.sources,
    },
  }));
}

/**
 * Rule: login_failure_burst
 * Detects N+ failed logins from the same IP in T minutes.
 */
async function detectLoginFailureBurst(db, rule) {
  const threshold = rule.threshold || 5;
  const windowMin = rule.window_minutes || 15;
  // login_failure entries have details.ip and details.reason
  const query = `
    SELECT actor_login, details.ip AS ip, count() AS cnt
    FROM audit_log
    WHERE action = 'login_failure'
      AND occurred_at > time::now() - ${windowMin}m
      AND details.ip != NONE
    GROUP BY actor_login, ip
    HAVING cnt >= $threshold;
  `;
  const result = await db.query(query, { threshold });
  const rows = Array.isArray(result) ? result[0] || result : result;
  const list = Array.isArray(rows) ? rows : [];
  return list.map((row) => ({
    rule_id: rule.id,
    rule_name: rule.name,
    rule_type: rule.rule_type,
    severity: rule.severity,
    actor_login: row.actor_login,
    source_ip: row.ip,
    count: row.cnt,
    details: {
      threshold,
      window_minutes: windowMin,
      ip: row.ip,
    },
  }));
}

/**
 * Rule: off_hours_sensitive_access
 * Detects writes to sensitive tables (user, user_role, payroll_run,
 * integration_oauth_credential, payment_type) between 22:00 and 06:00.
 */
async function detectOffHoursSensitiveAccess(db, rule) {
  const windowMin = rule.window_minutes || 60;
  const sensitiveTables = ['user', 'user_role', 'payroll_run', 'integration_oauth_credential', 'payment_type'];
  const query = `
    SELECT actor_id, actor_login, actor_roles, table_name, action, count() AS cnt
    FROM audit_log
    WHERE table_name IN $tables
      AND occurred_at > time::now() - ${windowMin}m
      AND (time::hour(occurred_at) >= 22 OR time::hour(occurred_at) < 6)
    GROUP BY actor_id, actor_login, actor_roles, table_name, action;
  `;
  const result = await db.query(query, { tables: sensitiveTables });
  const rows = Array.isArray(result) ? result[0] || result : result;
  const list = Array.isArray(rows) ? rows : [];
  return list.map((row) => ({
    rule_id: rule.id,
    rule_name: rule.name,
    rule_type: rule.rule_type,
    severity: rule.severity,
    actor_id: row.actor_id,
    actor_login: row.actor_login,
    actor_roles: row.actor_roles || [],
    count: row.cnt,
    details: {
      table_name: row.table_name,
      action: row.action,
      window_minutes: windowMin,
    },
  }));
}

/**
 * Rule: audit_log_tampering
 * Detects direct user writes to audit_log (source != 'surreal-event').
 * Events write with source='surreal-event'; the gateway writes with
 * source='gateway-*'. Any other source or a NULL source is suspicious.
 */
async function detectAuditLogTampering(db, rule) {
  const windowMin = rule.window_minutes || 60;
  const query = `
    SELECT actor_id, actor_login, source, count() AS cnt
    FROM audit_log
    WHERE occurred_at > time::now() - ${windowMin}m
      AND source NOT IN ['surreal-event', 'gateway-session-auth', 'gateway-auth-routes', 'gateway-jwt', 'gateway-ws-relay']
      AND source != NONE
    GROUP BY actor_id, actor_login, source;
  `;
  const result = await db.query(query);
  const rows = Array.isArray(result) ? result[0] || result : result;
  const list = Array.isArray(rows) ? rows : [];
  return list.map((row) => ({
    rule_id: rule.id,
    rule_name: rule.name,
    rule_type: rule.rule_type,
    severity: rule.severity,
    actor_id: row.actor_id,
    actor_login: row.actor_login,
    count: row.cnt,
    details: {
      unexpected_source: row.source,
      window_minutes: windowMin,
    },
  }));
}

/**
 * Rule: new_oauth_credential
 * Detects CREATE/UPDATE events on integration_oauth_credential.
 */
async function detectNewOauthCredential(db, rule) {
  const windowMin = rule.window_minutes || 60;
  const query = `
    SELECT actor_id, actor_login, actor_roles, action, record_id
    FROM audit_log
    WHERE table_name = 'integration_oauth_credential'
      AND action IN ['create', 'update']
      AND occurred_at > time::now() - ${windowMin}m;
  `;
  const result = await db.query(query);
  const rows = Array.isArray(result) ? result[0] || result : result;
  const list = Array.isArray(rows) ? rows : [];
  return list.map((row) => ({
    rule_id: rule.id,
    rule_name: rule.name,
    rule_type: rule.rule_type,
    severity: rule.severity,
    actor_id: row.actor_id,
    actor_login: row.actor_login,
    actor_roles: row.actor_roles || [],
    count: 1,
    details: {
      action: row.action,
      record_id: row.record_id,
      window_minutes: windowMin,
    },
  }));
}

/**
 * Rule: role_escalation
 * Detects CREATE/UPDATE events on user_role (privilege changes).
 */
async function detectRoleEscalation(db, rule) {
  const windowMin = rule.window_minutes || 60;
  const query = `
    SELECT actor_id, actor_login, actor_roles, action, record_id
    FROM audit_log
    WHERE table_name = 'user_role'
      AND action IN ['create', 'update']
      AND occurred_at > time::now() - ${windowMin}m;
  `;
  const result = await db.query(query);
  const rows = Array.isArray(result) ? result[0] || result : result;
  const list = Array.isArray(rows) ? rows : [];
  return list.map((row) => ({
    rule_id: rule.id,
    rule_name: rule.name,
    rule_type: rule.rule_type,
    severity: rule.severity,
    actor_id: row.actor_id,
    actor_login: row.actor_login,
    actor_roles: row.actor_roles || [],
    count: 1,
    details: {
      action: row.action,
      record_id: row.record_id,
      window_minutes: windowMin,
    },
  }));
}

const RULE_DETECTORS = {
  permission_denial_burst: detectPermissionDenialBurst,
  login_failure_burst: detectLoginFailureBurst,
  off_hours_sensitive_access: detectOffHoursSensitiveAccess,
  audit_log_tampering: detectAuditLogTampering,
  new_oauth_credential: detectNewOauthCredential,
  role_escalation: detectRoleEscalation,
};

// ---------------------------------------------------------------------------
// Main loop
// ---------------------------------------------------------------------------

async function loadRules(db) {
  const result = await db.query('SELECT * FROM security_alert_rules WHERE enabled = true;');
  const rows = Array.isArray(result) ? result[0] || result : result;
  return Array.isArray(rows) ? rows : [];
}

function buildDedupeKey(alert) {
  // Dedupe within the same window: rule + actor + (source_ip OR table_name)
  const actor = alert.actor_id || alert.actor_login || 'unknown';
  const ip = alert.source_ip || (alert.details && alert.details.ip) || '';
  const table = (alert.details && alert.details.table_name) || '';
  return `${alert.rule_type}|${actor}|${ip}|${table}`;
}

async function emitAlert(db, alert) {
  const dedupeKey = buildDedupeKey(alert);
  const payload = {
    ...alert,
    details: { ...alert.details, dedupe_key: dedupeKey },
    status: 'open',
  };
  await db.query('CREATE security_alerts CONTENT $data;', { data: payload });
}

async function checkExistingAlert(db, alert) {
  // Don't re-emit if an open alert with the same dedupe_key exists in the
  // last window_minutes.
  const dedupeKey = buildDedupeKey(alert);
  const result = await db.query(
    `SELECT id FROM security_alerts
     WHERE details.dedupe_key = $key
       AND status = 'open'
       AND emitted_at > time::now() - 60m
     LIMIT 1;`,
    { key: dedupeKey }
  );
  const rows = Array.isArray(result) ? result[0] || result : result;
  return Array.isArray(rows) && rows.length > 0;
}

async function runOnce(db) {
  const rules = await loadRules(db);
  let emitted = 0;
  let skipped = 0;

  for (const rule of rules) {
    const detector = RULE_DETECTORS[rule.rule_type];
    if (!detector) {
      console.warn(`  No detector for rule_type '${rule.rule_type}' (rule ${rule.name})`);
      continue;
    }

    let alerts = [];
    try {
      alerts = await detector(db, rule);
    } catch (err) {
      console.error(`  FAIL  rule '${rule.name}' (${rule.rule_type}): ${err.message}`);
      continue;
    }

    for (const alert of alerts) {
      if (DRY_RUN) {
        console.log(`  DRY-RUN  [${alert.severity}] ${alert.rule_name}: ${alert.actor_login || alert.source_ip || 'unknown'} (count=${alert.count})`);
        emitted++;
        continue;
      }

      // Dedupe: skip if an open alert for the same key exists in the last hour.
      const exists = await checkExistingAlert(db, alert);
      if (exists) {
        skipped++;
        continue;
      }

      try {
        await emitAlert(db, alert);
        console.log(`  EMIT  [${alert.severity}] ${alert.rule_name}: ${alert.actor_login || alert.source_ip || 'unknown'} (count=${alert.count})`);
        emitted++;
      } catch (err) {
        console.error(`  FAIL  emit alert: ${err.message}`);
      }
    }
  }

  return { emitted, skipped };
}

async function main() {
  console.log('Connecting to', DB_URL, 'ns=' + DB_NS, 'db=' + DB_NAME);
  const db = new Surreal();
  await db.connect(DB_URL, {
    namespace: DB_NS,
    database: DB_NAME,
    auth: { username: DB_USER, password: DB_PASS },
  });

  if (WATCH_MODE) {
    console.log(`Watch mode: running every ${INTERVAL_MS / 1000}s. Press Ctrl+C to stop.`);
    const tick = async () => {
      console.log(`\n[${new Date().toISOString()}] Running anomaly detection...`);
      try {
        const { emitted, skipped } = await runOnce(db);
        console.log(`Done. Emitted: ${emitted}, skipped (dedupe): ${skipped}.`);
      } catch (err) {
        console.error('Run failed:', err.message);
      }
    };
    await tick();
    setInterval(tick, INTERVAL_MS);
  } else {
    console.log('Running anomaly detection (one-shot)...');
    const { emitted, skipped } = await runOnce(db);
    console.log(`\nDone. Emitted: ${emitted}, skipped (dedupe): ${skipped}${DRY_RUN ? ' (DRY RUN)' : ''}.`);
    await db.close();
  }
}

module.exports = {
  RULE_DETECTORS,
  detectPermissionDenialBurst,
  detectLoginFailureBurst,
  detectOffHoursSensitiveAccess,
  detectAuditLogTampering,
  detectNewOauthCredential,
  detectRoleEscalation,
  buildDedupeKey,
  runOnce,
};

if (require.main === module) {
  main().catch((err) => {
    console.error('Anomaly detector failed:', err);
    process.exit(1);
  });
}
