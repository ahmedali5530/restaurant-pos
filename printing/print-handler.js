'use strict';

const { normalizeConfig, mergeEffectiveConfig } = require('./lib/receipt-helpers');
const { getEngine } = require('./lib/engines');
const { getBuilder } = require('./print-builders');
const { createDevice } = require('./drivers');
const { DEFAULT_OPTIONS } = require('./lib/engines/text-engine');
const { withPrinterLock } = require('./lib/printer-queue');

/**
 * Handle print request: for each printer, merge type+device config, pick engine, print.
 * Jobs for the same physical printer are serialized so each ticket cuts before the next starts.
 * @param {Object} body - { printers: Array<{ type, print_mode?, paper_width_mm?, ... }>, data: { printType, ... }, config?: object }
 * @returns {Promise<{ success: boolean, results: Array<{ index: number, ok: boolean, error?: string, mode?: string }> }>}
 */
async function handlePrint(body) {
  const { printers = [], data = {}, config: rawConfig = {} } = body;
  const printType = data.printType || 'final';
  const copies = Math.max(1, Number(data.copies) || 1);

  if (!Array.isArray(printers) || printers.length === 0) {
    throw new Error('Request must include a non-empty "printers" array');
  }

  const typeConfig = normalizeConfig(rawConfig);
  const results = [];

  for (let i = 0; i < printers.length; i++) {
    const p = printers[i];
    try {
      const effective = mergeEffectiveConfig(typeConfig, p);
      const commandSet = String(p.command_set || p.commandSet || '').trim().toLowerCase();
      const engine = commandSet === 'star' || commandSet === 'star-graphic' || commandSet === 'star_graphic'
        ? getEngine('star-graphic')
        : getEngine(effective.printMode);
      const escposOptions = p.escposOptions || {};

      const target = p.ip
        ? `${p.ip}:${p.port || 9100}`
        : [p.type, p.vid, p.pid].filter((v) => v != null && v !== '').join(' ');
      console.log(
        `[print] sending ${printType} x${copies} to ${p.name || p.type || 'printer'} ${target} (${engine.name})`
      );
      await withPrinterLock(p, async () => {
        for (let c = 0; c < copies; c++) {
          await engine.print(p, escposOptions, printType, data, effective);
        }
      });
      console.log(`[print] sent ${printType} to ${p.name || target}`);
      results.push({ index: i, ok: true, mode: engine.name });
    } catch (err) {
      results.push({
        index: i,
        ok: false,
        error: err && (err.message || String(err)),
      });
      console.error(
        `[print] Printer ${i} failed:`,
        err && err.message ? err.message : String(err)
      );
    }
  }

  const success = results.every((r) => r.ok);
  return { success, results };
}

/**
 * Legacy helper used by tests / tooling — text path only.
 */
function printOnDevice(device, escposOptions, printType, data, config) {
  const escpos = require('escpos');
  const escposOpts = { ...DEFAULT_OPTIONS, ...escposOptions };
  const printer = new escpos.Printer(device, escposOpts);
  const configWithPrinter = {
    ...normalizeConfig(config),
    escposLineWidth: escposOpts.width,
  };

  return new Promise((resolve, reject) => {
    device.open((openErr) => {
      if (openErr) return reject(openErr);
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

module.exports = {
  handlePrint,
  printOnDevice,
  getBuilder,
  createDevice,
};
