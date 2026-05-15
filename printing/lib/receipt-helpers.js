'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

const escpos = require('escpos');
const Image = escpos.Image;

const DEFAULTS = {
  bottomMargin: 0,
  topMargin: 0,
  leftMargin: 0,
  rightMargin: 0,
  bottomDescription: '',
  topDescription: '',
  companyAddress: '',
  companyName: '',
  logo: '',
  showBottomDescription: false,
  showCompanyAddress: false,
  showCompanyName: false,
  showItemNumber: false,
  showItemName: true,
  showItemPrice: false,
  showItemQuantity: true,
  showItemTotal: false,
  showLogo: false,
  showTopDescription: false,
  showVatNumber: false,
  vatName: 'VAT',
  vatNumber: '',
  currencySymbol: '$',
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
    bottomDescription: String(n(c.bottomDescription, DEFAULTS.bottomDescription)),
    topDescription: String(n(c.topDescription, DEFAULTS.topDescription)),
    companyAddress: String(n(c.companyAddress, DEFAULTS.companyAddress)),
    companyName: String(n(c.companyName, DEFAULTS.companyName)),
    logo: normalizeLogo(c.logo) || DEFAULTS.logo,
    showBottomDescription: Boolean(c.showBottomDescription !== undefined ? c.showBottomDescription : DEFAULTS.showBottomDescription),
    showCompanyAddress: Boolean(c.showCompanyAddress !== undefined ? c.showCompanyAddress : DEFAULTS.showCompanyAddress),
    showCompanyName: Boolean(c.showCompanyName !== undefined ? c.showCompanyName : DEFAULTS.showCompanyName),
    showItemNumber: Boolean(c.showItemNumber !== undefined ? c.showItemNumber : DEFAULTS.showItemNumber),
    showItemName: Boolean(c.showItemName !== undefined ? c.showItemName : DEFAULTS.showItemName),
    showItemPrice: Boolean(c.showItemPrice !== undefined ? c.showItemPrice : DEFAULTS.showItemPrice),
    showItemQuantity: Boolean(c.showItemQuantity !== undefined ? c.showItemQuantity : DEFAULTS.showItemQuantity),
    showItemTotal: Boolean(c.showItemTotal !== undefined ? c.showItemTotal : DEFAULTS.showItemTotal),
    showLogo: Boolean(c.showLogo !== undefined ? c.showLogo : DEFAULTS.showLogo),
    showTopDescription: Boolean(c.showTopDescription !== undefined ? c.showTopDescription : DEFAULTS.showTopDescription),
    showVatNumber: Boolean(c.showVatNumber !== undefined ? c.showVatNumber : DEFAULTS.showVatNumber),
    vatName: String(n(c.vatName, DEFAULTS.vatName) || 'VAT'),
    vatNumber: String(n(c.vatNumber, DEFAULTS.vatNumber)),
    currencySymbol: String(n(c.currencySymbol, DEFAULTS.currencySymbol) || '$'),
  };
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
 * Print one line: label left, value right. Uses tableCustom.
 * @param {Object} printer - escpos Printer
 * @param {string} left
 * @param {string} right
 * @param {{ size?: [number,number] }} opts
 */
function printLineLeftRight(printer, left, right, opts) {
  const size = (opts && opts.size) || [1, 1];
  printer.tableCustom(
    [
      { text: String(left || ''), align: 'LEFT', width: 0.5 },
      { text: String(right || ''), align: 'RIGHT', width: 0.5 },
    ],
    { size }
  );
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
 * Print logo from base64 or data URI. Loads image from buffer (get-pixels supports Buffer), then awaits printer.image() so it finishes before continuing.
 * No-op if logo is empty. Resolves on success or on skip/error.
 * @param {Object} printer - escpos Printer
 * @param {string} logo - base64 string, or data:image/...;base64,...
 * @returns {Promise<void>}
 */
function printLogo(printer, logo) {
  if (!logo || typeof logo !== 'string' || logo.trim() === '') {
    return Promise.resolve();
  }

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

    // escpos Image.load callback can be either (img) or (err, img) depending on version.
    Image.load(buf, mime, (...cbArgs) => {
      const hasErrStyle = cbArgs.length >= 2;
      const loadErr = hasErrStyle ? cbArgs[0] : null;
      const img = hasErrStyle ? cbArgs[1] : cbArgs[0];
      if (loadErr || !img) return resolve();
      (async () => {
        try {
          printer.align('ct');
          await printer.image(img, 's24');
        } catch (e) {
          // ignore
        }
        resolve();
      })();
    });
  });
}

