'use strict';

const escpos = require('escpos');
const Image = escpos.Image;

const PRINTER_WIDTH = 42;

const DEFAULTS = {
  bottomMargin: 0,
  topMargin: 0,
  leftMargin: 0,
  rightMargin: 0,
  logo: '',
  showItemNumber: false,
  showItemName: true,
  showItemPrice: false,
  showItemQuantity: true,
  showItemTotal: false,
  showLogo: false,
  showVatNumber: false,
  vatName: 'VAT',
  vatNumber: '',
  currencySymbol: '$',
  headerSections: [],
  footerSections: [],
};

const TEXT_SIZE_MAP = {
  normal: [1, 1],
  medium: [2, 1],
  large: [2, 2],
};

/**
 * Normalize logo to a base64 or data URI string. Handles array (from DB), string, or buffer-like.
 * @param {*} logo
 * @returns {string}
 */
function normalizeLogo(logo) {
  if (logo == null || logo === '') return '';
  if (typeof logo === 'string') return logo.trim();
  let buf;
  if (Buffer.isBuffer(logo)) buf = logo;
  else if (logo instanceof Uint8Array) buf = Buffer.from(logo);
  else if (logo instanceof ArrayBuffer) buf = Buffer.from(logo);
  else if (Array.isArray(logo)) buf = Buffer.from(logo);
  else return '';
  if (buf.length === 0) return '';
  return `data:image/png;base64,${buf.toString('base64')}`;
}

function normalizeSection(section) {
  if (!section || typeof section !== 'object') return null;
  const align = ['left', 'center', 'right'].includes(section.align) ? section.align : 'center';
  const size = ['normal', 'medium', 'large'].includes(section.size) ? section.size : 'normal';
  const type = section.type === 'image' ? 'image' : 'text';
  return {
    enabled: section.enabled !== false,
    type,
    align,
    size,
    content: type === 'image'
      ? (normalizeLogo(section.content) || '')
      : String(section.content || '').slice(0, PRINTER_WIDTH),
  };
}

function normalizeSections(sections) {
  if (!Array.isArray(sections)) return [];
  return sections.map(normalizeSection).filter(Boolean);
}

/**
 * Normalize printer config from request.
 * @param {Object} c - raw config
 * @returns {Object}
 */
function normalizeConfig(c = {}) {
  const n = (v, def) => (v === undefined || v === null ? def : v);
  const num = (v, def) => {
    const x = parseInt(v, 10);
    return Number.isNaN(x) ? (def !== undefined ? def : 0) : Math.max(0, x);
  };
  return {
    bottomMargin: num(c.bottomMargin, DEFAULTS.bottomMargin),
    topMargin: num(c.topMargin, DEFAULTS.topMargin),
    leftMargin: num(c.leftMargin, DEFAULTS.leftMargin),
    rightMargin: num(c.rightMargin, DEFAULTS.rightMargin),
    logo: normalizeLogo(c.logo) || DEFAULTS.logo,
    showItemNumber: Boolean(c.showItemNumber !== undefined ? c.showItemNumber : DEFAULTS.showItemNumber),
    showItemName: Boolean(c.showItemName !== undefined ? c.showItemName : DEFAULTS.showItemName),
    showItemPrice: Boolean(c.showItemPrice !== undefined ? c.showItemPrice : DEFAULTS.showItemPrice),
    showItemQuantity: Boolean(c.showItemQuantity !== undefined ? c.showItemQuantity : DEFAULTS.showItemQuantity),
    showItemTotal: Boolean(c.showItemTotal !== undefined ? c.showItemTotal : DEFAULTS.showItemTotal),
    showLogo: Boolean(c.showLogo !== undefined ? c.showLogo : DEFAULTS.showLogo),
    showVatNumber: Boolean(c.showVatNumber !== undefined ? c.showVatNumber : DEFAULTS.showVatNumber),
    vatName: String(n(c.vatName, DEFAULTS.vatName) || 'VAT'),
    vatNumber: String(n(c.vatNumber, DEFAULTS.vatNumber)),
    currencySymbol: String(n(c.currencySymbol, DEFAULTS.currencySymbol) || '$'),
    headerSections: normalizeSections(c.headerSections),
    footerSections: normalizeSections(c.footerSections),
  };
}

