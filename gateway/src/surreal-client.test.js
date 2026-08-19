'use strict';

/**
 * Regression test for the fail-open DB-credential defect: this module used
 * to fall back to a hardcoded 'root'/'root' SurrealDB credential when
 * SURREAL_USER/SURREAL_PASS were unset. It must now refuse to start without
 * real values. Each case runs in its own child process since the check runs
 * at module-load time (Node's module cache would hide it on a second import
 * in-process).
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

test('throws at load time when SURREAL_USER/SURREAL_PASS are unset — no root/root fallback', () => {
  assert.throws(
    () => runInChildProcess({ SURREAL_USER: '', SURREAL_PASS: '' }),
    /SURREAL_USER and SURREAL_PASS are required/
  );
});

test('throws when only SURREAL_USER is set', () => {
  assert.throws(
    () => runInChildProcess({ SURREAL_USER: 'someuser', SURREAL_PASS: '' }),
    /SURREAL_USER and SURREAL_PASS are required/
  );
});

test('throws when only SURREAL_PASS is set', () => {
  assert.throws(
    () => runInChildProcess({ SURREAL_USER: '', SURREAL_PASS: 'somepass' }),
    /SURREAL_USER and SURREAL_PASS are required/
  );
});

test('loads with root/root — existing datastores keep the original root user', () => {
  const out = runInChildProcess({ SURREAL_USER: 'root', SURREAL_PASS: 'root' });
  assert.match(out, /loaded-ok/);
});

test('loads successfully once both are configured with real values', () => {
  const out = runInChildProcess({ SURREAL_USER: 'realuser', SURREAL_PASS: 'realpass' });
  assert.match(out, /loaded-ok/);
});