/**
 * Print company name when showCompanyName is true.
 * @param {Object} printer - escpos Printer
 * @param {Object} config - normalized config
 */
function printCompanyName(printer, config) {
  if (!config.showCompanyName || !config.companyName) return;
  printer.align('ct').text(config.companyName);
}

/**
 * Print top description when showTopDescription is true.
 */
function printTopDescription(printer, config) {
  if (!config.showTopDescription || !config.topDescription) return;
  printer.align('ct').text(String(config.topDescription).slice(0, 48));
}

/**
 * Print company address when showCompanyAddress is true.
 */
function printCompanyAddress(printer, config) {
  if (!config.showCompanyAddress || !config.companyAddress) return;
  printer.align('ct').text(String(config.companyAddress).slice(0, 48));
}

/**
 * Print bottom description when showBottomDescription is true (called before cut).
 */
function printBottomDescription(printer, config) {
  if (!config.showBottomDescription || !config.bottomDescription) return;
  printer.align('ct').text(String(config.bottomDescription).slice(0, 48));
}

/**
 * Print VAT line when showVatNumber is true.
 * @param {Object} printer - escpos Printer
 * @param {Object} config - normalized config
 */
function printVatLine(printer, config) {
  if (!config.showVatNumber || !config.vatNumber) return;
  printer.align('ct').text(`${config.vatName}: ${config.vatNumber}`);
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
 * Build receipt header: margins, logo (if showLogo), company name, address, top description. Async when logo is present.
 * @param {Object} printer - escpos Printer
 * @param {Object} config - normalized config
 * @returns {Promise<void>}
 */
function printReceiptHeader(printer, config) {
  applyMargins(printer, config);
  // GS ! 0x00 = reset character magnification to 1x width, 1x height
  printer.buffer.write('\x1d\x21\x00');
  printer.style('normal');
  const logoPromise = config.showLogo && config.logo
    ? printLogo(printer, config.logo)
    : Promise.resolve();
  return logoPromise.then(() => {
    printCompanyName(printer, config);
    printCompanyAddress(printer, config);
    printTopDescription(printer, config);
  });
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
  const price = item.price != null ? Number(price) : 0;
  const total = item.total != null ? Number(total) : price * qty;
  const dp = typeof config.decimal_place === 'number' ? config.decimal_place : 0;

  const parts = [];
  // For the simple text line we ignore item number; that's for table layout only.
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

// Item column widths: must sum to 42 (default printer width).
const ITEM_COL_NAME = 22;
const ITEM_COL_QTY = 3;
const ITEM_COL_RATE = 7;
const ITEM_COL_TOTAL = 10;

function padRight(str, len) {
  str = String(str);
  return str.length >= len ? str.slice(0, len) : str + ' '.repeat(len - str.length);
}

function padLeft(str, len) {
  str = String(str);
  return str.length >= len ? str.slice(0, len) : ' '.repeat(len - str.length) + str;
}

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

module.exports = {
  normalizeConfig,
  normalizeLogo,
  applyMargins,
  printLogo,
  printCompanyName,
  printCompanyAddress,
  printTopDescription,
  printBottomDescription,
  printVatLine,
  feedBottomMargin,
  printReceiptHeader,
  formatItemLine,
  getItemLineLeftRight,
  printBillItemLine,
  printModifierLines,
  buildItemRowString,
  buildItemHeaderString,
  formatMoney,
  printLineLeftRight,
};
