'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

describe('master reconnect resilience', () => {
  it('keeps scheduling reconnect when unhealthy and does not defer forever on catalog sync', () => {
    const src = fs.readFileSync(path.join(__dirname, 'sync-manager.js'), 'utf8');
    assert.match(
      src,
      /if \(!this\.isStopping && !this\.stats\.healthy\) \{\s*this\.scheduleReconnect\(\);/s
    );
    assert.doesNotMatch(src, /Deferring reconnect until catalog download finishes/);
    assert.doesNotMatch(src, /Skipping reconnect while catalog download is running/);
    assert.match(src, /createConnectedClient\('Master'/);
    assert.doesNotMatch(src, /withTimeout\(\s*createConnectedClient/);
  });
});
