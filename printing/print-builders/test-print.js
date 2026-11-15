'use strict';

const {
  normalizeConfig,
  applyMargins,
  feedBottomMargin,
  printCenteredText,
  printFixedLine,
  printDivider,
  printPrintingTimestamp,
} = require('../lib/receipt-helpers');
const { testSlipContent } = require('../lib/test-print-content');

/**
 * Short connectivity slip. No order data and no cash-drawer pulse.
 * Expects data: { printerName?, printerType?, address?, lines?: { title, name, type, address, ok } }
 */
function build(printer, data = {}, config = {}) {
  const cfg = normalizeConfig(config);
  const slip = testSlipContent(data);

  applyMargins(printer, cfg);
  slip.titleLines.forEach((line) => {
    printCenteredText(printer, line, { style: 'bold' });
  });
  printDivider(printer);
  slip.rowLines.forEach((line) => {
    printFixedLine(printer, line, { align: 'left' });
  });
  if (slip.rowLines.length) {
    try {
      printer.feed(1);
    } catch (e) {
      // ignore
    }
  }
  slip.okLines.forEach((line) => {
    printCenteredText(printer, line);
  });
  feedBottomMargin(printer, cfg);
  printPrintingTimestamp(printer, cfg);
  printer.cut();
  return Promise.resolve(printer);
}

module.exports = { build };
