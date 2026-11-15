'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const {
  createWinSpoolDevice,
  isLibusbUnsupported,
  usbIdHex,
  printerNameFromOutput,
} = require('./winspool');

test('usb id hex is four uppercase digits', () => {
  assert.equal(usbIdHex(0x416), '0416');
  assert.equal(usbIdHex(0x5011), '5011');
});

test('libusb not supported is the Windows driver error', () => {
  assert.equal(isLibusbUnsupported(new Error('LIBUSB_ERROR_NOT_SUPPORTED')), true);
  assert.equal(isLibusbUnsupported(new Error('LIBUSB_ERROR_ACCESS')), false);
});

test('printer name is the first non-empty line', () => {
  assert.equal(printerNameFromOutput('\nCash Register\r\n'), 'Cash Register');
});

test('windows queue buffers bytes and sends them once on close', async () => {
  const calls = [];
  const run = (script, env) => {
    calls.push({ script, env });
    if (calls.length === 1) return Promise.resolve('Cash Register\n');
    const bytes = fs.readFileSync(env.POSR_PRINT_FILE);
    assert.equal(bytes.toString(), 'TICKET');
    assert.equal(env.POSR_PRINTER_NAME, 'Cash Register');
    return Promise.resolve('');
  };
  const device = createWinSpoolDevice({ vid: 0x416, pid: 0x5011 }, { run });
  await new Promise((resolve, reject) => {
    device.open((err) => (err ? reject(err) : resolve()));
  });
  await new Promise((resolve, reject) => {
    device.write(Buffer.from('TICK'), (err) => (err ? reject(err) : resolve()));
  });
  await new Promise((resolve, reject) => {
    device.write(Buffer.from('ET'), (err) => (err ? reject(err) : resolve()));
  });
  await new Promise((resolve, reject) => {
    device.close((err) => (err ? reject(err) : resolve()));
  });
  assert.equal(calls.length, 2);
  assert.equal(calls[0].env.POSR_USB_VID, '0416');
  assert.equal(calls[0].env.POSR_USB_PID, '5011');
});
