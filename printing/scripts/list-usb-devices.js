'use strict';

/**
 * List USB devices visible to node-usb / libusb.
 * Run on the Windows host:  node scripts/list-usb-devices.js
 */

const USB = require('escpos-usb');
const usb = require('usb');

function hexId(n) {
  return '0x' + Number(n).toString(16).padStart(4, '0');
}

console.log('Platform:', process.platform);
console.log('');

let devices = [];
try {
  devices = usb.getDeviceList();
} catch (err) {
  console.error('Failed to list USB devices:', err.message || err);
  process.exit(1);
}

if (!devices.length) {
  console.log('No USB devices visible to libusb.');
  console.log('On Windows this usually means libusb cannot access devices until WinUSB (Zadig) or UsbDK is installed.');
  process.exit(2);
}

console.log(`USB devices seen by libusb (${devices.length}):`);
for (const d of devices) {
  const desc = d.deviceDescriptor;
  const vid = hexId(desc.idVendor);
  const pid = hexId(desc.idProduct);
  let printerClass = false;
  try {
    printerClass = !!(
      d.configDescriptor &&
      d.configDescriptor.interfaces.some((iface) =>
        iface.some((conf) => conf.bInterfaceClass === 0x07)
      )
    );
  } catch (_) {
    // configDescriptor often unreadable on Windows without WinUSB
  }
  console.log(`  VID ${vid}  PID ${pid}${printerClass ? '  [printer class]' : ''}`);
}

console.log('');
let printers = [];
try {
  printers = USB.findPrinter() || [];
} catch (err) {
  console.error('USB.findPrinter() failed:', err.message || err);
}

console.log(`escpos-usb findPrinter(): ${printers.length} device(s)`);
if (!printers.length) {
  console.log('');
  console.log('Auto-detect found no printer-class device.');
  console.log('On Windows you typically must:');
  console.log('  1. Set VID/PID in POS printer settings (from the list above)');
  console.log('  2. Install WinUSB for that device with Zadig: https://zadig.akeo.ie/');
  console.log('     Options → List All Devices → select printer → WinUSB → Replace Driver');
  process.exit(3);
}

process.exit(0);
