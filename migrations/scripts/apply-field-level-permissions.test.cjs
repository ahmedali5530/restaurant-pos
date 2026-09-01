'use strict';

/**
 * Regression tests for the field-level PERMISSIONS migration script.
 *
 * The script (apply-field-level-permissions.cjs) is a DB migration that
 * redefines sensitive fields with SELECT=NONE. These tests pin the
 * configuration: which fields are protected, what permissions they get, and
 * that the DDL generation is correct.
 *
 * We can't test the actual SurrealDB enforcement without a running DB, so we
 * test the script's configuration (SENSITIVE_FIELDS) and the DDL builder
 * (buildPermissionsClause) by requiring the script and inspecting its exports.
 *
 * Run from the migrations/scripts directory:
 *   node --test apply-field-level-permissions.test.js
 *
 * Or from the repo root:
 *   node --test migrations/scripts/apply-field-level-permissions.test.js
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

// Load the script — it exports SENSITIVE_FIELDS and buildPermissionsClause
// via the module scope. We require it and access the internals through a
// small test harness.
const scriptPath = path.resolve(__dirname, 'apply-field-level-permissions.cjs');

// The script runs main() on load (bottom of file). To test the configuration
// without triggering a DB connection, we intercept process.exit and require
// the module with fake env vars that cause an early exit.
//
// Strategy: set SURREAL_USER/SURREAL_PASS to empty so the script exits early
// with an error BEFORE connecting to the DB. But it still defines
// SENSITIVE_FIELDS and buildPermissionsClause before the exit check.
//
// Actually — the script checks env vars at module load and calls process.exit(1)
// if they're missing. That prevents us from requiring it cleanly.
//
// Better strategy: read the file as text and extract the SENSITIVE_FIELDS
// array definition, then evaluate it in a sandbox. This is fragile but
// works for pinning the configuration.

const fs = require('fs');
const source = fs.readFileSync(scriptPath, 'utf8');

// Extract the SENSITIVE_FIELDS array by finding the const declaration.
// It's a const array of objects — we eval it in a sandbox.
function extractSensitiveFields() {
  const start = source.indexOf('const SENSITIVE_FIELDS = [');
  if (start === -1) {
    throw new Error('Could not find SENSITIVE_FIELDS in the source');
  }
  // Find the matching closing bracket.
  let depth = 0;
  let i = source.indexOf('[', start);
  let end = -1;
  for (; i < source.length; i++) {
    if (source[i] === '[') depth++;
    else if (source[i] === ']') {
      depth--;
      if (depth === 0) {
        end = i + 1;
        break;
      }
    }
  }
  if (end === -1) {
    throw new Error('Could not find end of SENSITIVE_FIELDS array');
  }
  const arrayLiteral = source.slice(start + 'const SENSITIVE_FIELDS = '.length, end);
  // eslint-disable-next-line no-eval
  return eval('(' + arrayLiteral + ')');
}

function extractBuildPermissionsClause() {
  const start = source.indexOf('function buildPermissionsClause');
  const end = source.indexOf('\n}', start) + 2;
  const fnSource = source.slice(start, end);
  // eslint-disable-next-line no-eval
  return eval('(' + fnSource.replace('function buildPermissionsClause', 'function') + ')');
}

const FIELDS = extractSensitiveFields();
const buildPermissionsClause = extractBuildPermissionsClause();

test('SENSITIVE_FIELDS covers the expected tables', () => {
  const tables = [...new Set(FIELDS.map((f) => f.table))].sort();
  assert.deepEqual(
    tables,
    ['integration_oauth_credential', 'payment_type', 'payment_type_gateway_config', 'user'],
    'must cover all 4 tables with sensitive fields'
  );
});

test('user.password is protected with SELECT=NONE', () => {
  const pwd = FIELDS.find((f) => f.table === 'user' && f.field === 'password');
  assert.ok(pwd, 'user.password must be in SENSITIVE_FIELDS');
  assert.equal(pwd.select, 'NONE', 'SELECT must be NONE — SPA never needs the hash');
  assert.equal(pwd.create, 'FULL', 'CREATE must be FULL — admin can set passwords');
  assert.equal(pwd.update, 'FULL', 'UPDATE must be FULL — admin can change passwords');
});

test('integration_oauth_credential token fields are protected', () => {
  const access = FIELDS.find((f) => f.table === 'integration_oauth_credential' && f.field === 'access_token_enc');
  const refresh = FIELDS.find((f) => f.table === 'integration_oauth_credential' && f.field === 'refresh_token_enc');
  assert.ok(access, 'access_token_enc must be protected');
  assert.ok(refresh, 'refresh_token_enc must be protected');
  assert.equal(access.select, 'NONE');
  assert.equal(refresh.select, 'NONE');
});

test('payment_type gateway config fields are protected', () => {
  const legacy = FIELDS.find((f) => f.table === 'payment_type' && f.field === 'gateway_config');
  const encrypted = FIELDS.find((f) => f.table === 'payment_type' && f.field === 'gateway_config_encrypted');
  assert.ok(legacy, 'legacy gateway_config must be protected');
  assert.ok(encrypted, 'gateway_config_encrypted must be protected');
  assert.equal(legacy.select, 'NONE');
  assert.equal(encrypted.select, 'NONE');
});

test('all 7 payment_type_gateway_config credential fields are protected', () => {
  const expected = [
    'client_id',
    'client_secret',
    'integrity_salt',
    'merchant_id',
    'public_key',
    'secret_key',
    'webhook_secret',
  ];
  const actual = FIELDS.filter((f) => f.table === 'payment_type_gateway_config').map((f) => f.field).sort();
  assert.deepEqual(actual, expected.sort(), 'all 7 credential fields must be protected');
  // All must have SELECT=NONE
  for (const f of FIELDS.filter((f) => f.table === 'payment_type_gateway_config')) {
    assert.equal(f.select, 'NONE', `${f.field} must have SELECT=NONE`);
    assert.equal(f.create, 'FULL', `${f.field} must keep CREATE=FULL`);
  }
});

test('every field has all 4 permission operations defined', () => {
  for (const f of FIELDS) {
    assert.ok(f.select !== undefined, `${f.table}.${f.field} must define select`);
    assert.ok(f.create !== undefined, `${f.table}.${f.field} must define create`);
    assert.ok(f.update !== undefined, `${f.table}.${f.field} must define update`);
    assert.ok(f.delete !== undefined, `${f.table}.${f.field} must define delete`);
    assert.ok(f.type, `${f.table}.${f.field} must define a type`);
    assert.ok(f.rationale, `${f.table}.${f.field} must document the rationale`);
  }
});

test('buildPermissionsClause generates correct DDL for SELECT=NONE', () => {
  const def = { select: 'NONE', create: 'FULL', update: 'FULL', delete: 'FULL' };
  const result = buildPermissionsClause(def);
  assert.equal(
    result,
    'PERMISSIONS FOR select NONE, FOR create FULL, FOR update FULL, FOR delete FULL',
    'DDL must match the expected format'
  );
});

test('buildPermissionsClause generates WHERE clause for conditional rules', () => {
  const def = {
    select: "$auth.roles CONTAINS 'admin'",
    create: 'NONE',
    update: 'FULL',
    delete: 'FULL',
  };
  const result = buildPermissionsClause(def);
  assert.ok(result.includes("FOR select WHERE $auth.roles CONTAINS 'admin'"));
  assert.ok(result.includes('FOR create NONE'));
  assert.ok(result.includes('FOR update FULL'));
});

test('the full DDL for user.password is syntactically valid', () => {
  const pwd = FIELDS.find((f) => f.table === 'user' && f.field === 'password');
  const ddl = `DEFINE FIELD ${pwd.field} ON ${pwd.table} TYPE ${pwd.type} ${buildPermissionsClause(pwd)};`;
  // Basic syntax checks
  assert.ok(ddl.startsWith('DEFINE FIELD password ON user TYPE '));
  assert.ok(ddl.includes('PERMISSIONS'));
  assert.ok(ddl.includes('FOR select NONE'));
  assert.ok(ddl.includes('FOR create FULL'));
  assert.ok(ddl.includes('FOR update FULL'));
  assert.ok(ddl.endsWith(';'));
});

test('total protected field count is 12 (1 + 2 + 2 + 7)', () => {
  assert.equal(FIELDS.length, 12, 'must protect exactly 12 fields: 1 user + 2 oauth + 2 payment_type + 7 gateway_config');
});