function padRight(str, len) {
  str = String(str);
  return str.length >= len ? str.slice(0, len) : str + ' '.repeat(len - str.length);
}

function padLeft(str, len) {
  str = String(str);
  return str.length >= len ? str.slice(0, len) : ' '.repeat(len - str.length) + str;
}

function padAlign(text, align, width = PRINTER_WIDTH) {
  const str = String(text || '').slice(0, width);
  if (align === 'right') return padLeft(str, width);
  if (align === 'center') {
    const pad = Math.max(0, width - str.length);
    const left = Math.floor(pad / 2);
    return ' '.repeat(left) + str + ' '.repeat(pad - left);
  }
  return padRight(str, width);
}

function resetTextSize(printer) {
  printer.buffer.write('\x1d\x21\x00');
  printer.align('lt');
  printer.style('normal');
}

function applyTextSize(printer, size) {
  const dims = TEXT_SIZE_MAP[size] || TEXT_SIZE_MAP.normal;
  printer.size(dims[0], dims[1]);
}

function escposAlign(align) {
  if (align === 'right') return 'rt';
  if (align === 'center') return 'ct';
  return 'lt';
}

/**
 * Format amount as currency string (e.g. "$12.34").
 * @param {number} amount
 * @param {string} symbol - default '$'
 * @returns {string}
 */
function formatMoney(amount, symbol) {
  const s = symbol != null ? symbol : '$';
  return s + Number(amount || 0).toFixed(0);
}

/**
 * Print one line: label left, value right using fixed-width padding.
 * @param {Object} printer - escpos Printer
 * @param {string} left
 * @param {string} right
 * @param {{ size?: [number,number] }} opts
 */
function printLineLeftRight(printer, left, right, opts) {
  const size = (opts && opts.size) || [1, 1];
  const [w, h] = size;
  if (w !== 1 || h !== 1) {
    applyTextSize(printer, w === 2 && h === 2 ? 'large' : 'medium');
  }
  const half = Math.floor(PRINTER_WIDTH / 2);
  const leftStr = padRight(String(left || '').slice(0, half), half);
  const rightStr = padLeft(String(right || '').slice(0, half), half);
  printer.align('lt').text(leftStr + rightStr);
  if (w !== 1 || h !== 1) resetTextSize(printer);
}

function printAlignedText(printer, text, align, opts) {
  const style = opts && opts.style;
  const size = opts && opts.size;
  if (size) applyTextSize(printer, size);
  if (style === 'bold') printer.style('b');
  else if (style === 'bold-underline') printer.style('bu');
  printer.align('lt').text(padAlign(text, align || 'center'));
  resetTextSize(printer);
}

function printCenteredText(printer, text, opts) {
  printAlignedText(printer, text, 'center', opts);
}

/**
 * Apply top margin (feed) and left/right margin commands. Bottom is applied via feedBottomMargin before cut.
 * @param {Object} printer - escpos Printer
 * @param {Object} config - normalized config
 */
function applyMargins(printer, config) {
  const top = Math.max(0, config.topMargin || 0);
  if (top > 0) printer.feed(top);
  const left = Math.max(0, config.leftMargin || 0);
  if (left > 0) printer.marginLeft(Math.min(255, left));
  const right = Math.max(0, config.rightMargin || 0);
  if (right > 0) printer.marginRight(Math.min(255, right));
}

/**
 * Print image from base64 or data URI.
 * @param {Object} printer - escpos Printer
 * @param {string} logo - base64 string, or data:image/...;base64,...
 * @param {{ align?: string }} opts
 * @returns {Promise<void>}
 */
function printLogo(printer, logo, opts) {
  if (!logo || typeof logo !== 'string' || logo.trim() === '') {
    return Promise.resolve();
  }

  const align = (opts && opts.align) || 'center';
  let mime = 'image/png';
  let b64 = logo.trim();

  const dataUri = /^data:([^;]+);base64,(.+)$/i.exec(b64);
  if (dataUri) {
    mime = (dataUri[1] || 'image/png').toLowerCase();
    b64 = dataUri[2];
  }

  return new Promise((resolve) => {
    let buf;
    try {
      buf = Buffer.from(b64, 'base64');
    } catch (e) {
      return resolve();
    }
    if (buf.length === 0) return resolve();

    Image.load(buf, mime, (...cbArgs) => {
      const hasErrStyle = cbArgs.length >= 2;
      const loadErr = hasErrStyle ? cbArgs[0] : null;
      const img = hasErrStyle ? cbArgs[1] : cbArgs[0];
      if (loadErr || !img) return resolve();
      (async () => {
        try {
          printer.align(escposAlign(align));
          await printer.image(img, 's24');
        } catch (e) {
          // ignore
        }
        resetTextSize(printer);
        resolve();
      })();
    });
  });
}

