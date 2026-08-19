'use strict';

/**
 * Regression test for the fail-open DB-credential defect: this module used
 * to fall back to a hardcoded 'root'/'root' SurrealDB credential when
 * TRACKING_DB_USER/TRACKING_DB_PASS were unset. It must now refuse to start
 * without real values. Each case runs in its own child process since the
 * check runs at module-load time.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const path = require('node:path');

const MODULE_PATH = path.join(__dirname, 'surreal-client.js');

function runInChildProcess(env) {
  return execFileSync(
    process.execPath,
    ['-e', `require(${JSON.stringify(MODULE_PATH)}); console.log('loaded-ok');`],
    { env: { ...process.env, ...env }, encoding: 'utf8' }
  );
}

test('throws at load time when TRACKING_DB_USER/TRACKING_DB_PASS are unset — no root/root fallback', () => {
  assert.throws(
    () => runInChildProcess({ TRACKING_DB_USER: '', TRACKING_DB_PASS: '' }),
    /TRACKING_DB_USER and TRACKING_DB_PASS are required/
  );
});

test('loads successfully once both are configured with real values', () => {
  const out = runInChildProcess({ TRACKING_DB_USER: 'realuser', TRACKING_DB_PASS: 'realpass' });
  assert.match(out, /loaded-ok/);
});
