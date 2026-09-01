'use strict';

let Bluetooth;
try {
  Bluetooth = require('escpos-bluetooth');
} catch (e) {
  Bluetooth = null;
}

/**
 * Bluetooth printer driver using escpos-bluetooth adapter.
 * Requires: escpos-bluetooth (optional) and libbluetooth-dev on Linux.
 * @param {Object} config - { address: string, channel?: number }
 * @returns {Object} escpos Bluetooth adapter (device) with open, write, close
 */
function createDevice(config = {}) {
  if (!Bluetooth) {
    throw new Error(
      'Bluetooth driver not available. Install escpos-bluetooth and libbluetooth-dev (Linux) to enable.'
    );
  }
  const { address, channel = 1 } = config;
  if (!address) {
    throw new Error('Bluetooth printer requires "address" (MAC) in config');
  }
  return new Bluetooth(address, channel);
}

module.exports = { createDevice };