/**
 * Print VAT line when showVatNumber is true.
 * @param {Object} printer - escpos Printer
 * @param {Object} config - normalized config
 */
function printVatLine(printer, config) {
  if (!config.showVatNumber || !config.vatNumber) return;
  printCenteredText(printer, `${config.vatName}: ${config.vatNumber}`);
}

/**
 * Feed before cut for bottom margin.
 * @param {Object} printer - escpos Printer
 * @param {Object} config - normalized config
 */
function feedBottomMargin(printer, config) {
  const n = Math.max(0, config.bottomMargin || 0);
  if (n > 0) printer.feed(n);
}

/**
 * Print configured receipt sections (text or image).
 * @param {Object} printer
 * @param {Array} sections
 * @returns {Promise<void>}
 */
function printSections(printer, sections) {
  const list = normalizeSections(sections).filter((section) => section.enabled);
  let chain = Promise.resolve();

  list.forEach((section) => {
    chain = chain.then(() => {
      if (section.type === 'image' && section.content) {
        return printLogo(printer, section.content, { align: section.align });
      }
      if (section.type === 'text' && section.content) {
        resetTextSize(printer);
        applyTextSize(printer, section.size);
        printer.align('lt').text(padAlign(section.content, section.align));
        resetTextSize(printer);
      }
      return Promise.resolve();
    });
  });

  return chain;
}

/**
 * Build receipt header: margins, logo (if showLogo), header sections.
 * @param {Object} printer - escpos Printer
 * @param {Object} config - normalized config
 * @returns {Promise<void>}
 */
function printReceiptHeader(printer, config) {
  applyMargins(printer, config);
  resetTextSize(printer);
  const logoPromise = config.showLogo && config.logo
    ? printLogo(printer, config.logo, { align: 'center' })
    : Promise.resolve();
  return logoPromise.then(() => printSections(printer, config.headerSections || []));
}

/**
 * Print footer sections from config.
 * @param {Object} printer
 * @param {Object} config
 * @returns {Promise<void>}
 */
function printFooterSections(printer, config) {
  return printSections(printer, config.footerSections || []);
}

/**
 * Format a single item line for text() based on config flags.
 * Used by kitchen-print, where we print a simple text line instead of tableCustom.
 * @param {Object} item - { name, qty, price, total? }
 * @param {Object} config - normalized config
 * @returns {string}
 */
function formatItemLine(item, config) {
  const name = (item.name || item.title || '').slice(0, 28);
  const qty = item.qty != null ? item.qty : 1;
  const price = item.price != null ? Number(item.price) : 0;
  const total = item.total != null ? Number(item.total) : price * qty;
  const dp = typeof config.decimal_place === 'number' ? config.decimal_place : 0;

  const parts = [];
  if (config.showItemName !== false) parts.push(name);
  if (config.showItemQuantity) parts.push(`x${qty}`);
  if (config.showItemPrice) parts.push(price.toFixed(dp));
  if (config.showItemTotal) parts.push(total.toFixed(dp));
  return parts.join('  ');
}

/**
 * Build left/right strings for one item line (for printLineLeftRight so total stays on one line).
 * @param {Object} item - { name, qty, price, total?, modifierLines? }
 * @param {Object} config - normalized config
 * @returns {{ left: string, right: string }}
 */
function getItemLineLeftRight(item, config) {
  const name = (item.name || item.title || '').slice(0, 18);
  const qty = item.qty != null ? item.qty : 1;
  const price = item.price != null ? Number(item.price) : 0;
  const lineTotal = item.total != null ? Number(item.total) : price * qty;
  const dp = typeof config.decimal_place === 'number' ? config.decimal_place : 0;

  const left = (config.showItemName !== false ? name : '') || '-';
  const rightParts = [];
  if (config.showItemQuantity) rightParts.push(String(qty));
  if (config.showItemPrice) rightParts.push(price.toFixed(dp));
  if (config.showItemTotal) rightParts.push(lineTotal.toFixed(dp));

  return {
    left,
    right: rightParts.join('  ') || '',
  };
}

