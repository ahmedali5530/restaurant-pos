'use strict';

const Serial = require('escpos-serialport');

/**
 * Serial printer driver using escpos-serialport adapter.
 * @param {Object} config - { path: string, baudRate?: number, dataBits?: number, stopBits?: number, parity?: string }
 * @returns {Object} escpos Serial adapter (device) with open, write, close
 */
function createDevice(config = {}) {
  const {
    path = '/dev/ttyUSB0',
    baudRate = 9600,
    dataBits = 8,
    stopBits = 1,
    parity = 'none',
  } = config;

  const options = { baudRate, dataBits, stopBits, parity };
  return new Serial(path, options);
}

module.exports = { createDevice };
