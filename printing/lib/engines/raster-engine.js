'use strict';

const escpos = require('escpos');
const { createDevice } = require('../../drivers');
const {
  normalizeConfig,
  printEscposImage,
  hardResetLayout,
  feedBottomMargin,
  sendCashDrawerPulse,
  resolvePaperWidthPx,
} = require('../receipt-helpers');
const { renderRasterPngs } = require('../raster-render');
const textEngine = require('./text-engine');

const DEFAULT_OPTIONS = { encoding: 'UTF-8', width: 42 };

/**
 * Types that should pulse the cash drawer after a successful raster print.
 */
const PULSE_TYPES = new Set(['final']);

/**
 * Print receipt as full-width monochrome bit-image(s).
 * Falls back to text engine for unsupported types (pulse, deletion, …).
 *
 * @param {Object} printerDriver
 * @param {Object} escposOptions
 * @param {string} printType
 * @param {Object} data
 * @param {Object} config
 * @returns {Promise<void>}
 */
async function print(printerDriver, escposOptions, printType, data, config) {
  const t = String(printType || 'final').toLowerCase();

  // Pulse / deletion have no raster layout — keep the ESC/POS command path.
  if (t === 'pulse' || t === 'deletion') {
    console.warn(`[raster] print type "${t}" has no raster layout; falling back to text`);
    return textEngine.print(printerDriver, escposOptions, printType, data, config);
  }

  let pngs;
  try {
    pngs = await renderRasterPngs(t, data, config);
  } catch (err) {
    if (err && err.code === 'RASTER_UNSUPPORTED') {
      console.warn(`[raster] ${err.message}; falling back to text`);
      return textEngine.print(printerDriver, escposOptions, printType, data, config);
    }
    throw err;
  }

  const cfg = normalizeConfig(config);
  const device = createDevice(printerDriver);
  const escposOpts = { ...DEFAULT_OPTIONS, ...escposOptions };
  const printer = new escpos.Printer(device, escposOpts);
  const paperWidth = resolvePaperWidthPx(cfg);

  await new Promise((resolve, reject) => {
    device.open(async (openErr) => {
      if (openErr) return reject(openErr);
      try {
        hardResetLayout(printer);
        for (const png of pngs) {
          const ok = await printEscposImage(printer, png, {
            mime: 'image/png',
            align: 'lt',
            // Already mono + correct width from raster-render
            skipPrepare: true,
            forceMono: true,
            paperWidth,
            hAlign: 'left',
            maxWidth: paperWidth,
          });
          if (!ok) {
            throw new Error('Failed to write raster bit-image to printer');
          }
        }
        feedBottomMargin(printer, cfg);
        if (PULSE_TYPES.has(t)) {
          sendCashDrawerPulse(printer);
        }
        printer.cut();
        await new Promise((res, rej) => {
          printer.close((closeErr) => (closeErr ? rej(closeErr) : res()));
        });
        resolve();
      } catch (e) {
        try {
          printer.close(() => {});
        } catch (_) {
          // ignore
        }
        reject(e);
      }
    });
  });
}

module.exports = { print };
