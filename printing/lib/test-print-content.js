'use strict';

const { wrapReceiptText } = require('./receipt-helpers');

/**
 * Shared lines for the connectivity test slip (text and raster engines).
 * Labels come from the client so the slip follows the UI language.
 * @param {Object} [data]
 * @returns {{ titleLines: string[], rowLines: string[], okLines: string[] }}
 */
function testSlipContent(data) {
  const source = data && typeof data === 'object' ? data : {};
  const lines = source.lines && typeof source.lines === 'object' ? source.lines : {};
  const title = String(lines.title || 'TEST PRINT');
  const nameLabel = String(lines.name || 'Name');
  const typeLabel = String(lines.type || 'Type');
  const addressLabel = String(lines.address || 'Address');
  const ok = String(lines.ok || 'If you can read this, the printer is connected.');

  const rows = [];
  if (source.printerName) rows.push(`${nameLabel}: ${source.printerName}`);
  if (source.printerType) rows.push(`${typeLabel}: ${source.printerType}`);
  if (source.address) rows.push(`${addressLabel}: ${source.address}`);

  const wrap = (text) => wrapReceiptText(text, 'normal').filter((line) => String(line).trim() !== '');

  return {
    titleLines: wrap(title),
    rowLines: rows.flatMap(wrap),
    okLines: wrap(ok),
  };
}

module.exports = { testSlipContent };
