'use strict';

const escpos = require('escpos');
const { createDevice } = require('./drivers');
const { getBuilder } = require('./print-builders');

const DEFAULT_OPTIONS = { encoding: 'UTF-8', width: 42 };

/**
 * Open device, create Printer, run build, then close.
 * @param {Object} device - escpos adapter
 * @param {Object} escposOptions - { encoding, width }
 * @param {string} printType - temp | summary | kitchen | delivery | final | refund
 * @param {Object} data - payload for the print builder
 * @param {Object} config - normalized printer config (margins, logo, companyName, show*, vat*)
 * @returns {Promise<void>}
 */
function printOnDevice(device, escposOptions, printType, data, config) {
  const escposOpts = { ...DEFAULT_OPTIONS, ...escposOptions };
  const printer = new escpos.Printer(device, escposOpts);
  const configWithPrinter = {
    ...config,
    escposLineWidth: escposOpts.width,
  };

  return new Promise((resolve, reject) => {
    device.open((openErr) => {
      if (openErr) {
        return reject(openErr);
      }

      const builder = getBuilder(printType);

      Promise.resolve(builder.build(printer, data, configWithPrinter))
        .then(() => {
          return new Promise((res, rej) => {
            printer.close((closeErr) => (closeErr ? rej(closeErr) : res()));
          });
        })
        .then(resolve)
        .catch(reject);
    });
  });
}

/**
 * Handle print request: for each printer, create device from driver, run the selected print builder, then close.
 * @param {Object} body - { printers: Array<{ type, ... }>, data: { printType, ... }, config?: { companyName, logo, margins, show*, vat* } }
 * @returns {Promise<{ success: boolean, results: Array<{ index: number, ok: boolean, error?: string }> }>}
 */
async function handlePrint(body) {
  const { printers = [], data = {}, config: rawConfig = {} } = body;
  const printType = data.printType || 'final';
  const copies = Math.max(1, Number(data.copies) || 1);

  if (!Array.isArray(printers) || printers.length === 0) {
    throw new Error('Request must include a non-empty "printers" array');
  }

  const { normalizeConfig } = require('./lib/receipt-helpers');
  const config = normalizeConfig(rawConfig);

  const results = [];

  for (let i = 0; i < printers.length; i++) {
    const p = printers[i];
    try {
      for (let c = 0; c < copies; c++) {
        const device = createDevice(p);
        await printOnDevice(device, p.escposOptions || {}, printType, data, config);
      }
      results.push({ index: i, ok: true });
    } catch (err) {
      results.push({
        index: i,
        ok: false,
        error: err && (err.message || String(err)),
      });

      console.log(Object.keys(err), Object.values(err))
    }
  }

  const success = results.every((r) => r.ok);
  return { success, results };
}

module.exports = { handlePrint, printOnDevice, getBuilder, createDevice };
