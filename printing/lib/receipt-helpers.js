'use strict';

const escpos = require('escpos');
const Image = escpos.Image;

const PRINTER_WIDTH = 42;
const MAX_LOGO_WIDTH_PX = 320;

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
  showCurrencySymbol: true,
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
    showCurrencySymbol: c.showCurrencySymbol !== false,
    currencySymbol: c.showCurrencySymbol === false
      ? ''
      : String(n(c.currencySymbol, DEFAULTS.currencySymbol) || '$'),
    headerSections: normalizeSections(c.headerSections),
    footerSections: normalizeSections(c.footerSections),
    showInclusivePrices: Boolean(c.showInclusivePrices),
    decimal_place: c.decimal_place,
    labels: c.labels && typeof c.labels === 'object' ? c.labels : {},
    locale: typeof c.locale === 'string' && c.locale ? c.locale : 'en-US',
    timezone: resolveTimezone(c.timezone),
  };
}

/**
 * Prefer request config.timezone; else PRINT_TIMEZONE / TZ for standalone deploys.
 * @param {unknown} fromConfig
 * @returns {string|undefined}
 */
function resolveTimezone(fromConfig) {
  if (typeof fromConfig === 'string' && fromConfig.trim()) {
    return fromConfig.trim();
  }
  const fromEnv =
    (typeof process.env.PRINT_TIMEZONE === 'string' && process.env.PRINT_TIMEZONE.trim()) ||
    (typeof process.env.TZ === 'string' && process.env.TZ.trim()) ||
    '';
  return fromEnv || undefined;
}

function getEffectiveLineWidth(size) {
  const dims = TEXT_SIZE_MAP[size] || TEXT_SIZE_MAP.normal;
  return Math.max(1, Math.floor(PRINTER_WIDTH / dims[0]));
}

function padRight(str, len) {
  str = String(str);
  return str.length >= len ? str.slice(0, len) : str + ' '.repeat(len - str.length);
}

function padLeft(str, len) {
  str = String(str);
  return str.length >= len ? str.slice(0, len) : ' '.repeat(len - str.length) + str;
}

function padAlign(text, align, width, size) {
  const lineWidth = width || getEffectiveLineWidth(size || 'normal');
  const str = String(text || '').slice(0, lineWidth);
  if (align === 'right') return padLeft(str, lineWidth);
  if (align === 'center') {
    const pad = Math.max(0, lineWidth - str.length);
    const left = Math.floor(pad / 2);
    return ' '.repeat(left) + str + ' '.repeat(pad - left);
  }
  return padRight(str, lineWidth);
}

/**
 * Force a consistent left column across printers. Avoids mixing ESC/POS align
 * modes (ct/rt) with manually padded lt lines, which diverge on some firmware.
 */
function hardResetLayout(printer) {
  printer.align('lt');
  printer.buffer.write('\x1d\x21\x00');
  printer.style('normal');
  printer.marginLeft(0);
  printer.marginRight(0);
  if (typeof printer.font === 'function') {
    printer.font('A');
  }
}

