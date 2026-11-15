'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const {
  hasDatabaseBackupAccess,
  surrealHttpEndpoint,
  resolveSurrealBin,
  maxUploadBytes,
} = require('./backup.helpers');

describe('hasDatabaseBackupAccess', () => {
  it('allows exact settings.database', () => {
    assert.equal(hasDatabaseBackupAccess(['settings.database']), true);
  });

  it('allows settings.* wildcard', () => {
    assert.equal(hasDatabaseBackupAccess(['settings.*']), true);
  });

  it('rejects admin-only grants', () => {
    assert.equal(hasDatabaseBackupAccess(['admin', 'admin.dishes', 'admin.*']), false);
  });

  it('rejects settings parent without database child', () => {
    assert.equal(hasDatabaseBackupAccess(['settings', 'settings.backup']), false);
  });

  it('rejects empty / non-array', () => {
    assert.equal(hasDatabaseBackupAccess([]), false);
    assert.equal(hasDatabaseBackupAccess(null), false);
  });
});

describe('surrealHttpEndpoint', () => {
  it('converts ws Surreal URL to http without /rpc', () => {
    assert.equal(
      surrealHttpEndpoint({ SURREAL_URL: 'ws://surrealdb:8000/rpc' }),
      'http://surrealdb:8000',
    );
  });

  it('prefers SURREAL_HTTP_ENDPOINT', () => {
    assert.equal(
      surrealHttpEndpoint({
        SURREAL_HTTP_ENDPOINT: 'http://db:9000/',
        SURREAL_URL: 'ws://ignored:8000/rpc',
      }),
      'http://db:9000',
    );
  });
});

describe('resolveSurrealBin', () => {
  it('keeps an existing SURREAL_BIN', () => {
    assert.equal(
      resolveSurrealBin({
        bin: '/surreal',
        execDir: 'C:\\POSR',
        entries: () => ['posr-surreal-x86_64-pc-windows-msvc.exe'],
        exists: (file) => file === '/surreal',
      }),
      '/surreal',
    );
  });

  it('uses the sidecar beside Node when SURREAL_BIN is missing', () => {
    const execDir = 'C:\\Users\\pos\\AppData\\Local\\POSR';
    const name = 'posr-surreal-x86_64-pc-windows-msvc.exe';
    assert.equal(
      resolveSurrealBin({
        bin: '',
        execDir,
        entries: () => ['POSR.exe', 'posr-node-x86_64-pc-windows-msvc.exe', name],
        exists: (file) => file === path.join(execDir, name),
      }),
      path.join(execDir, name),
    );
  });
});

describe('maxUploadBytes', () => {
  it('defaults to 512MB', () => {
    assert.equal(maxUploadBytes({}), 512 * 1024 * 1024);
  });

  it('reads BACKUP_MAX_UPLOAD_BYTES', () => {
    assert.equal(maxUploadBytes({ BACKUP_MAX_UPLOAD_BYTES: '1048576' }), 1048576);
  });
});
