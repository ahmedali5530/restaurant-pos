'use strict';

const os = require('os');

/**
 * Modern node-usb exports EventEmitter on `usb.usb`, while escpos-usb calls `usb.on`.
 * patch-package fixes that, but often fails to apply on Windows — shim the root export too.
 */
function ensureUsbEventEmitterApi() {
  const usbPkg = require('usb');
  const ee = usbPkg.usb && typeof usbPkg.usb.on === 'function' ? usbPkg.usb : usbPkg;
  if (typeof usbPkg.on !== 'function' && typeof ee.on === 'function') {
    for (const method of [
      'on',
      'once',
      'off',
      'addListener',
      'removeListener',
      'removeAllListeners',
      'emit',
      'listenerCount',
    ]) {
      if (typeof ee[method] === 'function' && typeof usbPkg[method] !== 'function') {
        usbPkg[method] = ee[method].bind(ee);
      }
    }
  }
  return usbPkg;
}

ensureUsbEventEmitterApi();

const USB = require('escpos-usb');

/**
 * Parse USB vendor/product id from number or hex/decimal string.
 * Accepts: 0x04b8, "0x04b8", "04b8", 1208, "1208"
 * @param {unknown} value
 * @returns {number|null}
 */
function parseUsbId(value) {
  if (value == null || value === '') return null;
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value >>> 0;
  }

  const s = String(value).trim();
  if (!s) return null;

  // Hex: 0x04b8, or hex-looking tokens like 04b8 / 0e15 (must not use decimal parseInt)
  if (/^0x[0-9a-f]+$/i.test(s) || (/^[0-9a-f]+$/i.test(s) && /[a-f]/i.test(s))) {
    const n = parseInt(s, 16);
    return Number.isFinite(n) ? n : null;
  }

  const n = parseInt(s, 10);
  return Number.isFinite(n) ? n : null;
}

function listVisibleUsbIds() {
  try {
    const usb = require('usb');
    return usb.getDeviceList().map((d) => {
      const desc = d.deviceDescriptor;
      return `0x${desc.idVendor.toString(16)}:0x${desc.idProduct.toString(16)}`;
    });
  } catch (_) {
    return [];
  }
}

/**
 * USB printer driver using escpos-usb adapter.
 * @param {Object} config - { vid?: number|string, pid?: number|string }
 * @returns {Object} escpos USB adapter (device) with open, write, close
 */
function createDevice(config = {}) {
  const vid = parseUsbId(config.vid);
  const pid = parseUsbId(config.pid);

  try {
    if (vid != null && pid != null) {
      return new USB(vid, pid);
    }
    return new USB();
  } catch (err) {
    const msg = err && err.message ? err.message : String(err);
    if (/can not find printer/i.test(msg)) {
      const ids =
        vid != null && pid != null
          ? ` (vid=0x${vid.toString(16)}, pid=0x${pid.toString(16)})`
          : ' (auto-detect; set VID/PID in printer settings)';
      const seen = listVisibleUsbIds();
      const seenHint = seen.length
        ? ` libusb can see: ${seen.join(', ')}.`
        : ' libusb sees no USB devices.';
      const hint =
        os.platform() === 'win32'
          ? `${seenHint} On Windows, WinUSB (Zadig) or UsbDK is required for USB ESC/POS — the normal Windows printer driver is not enough. Set VID/PID, then install WinUSB for that device.`
          : `${seenHint} Check the USB printer is connected and powered; set VID/PID if auto-detect fails.`;
      throw new Error(`Can not find printer${ids}.${hint}`);
    }
    throw err;
  }
}

module.exports = { createDevice, parseUsbId };