const ITEM_COL_NAME = 22;
const ITEM_COL_QTY = 3;
const ITEM_COL_RATE = 7;
const ITEM_COL_TOTAL = 10;

/**
 * Build a single fixed-width item line string (no tableCustom, avoids leftoverSpace bug).
 * @param {Object} item - { name, qty, price, total? }
 * @param {Object} config - normalized config
 * @returns {string}
 */
function buildItemRowString(item, config) {
  const name = (item.name || item.title || '').slice(0, ITEM_COL_NAME);
  const qty = item.qty != null ? item.qty : 1;
  const price = item.price != null ? Number(item.price) : 0;
  const lineTotal = item.total != null ? Number(item.total) : price * qty;
  const dp = typeof config.decimal_place === 'number' ? config.decimal_place : 0;

  let line = '';
  if (config.showItemName !== false) line += padRight(name, ITEM_COL_NAME);
  if (config.showItemQuantity) line += padLeft(String(qty), ITEM_COL_QTY);
  if (config.showItemPrice) line += padLeft(price.toFixed(dp), ITEM_COL_RATE);
  if (config.showItemTotal) line += padLeft(lineTotal.toFixed(dp), ITEM_COL_TOTAL);
  return line || name || '-';
}

/**
 * Build the fixed-width header line string for item table.
 * @param {Object} config - normalized config
 * @returns {string}
 */
function buildItemHeaderString(config) {
  let line = '';
  if (config.showItemName !== false) line += padRight('Item', ITEM_COL_NAME);
  if (config.showItemQuantity) line += padLeft('Qty', ITEM_COL_QTY);
  if (config.showItemPrice) line += padLeft('Rate', ITEM_COL_RATE);
  if (config.showItemTotal) line += padLeft('Ttl', ITEM_COL_TOTAL);
  return line || 'Item';
}

/**
 * Print modifier sub-lines under an item (depth 0 = two spaces, +2 spaces per nesting level).
 * @param {Object} printer - escpos Printer
 * @param {Array<{ depth?: number, name: string }>} modifierLines
 */
function printModifierLines(printer, modifierLines) {
  if (!Array.isArray(modifierLines) || modifierLines.length === 0) return;
  printer.align('lt');
  modifierLines.forEach((line) => {
    if (!line || line.name == null) return;
    const depth = typeof line.depth === 'number' ? line.depth : 0;
    const indent = '  '.repeat(1 + Math.max(0, depth));
    printer.text(indent + String(line.name).trim());
  });
}

/**
 * Print one bill item line (left/right so total doesn't wrap) and modifier lines with nested indent.
 * @param {Object} printer - escpos Printer
 * @param {Object} item - { name, qty, price, total?, modifierLines? }
 * @param {Object} config - normalized config
 */
function printBillItemLine(printer, item, config) {
  const { left, right } = getItemLineLeftRight(item, config);
  printLineLeftRight(printer, left, right);
  printModifierLines(printer, item.modifierLines);
}

/**
 * Send ESC/POS cash drawer pulse (pin 2).
 * ESC p m t1 t2 — m=0 (pin 2), t1=0x19 (~25ms), t2=0xFA (~250ms).
 * @param {Object} printer - escpos Printer
 */
function sendCashDrawerPulse(printer) {
  printer.buffer.write('\x1B\x70\x00\x19\xFA');
}

module.exports = {
  normalizeConfig,
  normalizeLogo,
  normalizeSections,
  applyMargins,
  printLogo,
  printVatLine,
  feedBottomMargin,
  printReceiptHeader,
  printFooterSections,
  printSections,
  printCenteredText,
  printAlignedText,
  padAlign,
  resetTextSize,
  formatItemLine,
  getItemLineLeftRight,
  printBillItemLine,
  printModifierLines,
  buildItemRowString,
  buildItemHeaderString,
  formatMoney,
  printLineLeftRight,
  sendCashDrawerPulse,
  PRINTER_WIDTH,
};
