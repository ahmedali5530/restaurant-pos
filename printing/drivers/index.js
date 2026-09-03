'use strict';

const usb = require('./usb');
const serial = require('./serial');
const network = require('./network');
const bluetooth = require('./bluetooth');

const DRIVERS = {
  usb,
  serial,
  network,
  bluetooth,
};

/**
 * Create an escpos-compatible device (adapter) from a printer config.
 * @param {Object} printer - { type: 'usb'|'serial'|'network'|'bluetooth', ...driverConfig }
 * @returns {Object} device with open(), write(), close()
 */
function createDevice(printer) {
  const { type } = printer;
  const driver = DRIVERS[type];
  if (!driver) {
    throw new Error(`Unknown printer type: ${type}. Use: usb, serial, network, bluetooth`);
  }
  return driver.createDevice(printer);
}

module.exports = {
  createDevice,
  usb,
  serial,
  network,
  bluetooth,
};
