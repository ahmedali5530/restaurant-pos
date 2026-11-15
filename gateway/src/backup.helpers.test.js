'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  hasDatabaseBackupAccess,
  surrealHttpEndpoint,
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

describe('maxUploadBytes', () => {
  it('defaults to 512MB', () => {
    assert.equal(maxUploadBytes({}), 512 * 1024 * 1024);
  });

  it('reads BACKUP_MAX_UPLOAD_BYTES', () => {
    assert.equal(maxUploadBytes({ BACKUP_MAX_UPLOAD_BYTES: '1048576' }), 1048576);
  });
});
