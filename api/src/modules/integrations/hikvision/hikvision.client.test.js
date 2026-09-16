'use strict';

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { parseWwwAuthenticate, buildDigestHeader } = require('./hikvision.client');
const { normalizeDevice } = require('./hikvision.service');

describe('hikvision.client digest helpers', () => {
  test('parses Digest WWW-Authenticate header', () => {
    const parsed = parseWwwAuthenticate(
      'Digest realm="Login to 123", qop="auth", nonce="abc123", opaque="xyz"'
    );
    assert.deepEqual(parsed, {
      realm: 'Login to 123',
      qop: 'auth',
      nonce: 'abc123',
      opaque: 'xyz',
    });
  });

  test('builds Digest Authorization header with qop', () => {
    const header = buildDigestHeader({
      username: 'admin',
      password: 'pass',
      method: 'GET',
      uri: '/ISAPI/System/deviceInfo?format=json',
      challenge: {
        realm: 'Login to 123',
        qop: 'auth',
        nonce: 'abc123',
        opaque: 'xyz',
      },
      nc: '00000001',
      cnonce: 'deadbeef',
    });

    assert.match(header, /Digest username="admin"/);
    assert.match(header, /realm="Login to 123"/);
    assert.match(header, /qop=auth/);
    assert.match(header, /nc=00000001/);
    assert.match(header, /cnonce="deadbeef"/);
    assert.match(header, /response=/);
    assert.match(header, /opaque="xyz"/);
  });
});

describe('hikvision.service normalizeDevice', () => {
  test('requires host username password', () => {
    assert.throws(() => normalizeDevice({}), /host/i);
    assert.throws(() => normalizeDevice({ host: '1.2.3.4' }), /username/i);
    assert.throws(() => normalizeDevice({ host: '1.2.3.4', username: 'admin' }), /password/i);
  });

  test('defaults ports from useHttps', () => {
    const httpDevice = normalizeDevice({
      host: '192.168.1.50',
      username: 'admin',
      password: 'x',
    });
    assert.equal(httpDevice.port, 80);
    assert.equal(httpDevice.useHttps, false);

    const httpsDevice = normalizeDevice({
      host: '203.0.113.10',
      username: 'admin',
      password: 'x',
      useHttps: true,
      port: 8443,
    });
    assert.equal(httpsDevice.port, 8443);
    assert.equal(httpsDevice.useHttps, true);
  });
});
