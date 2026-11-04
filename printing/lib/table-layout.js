'use strict';

const { PRINTER_WIDTH } = require('./receipt-helpers');

function isCell(value) {
  return !!value && typeof value === 'object' && (
    Object.prototype.hasOwnProperty.call(value, 'text') ||
    Object.prototype.hasOwnProperty.call(value, 'align') ||
    Object.prototype.hasOwnProperty.call(value, 'width') ||
    Object.prototype.hasOwnProperty.call(value, 'cols') ||
    Object.prototype.hasOwnProperty.call(value, 'style')
  );
}

function normalizeCell(cell) {
  const out = {
    text: cell && cell.text != null ? String(cell.text) : '',
    align: String((cell && cell.align) || 'LEFT').trim().toUpperCase(),
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

/**
 * Same row shapes as print-builders/table-print.js.
 * @param {Object} data
 * @returns {Array<{ cells: Object[], size?: number[] }>}
 */
function normalizeTableRows(data) {
  const source = data || {};
  const raw = Array.isArray(source.rows)
    ? source.rows
    : (Array.isArray(source.table) ? source.table : []);
  if (raw.length === 0) return [];
  if (raw.every(isCell)) {
    return [{ cells: raw.map(normalizeCell) }];
  }
  return raw
    .map((row) => {
      if (Array.isArray(row) && row.every(isCell)) {
        return { cells: row.map(normalizeCell) };
      }
      if (row && typeof row === 'object' && Array.isArray(row.columns) && row.columns.every(isCell)) {
        return {
          cells: row.columns.map(normalizeCell),
          size: Array.isArray(row.size) ? row.size : undefined,
        };
      }
      return null;
    })
    .filter(Boolean);
}

function lineStyle(bold, underline) {
  if (bold && underline) return 'bold-underline';
  if (bold) return 'bold';
  return undefined;
}

/**
 * Mirror escpos Printer.tableCustom: fractional widths, leftover columns on
 * the first padded cell, and overflow wrapped onto the next line.
 * @param {Object[]} cells
 * @param {{ printerWidth?: number, size?: number[] }} [opts]
 * @returns {Array<{ text: string, style?: string, size: string }>}
 */
function formatTableCustomLines(cells, opts) {
  const options = opts || {};
  const printerWidth = options.printerWidth || PRINTER_WIDTH;
  const size = Array.isArray(options.size) ? options.size : [1, 1];
  const widthScale = Number(size[0]) || 1;
  const heightScale = Number(size[1]) || 1;
  const baseWidth = Math.max(1, Math.floor(printerWidth / widthScale));
  const lineSize = widthScale > 1 || heightScale > 1 ? 'large' : 'normal';
  const lines = [];

  function emit(data) {
    if (!data.length) return;
    let cellWidth = Math.floor(baseWidth / data.length);
    let leftoverSpace = baseWidth - cellWidth * data.length;
    let lineStr = '';
    let secondLineEnabled = false;
    const secondLine = [];
    let bold = false;
    let underline = false;

    for (let i = 0; i < data.length; i++) {
      const src = data[i] || {};
      const original = src.text == null ? '' : String(src.text);
      const align = String(src.align || '').toUpperCase();
      const style = String(src.style || '').toUpperCase();
      if (style.includes('B')) bold = true;
      if (style.includes('U')) underline = true;

      if (src.width) cellWidth = baseWidth * Number(src.width);
      else if (src.cols) cellWidth = Number(src.cols);
      if (!(cellWidth > 0)) cellWidth = 1;

      const textLength = original.length;
      let text = original;
      let tooLong = false;
      if (cellWidth < textLength) {
        tooLong = true;
        text = original.substring(0, cellWidth);
        if (text.length >= original.length) {
          text = original.slice(0, Math.max(1, Math.floor(cellWidth)));
        }
      }

      const pad = (count) => {
        const n = count > 0 ? Math.floor(count) : 0;
        if (n) lineStr += ' '.repeat(n);
      };

      if (align === 'CENTER') {
        const spaces = (cellWidth - textLength) / 2;
        pad(spaces);
        if (text) lineStr += text;
        pad(spaces - 1);
      } else if (align === 'RIGHT') {
        let spaces = cellWidth - textLength;
        if (leftoverSpace > 0) {
          spaces += leftoverSpace;
          leftoverSpace = 0;
        }
        pad(spaces);
        if (text) lineStr += text;
      } else {
        if (text) lineStr += text;
        let spaces = Math.floor(cellWidth - textLength);
        if (leftoverSpace > 0) {
          spaces += leftoverSpace;
          leftoverSpace = 0;
        }
        pad(spaces);
      }

      const rest = tooLong ? original.substring(text.length) : '';
      if (rest) secondLineEnabled = true;
      secondLine.push({
        text: rest,
        align: src.align,
        width: src.width,
        cols: src.cols,
        style: src.style,
      });
    }

    lines.push({ text: lineStr, style: lineStyle(bold, underline), size: lineSize });
    if (secondLineEnabled) emit(secondLine);
  }

  emit((cells || []).map((cell) => ({ ...cell })));
  return lines;
}

module.exports = {
  normalizeTableRows,
  formatTableCustomLines,
};
