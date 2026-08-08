'use strict';

const {
  normalizeConfig,
  printReceiptHeader,
  printFooterSections,
  feedBottomMargin,
  printPrintingTimestamp,
} = require('../lib/receipt-helpers');

function isCell(v) {
  return !!v && typeof v === 'object' && (
    Object.prototype.hasOwnProperty.call(v, 'text') ||
    Object.prototype.hasOwnProperty.call(v, 'align') ||
    Object.prototype.hasOwnProperty.call(v, 'width') ||
    Object.prototype.hasOwnProperty.call(v, 'cols') ||
    Object.prototype.hasOwnProperty.call(v, 'style')
  );
}

function normalizeAlign(align) {
  const a = String(align || '').trim().toUpperCase();
  if (a === 'LEFT' || a === 'L' || a === 'LT') return 'LEFT';
  if (a === 'RIGHT' || a === 'R' || a === 'RT') return 'RIGHT';
  if (a === 'CENTER' || a === 'C' || a === 'CT') return 'CENTER';
  return 'LEFT';
}

function normalizeCell(cell) {
  const out = {
    text: cell && cell.text != null ? String(cell.text) : '',
    align: normalizeAlign(cell && cell.align),
  };

  const width = Number(cell && cell.width);
  if (!Number.isNaN(width) && width > 0) out.width = width;

  const cols = parseInt(cell && cell.cols, 10);
  if (!Number.isNaN(cols) && cols > 0) out.cols = cols;

  if (cell && cell.style != null && String(cell.style).trim()) {
    out.style = String(cell.style).trim().toUpperCase();
  }

  return out;
}

function normalizeRows(data) {
  const raw = Array.isArray(data.rows)
    ? data.rows
    : (Array.isArray(data.table) ? data.table : []);

  if (raw.length === 0) return [];

  // Single row shorthand:
  // data.rows = [{ text, align, width, style }, ...]
  if (raw.every(isCell)) {
    return [{ cells: raw.map(normalizeCell) }];
  }

  // Full rows:
  // data.rows = [
  //   [{...}, {...}],
  //   { columns: [{...}, {...}], size: [1,1] },
  // ]
  return raw
    .map((row) => {
      if (Array.isArray(row) && row.every(isCell)) {
        return { cells: row.map(normalizeCell) };
      }
      if (row && typeof row === 'object' && Array.isArray(row.columns) && row.columns.every(isCell)) {
        const size = Array.isArray(row.size) ? row.size : undefined;
        return {
          cells: row.columns.map(normalizeCell),
          size,
        };
      }
      return null;
    })
    .filter(Boolean);
}

/**
 * Generic table printer.
 * Expects data:
 * {
 *   rows: [{ text, align, width, cols, style }, ...] | Array< Array<cell> | { columns: cell[], size?: [w,h] } >,
 *   size?: [w, h],   // default cell size for rows without row.size
 *   feed?: number,   // extra feed lines before cut
 *   cut?: boolean    // default true
 * }
 */
function build(printer, data = {}, config = {}) {
  const cfg = normalizeConfig(config);
  const rows = normalizeRows(data);
  const defaultSize = Array.isArray(data.size) ? data.size : [1, 1];
  const feed = Math.max(0, parseInt(data.feed, 10) || 0);
  const shouldCut = data.cut !== false;

  return printReceiptHeader(printer, cfg).then(() => {
    rows.forEach((row) => {
      if (!row || !Array.isArray(row.cells) || row.cells.length === 0) return;
      const size = Array.isArray(row.size) ? row.size : defaultSize;
      printer.tableCustom(row.cells, { size });
    });

    return printFooterSections(printer, cfg).then(() => {
      feedBottomMargin(printer, cfg);
      if (feed > 0) printer.feed(feed);
      printPrintingTimestamp(printer, cfg);
      if (shouldCut) printer.cut();
      return printer;
    });
  });
}

module.exports = { build };
