'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const net = require('net');
const { createDevice } = require('./network');

test('network close flushes with socket.end instead of destroy', async () => {
  const received = [];
  const server = net.createServer((sock) => {
    sock.on('data', (buf) => received.push(buf));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  const device = createDevice({ ip: '127.0.0.1', port });
  const payload = Buffer.from('POSR-FLUSH-TEST');

  await new Promise((resolve, reject) => {
    device.open((openErr) => {
      if (openErr) return reject(openErr);
      const sock = device.device;
      const calls = [];
      const origEnd = sock.end.bind(sock);
      const origDestroy = sock.destroy.bind(sock);
      sock.end = function end(...args) {
        calls.push('end');
        return origEnd(...args);
      };
      sock.destroy = function destroy(...args) {
        calls.push('destroy');
        return origDestroy(...args);
      };
      device.write(payload, (writeErr) => {
        if (writeErr) return reject(writeErr);
        device.close((closeErr) => {
          if (closeErr) return reject(closeErr);
          try {
            assert.deepEqual(calls, ['end']);
            resolve();
          } catch (e) {
            reject(e);
          }
        });
      });
    });
  });

  await new Promise((resolve) => setTimeout(resolve, 30));
  await new Promise((resolve) => server.close(resolve));
  assert.equal(Buffer.concat(received).toString(), payload.toString());
});
