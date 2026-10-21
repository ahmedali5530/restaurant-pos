'use strict';

const { createDevice } = require('../../drivers');
const { renderRasterPngs } = require('../raster-render');
const { pngToStarGraphic } = require('../star-graphic');

const PULSE_TYPES = new Set(['final']);

function openDevice(device) {
  return new Promise((resolve, reject) => {
    device.open((err) => (err ? reject(err) : resolve()));
  });
}

function writeDevice(device, buf) {
  return new Promise((resolve, reject) => {
    device.write(buf, (err) => (err ? reject(err) : resolve()));
  });
}

function closeDevice(device) {
  return new Promise((resolve, reject) => {
    device.close((err) => (err ? reject(err) : resolve()));
  });
}

/**
 * Render the ticket to an image and send Star Graphic Mode.
 * TSP100-class printers discard ESC/POS text.
 * @param {Object} printerDriver
 * @param {Object} _escposOptions
 * @param {string} printType
 * @param {Object} data
 * @param {Object} config
 * @returns {Promise<void>}
 */
async function print(printerDriver, _escposOptions, printType, data, config) {
  const t = String(printType || 'final').toLowerCase();
  const pngs = await renderRasterPngs(t, data, config);
  const device = createDevice(printerDriver);
  await openDevice(device);
  try {
    for (let i = 0; i < pngs.length; i++) {
      const last = i === pngs.length - 1;
      const bytes = await pngToStarGraphic(pngs[i], {
        eot: last ? 13 : 2,
        pulseDrawer: last && PULSE_TYPES.has(t),
        threshold: config && config.rasterThreshold,
      });
      console.log(`[print] star-graphic ${bytes.length} bytes`);
      await writeDevice(device, bytes);
    }
    await closeDevice(device);
  } catch (err) {
    try {
      await closeDevice(device);
    } catch (_) {
      // ignore close after a failed write
    }
    throw err;
  }
}

module.exports = { print };