function resetTextSize(printer) {
  hardResetLayout(printer);
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

function printHardwareAlignedLine(printer, text, opts) {
  const options = opts || {};
  const align = options.align || 'center';
  const size = options.size || 'normal';
  const style = options.style;
  const maxLen = getEffectiveLineWidth(size);
  const content = String(text || '').slice(0, maxLen);
  if (!content) return;
  hardResetLayout(printer);
  if (size !== 'normal') applyTextSize(printer, size);
  if (style === 'bold') printer.style('b');
  else if (style === 'bold-underline') printer.style('bu');
  printer.align(escposAlign(align)).text(content);
  hardResetLayout(printer);
}

function printFixedLine(printer, text, opts) {
  const options = opts || {};
  const align = options.align || 'left';
  const size = options.size || 'normal';
  const style = options.style;
  hardResetLayout(printer);
  if (size !== 'normal') applyTextSize(printer, size);
  if (style === 'bold') printer.style('b');
  else if (style === 'bold-underline') printer.style('bu');
  printer.align('lt').text(padAlign(text, align, null, size));
  hardResetLayout(printer);
}

function printDivider(printer) {
  hardResetLayout(printer);
  printer.align('lt').text('-'.repeat(PRINTER_WIDTH));
}

/**
 * Format amount as currency string (e.g. "$12.34").
 * @param {number} amount
 * @param {string} [symbol='$'] - empty string omits the symbol
 * @returns {string}
 */
function formatMoney(amount, symbol) {
  const num = Number(amount || 0).toFixed(0);
  const s = symbol === undefined || symbol === null ? '$' : String(symbol);
  if (!s) return num;
  return s + ' ' + num;
}

/**
 * Print one line: label left, value right using fixed-width padding.
 * @param {Object} printer - escpos Printer
 * @param {string} left
 * @param {string} right
 * @param {{ size?: [number,number] }} opts
 */
function printLineLeftRight(printer, left, right, opts) {
  const options = opts || {};
  const size = options.size || [1, 1];
  const [w, h] = size;
  const textSize = w === 2 && h === 2 ? 'large' : (w !== 1 || h !== 1 ? 'medium' : 'normal');
  hardResetLayout(printer);
  if (textSize !== 'normal') applyTextSize(printer, textSize);
  if (options.style === 'bold-underline') printer.style('bu');
  else if (options.style === 'bold') printer.style('b');
  const lineWidth = getEffectiveLineWidth(textSize);
  const half = Math.floor(lineWidth / 2);
  const leftStr = padRight(String(left || '').slice(0, half), half);
  const rightStr = padLeft(String(right || '').slice(0, half), half);
  const gap = lineWidth - half - half;
  printer.align('lt').text(leftStr + ' '.repeat(Math.max(0, gap)) + rightStr);
  hardResetLayout(printer);
}

function printAlignedText(printer, text, align, opts) {
  const options = opts || {};
  const resolvedAlign = align || 'center';
  if (resolvedAlign === 'left') {
    printFixedLine(printer, text, {
      align: 'left',
      size: options.size || 'normal',
      style: options.style,
    });
    return;
  }
  printHardwareAlignedLine(printer, text, {
    align: resolvedAlign,
    size: options.size || 'normal',
    style: options.style,
  });
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
  // Do not use GS L margin commands — they shift centered vs left-aligned
  // content differently across printer firmware. Horizontal inset is handled
  // via fixed-width padding on each line instead.
  hardResetLayout(printer);
}

/**
 * Scale logo down to fit thermal width while preserving aspect ratio.
 * @param {Buffer} buf
 * @param {string} mime
 * @returns {Promise<{ buf: Buffer, mime: string }>}
 */
function resizeLogoBuffer(buf, mime) {
  return new Promise((resolve) => {
    try {
      const { loadImage, createCanvas } = require('canvas');
      loadImage(buf).then((img) => {
        if (!img || img.width <= MAX_LOGO_WIDTH_PX) {
          return resolve({ buf, mime });
        }
        const scale = MAX_LOGO_WIDTH_PX / img.width;
        const w = MAX_LOGO_WIDTH_PX;
        const h = Math.max(1, Math.round(img.height * scale));
        const canvas = createCanvas(w, h);
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        resolve({ buf: canvas.toBuffer('image/png'), mime: 'image/png' });
      }).catch(() => resolve({ buf, mime }));
    } catch (e) {
      resolve({ buf, mime });
    }
  });
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

    resizeLogoBuffer(buf, mime).then(({ buf: resizedBuf, mime: resizedMime }) => {
      Image.load(resizedBuf, resizedMime, (...cbArgs) => {
        const hasErrStyle = cbArgs.length >= 2;
        const loadErr = hasErrStyle ? cbArgs[0] : null;
        const img = hasErrStyle ? cbArgs[1] : cbArgs[0];
        if (loadErr || !img) return resolve();
        (async () => {
          try {
            hardResetLayout(printer);
            printer.align(escposAlign(align));
            await printer.image(img, 's24');
          } catch (e) {
            // ignore
          }
          hardResetLayout(printer);
          resolve();
        })();
      });
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
        printAlignedText(printer, section.content, section.align, {
          size: section.size,
        });
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
  hardResetLayout(printer);
  const logoPromise = config.showLogo && config.logo
    ? printLogo(printer, config.logo, { align: 'center' })
    : Promise.resolve();
  return logoPromise
    .then(() => printSections(printer, config.headerSections || []))
    .then(() => hardResetLayout(printer));
}

/**
 * Print footer sections from config.
 * @param {Object} printer
 * @param {Object} config
 * @returns {Promise<void>}
 */
function printFooterSections(printer, config) {
  hardResetLayout(printer);
  return printSections(printer, config.footerSections || []).then(() => {
    hardResetLayout(printer);
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
  const L = (config && config.labels) || {};
  const item = L.item || 'Item';
  const qty = L.qty || 'Qty';
  const rate = L.rate || 'Rate';
  const ttl = L.ttl || 'Ttl';
  let line = '';
  if (config.showItemName !== false) line += padRight(item, ITEM_COL_NAME);
  if (config.showItemQuantity) line += padLeft(qty, ITEM_COL_QTY);
  if (config.showItemPrice) line += padLeft(rate, ITEM_COL_RATE);
  if (config.showItemTotal) line += padLeft(ttl, ITEM_COL_TOTAL);
  return line || item;
}

/**
 * Print modifier sub-lines under an item (depth 0 = two spaces, +2 spaces per nesting level).
 * @param {Object} printer - escpos Printer
 * @param {Array<{ depth?: number, name: string }>} modifierLines
 */
function printModifierLines(printer, modifierLines) {
  if (!Array.isArray(modifierLines) || modifierLines.length === 0) return;
  modifierLines.forEach((line) => {
    if (!line || line.name == null) return;
    const depth = typeof line.depth === 'number' ? line.depth : 0;
    const indent = '  '.repeat(1 + Math.max(0, depth));
    printFixedLine(printer, indent + String(line.name).trim(), { align: 'left' });
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

const FISCAL_LOGO_PX = 100;
const FISCAL_QR_PX = 100;
const FISCAL_QR_GAP_PX = 8;

/**
 * Decode data URI / raw base64 into a Buffer + mime.
 * @param {string} logo
 * @returns {{ buf: Buffer, mime: string } | null}
 */
function decodeImagePayload(logo) {
  if (!logo || typeof logo !== 'string' || !logo.trim()) return null;
  let mime = 'image/png';
  let b64 = logo.trim();
  const dataUri = /^data:([^;]+);base64,(.+)$/i.exec(b64);
  if (dataUri) {
    mime = (dataUri[1] || 'image/png').toLowerCase();
    b64 = dataUri[2];
  }
  try {
    const buf = Buffer.from(b64, 'base64');
    if (!buf.length) return null;
    return { buf, mime };
  } catch {
    return null;
  }
}

/**
 * Draw source image into a white square (contain fit, centered).
 * @param {import('canvas').CanvasRenderingContext2D} ctx
 * @param {import('canvas').Image} img
 * @param {number} x
 * @param {number} y
 * @param {number} size
 */
function drawContainInSquare(ctx, img, x, y, size) {
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(x, y, size, size);
  if (!img || !img.width || !img.height) return;
  const scale = Math.min(size / img.width, size / img.height);
  const w = Math.max(1, Math.round(img.width * scale));
  const h = Math.max(1, Math.round(img.height * scale));
  const dx = x + Math.floor((size - w) / 2);
  const dy = y + Math.floor((size - h) / 2);
  ctx.drawImage(img, dx, dy, w, h);
}

/**
 * Build PNG buffer: optional 100×100 logo + 100×100 QR side by side.
 * Forces high-contrast mono so light brand colors still burn on thermal paper.
 * @param {string} qrValue
 * @param {string} [logoDataUri]
 * @returns {Promise<Buffer|null>}
 */
function composeFiscalQrRowBuffer(qrValue, logoDataUri) {
  return new Promise((resolve) => {
    try {
      const qr = require('qr-image');
      const { loadImage, createCanvas } = require('canvas');

      // High-res QR matrix; we scale into 100×100 on canvas.
      const qrPng = qr.imageSync(String(qrValue), { type: 'png', size: 4, margin: 1 });

      const hasLogo = Boolean(logoDataUri && String(logoDataUri).trim());
      const width = hasLogo
        ? FISCAL_LOGO_PX + FISCAL_QR_GAP_PX + FISCAL_QR_PX
        : FISCAL_QR_PX;
      const height = Math.max(FISCAL_LOGO_PX, FISCAL_QR_PX);
      const canvas = createCanvas(width, height);
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, width, height);

      /** Thermal printers need near B/W — raise contrast for soft brand colors. */
      const forceMono = () => {
        const imageData = ctx.getImageData(0, 0, width, height);
        const d = imageData.data;
        for (let i = 0; i < d.length; i += 4) {
          const a = d[i + 3];
          if (a < 16) {
            d[i] = 255;
            d[i + 1] = 255;
            d[i + 2] = 255;
            d[i + 3] = 255;
            continue;
          }
          const lum = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
          // Ink if clearly darker than paper (threshold high enough for light greys/pinks)
          const ink = lum < 220;
          const v = ink ? 0 : 255;
          d[i] = v;
          d[i + 1] = v;
          d[i + 2] = v;
          d[i + 3] = 255;
        }
        ctx.putImageData(imageData, 0, 0);
      };

      const finish = (logoImg) => {
        loadImage(qrPng)
          .then((qrImg) => {
            if (hasLogo) {
              if (logoImg) {
                drawContainInSquare(ctx, logoImg, 0, 0, FISCAL_LOGO_PX);
              } else {
                // Visible empty box so missing logo is obvious in tests (and not silent white)
                ctx.strokeStyle = '#000000';
                ctx.lineWidth = 2;
                ctx.strokeRect(1, 1, FISCAL_LOGO_PX - 2, FISCAL_LOGO_PX - 2);
              }
              drawContainInSquare(
                ctx,
                qrImg,
                FISCAL_LOGO_PX + FISCAL_QR_GAP_PX,
                0,
                FISCAL_QR_PX
              );
            } else {
              drawContainInSquare(ctx, qrImg, 0, 0, FISCAL_QR_PX);
            }
            forceMono();
            resolve(canvas.toBuffer('image/png'));
          })
          .catch((err) => {
            console.warn('[print] fiscal QR canvas load failed', err && err.message);
            resolve(null);
          });
      };

      if (!hasLogo) {
        finish(null);
        return;
      }

      // Prefer data-URI path; canvas handles it better than a raw buffer for large PNGs
      const raw = String(logoDataUri).trim();
      const loadPromise = raw.startsWith('data:')
        ? loadImage(raw)
        : (() => {
            const decoded = decodeImagePayload(raw);
            if (!decoded) return Promise.reject(new Error('invalid logo payload'));
            return loadImage(decoded.buf);
          })();

      loadPromise
        .then((img) => finish(img))
        .catch((err) => {
          console.warn('[print] fiscal logo load failed', err && err.message);
          finish(null);
        });
    } catch (e) {
      console.warn('[print] fiscal QR compose error', e && e.message);
      resolve(null);
    }
  });
}

/**
 * Print a buffer via escpos Image.
 * Prefer GS v 0 raster (same as qrimage) — more reliable than bit-image s24 on many network printers.
 * @param {Object} printer
 * @param {Buffer} buf
 * @param {string} [mime='image/png']
 * @param {string} [align='center']
 * @returns {Promise<boolean>} true if image commands were buffered
 */
function printImageBuffer(printer, buf, mime, align) {
  if (!buf || !buf.length) return Promise.resolve(false);
  return new Promise((resolve) => {
    Image.load(buf, mime || 'image/png', (errOrImg, maybeImg) => {
      // get-pixels: callback(err) OR callback(null is not used) — escpos Image.load does callback(err) or callback(image)
      const img = errOrImg instanceof Error || (errOrImg && errOrImg.message && !errOrImg.pixels)
        ? null
        : errOrImg && errOrImg.pixels
          ? errOrImg
          : maybeImg;
      const loadErr =
        errOrImg instanceof Error
          ? errOrImg
          : !img
            ? new Error('Image.load returned empty')
            : null;
      if (loadErr || !img) {
        console.warn('[print] Image.load failed', loadErr && loadErr.message);
        return resolve(false);
      }
      try {
        hardResetLayout(printer);
        printer.align(escposAlign(align || 'center'));
        // Raster is used by escpos.qrimage and is most compatible for full-width strips
        if (typeof printer.raster === 'function') {
          printer.raster(img, 'normal');
        } else {
          // fire-and-forget async image — still buffer-writes sync before first await
          void printer.image(img, 's24');
        }
        hardResetLayout(printer);
        resolve(true);
      } catch (e) {
        console.warn('[print] image/raster failed', e && e.message);
        hardResetLayout(printer);
        resolve(false);
      }
    });
  });
}

/**
 * Fiscal QR row: logo | QR at 100×100 each when logo present; else QR-only 100×100.
 * Falls back to false so caller can use native qrimage/qrcode.
 * @param {Object} printer
 * @param {string} qrValue
 * @param {string} [logoDataUri]
 * @returns {Promise<boolean>} true if printed
 */
function printFiscalQrRow(printer, qrValue, logoDataUri) {
  if (!qrValue) return Promise.resolve(false);
  return composeFiscalQrRowBuffer(qrValue, logoDataUri).then((buf) => {
    if (!buf) return false;
    return printImageBuffer(printer, buf, 'image/png', 'center');
  });
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
  hardResetLayout,
  printFixedLine,
  printDivider,
  getEffectiveLineWidth,
  formatItemLine,
  getItemLineLeftRight,
  printBillItemLine,
  printModifierLines,
  buildItemRowString,
  buildItemHeaderString,
  formatMoney,
  printLineLeftRight,
  sendCashDrawerPulse,
  printFiscalQrRow,
  composeFiscalQrRowBuffer,
  PRINTER_WIDTH,
};
