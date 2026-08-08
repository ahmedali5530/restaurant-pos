'use strict';

const escpos = require('escpos');
const Image = escpos.Image;

const PRINTER_WIDTH = 42;
/**
 * Printable bit-image width for ESC $ horizontal positioning (80mm @ ~180–203 dpi).
 * 58mm printers typically clamp positions past ~384; centering a 150px logo still lands correctly.
 */
const PAPER_IMAGE_WIDTH_PX = 576;
/** Max content width when scaling full-bleed images (safe for 58mm). */
const MAX_IMAGE_WIDTH_PX = 384;
/** Store logo + header/footer + provider logos: fixed contain box (no stretch). */
const STORE_LOGO_BOX_PX = 150;
/** @deprecated use MAX_IMAGE_WIDTH_PX */
const MAX_LOGO_WIDTH_PX = MAX_IMAGE_WIDTH_PX;

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
 * Detect image MIME from magic bytes.
 * @param {Buffer} buf
 * @returns {string}
 */
function detectImageMime(buf) {
  if (!buf || !buf.length) return 'image/png';
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'image/png';
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) return 'image/gif';
  if (
    buf.length >= 12 &&
    buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 &&
    buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50
  ) {
    return 'image/webp';
  }
  return 'image/png';
}

/**
 * Coerce Surreal / JSON byte shapes into a Buffer.
 * Handles Buffer, TypedArray, ArrayBuffer, number[], { type:'Buffer', data:[] }, numeric-key objects.
 * @param {*} input
 * @returns {Buffer|null}
 */
function coerceToImageBuffer(input) {
  if (input == null || input === '') return null;
  if (Buffer.isBuffer(input)) return input.length ? input : null;
  if (input instanceof Uint8Array) return input.length ? Buffer.from(input) : null;
  if (input instanceof ArrayBuffer) return input.byteLength ? Buffer.from(input) : null;
  if (Array.isArray(input)) {
    if (!input.length) return null;
    if (typeof input[0] === 'number') return Buffer.from(input);
    return null;
  }
  if (typeof input === 'object') {
    if (Array.isArray(input.data) && (input.type === 'Buffer' || input.type === 'buffer')) {
      return input.data.length ? Buffer.from(input.data) : null;
    }
    const keys = Object.keys(input);
    if (
      keys.length > 0 &&
      keys.every((k) => /^\d+$/.test(k)) &&
      keys.every((k) => typeof input[k] === 'number')
    ) {
      const arr = keys
        .map((k) => Number(k))
        .sort((a, b) => a - b)
        .map((k) => input[k]);
      return arr.length ? Buffer.from(arr) : null;
    }
  }
  return null;
}

/**
 * Decode data URI / base64 / Buffer / byte array into Buffer + mime.
 * @param {*} input
 * @returns {{ buf: Buffer, mime: string } | null}
 */
function decodeImageInput(input) {
  if (input == null || input === '') return null;

  const coerced = coerceToImageBuffer(input);
  if (coerced) {
    return { buf: coerced, mime: detectImageMime(coerced) };
  }

  if (typeof input !== 'string') return null;
  let mime = 'image/png';
  let b64 = input.trim();
  if (!b64) return null;

  const dataUri = /^data:([^;]+);base64,([\s\S]+)$/i.exec(b64);
  if (dataUri) {
    mime = (dataUri[1] || 'image/png').toLowerCase().split(';')[0].trim() || 'image/png';
    b64 = dataUri[2].replace(/\s+/g, '');
  } else {
    b64 = b64.replace(/\s+/g, '');
  }

  try {
    const buf = Buffer.from(b64, 'base64');
    if (!buf.length) return null;
    // Prefer magic bytes over claimed data-URI mime (JPEG often labeled as PNG)
    return { buf, mime: detectImageMime(buf) || mime };
  } catch {
    return null;
  }
}

/**
 * Normalize logo to a base64 or data URI string. Handles array (from DB), string, or buffer-like.
 * @param {*} logo
 * @returns {string}
 */
function normalizeLogo(logo) {
  if (logo == null || logo === '') return '';
  if (typeof logo === 'string') return logo.trim();
  const decoded = decodeImageInput(logo);
  if (!decoded) return '';
  return `data:${decoded.mime};base64,${decoded.buf.toString('base64')}`;
}

function normalizeSection(section) {
  if (!section || typeof section !== 'object') return null;
  const align = ['left', 'center', 'right'].includes(section.align) ? section.align : 'center';
  const size = ['normal', 'medium', 'large'].includes(section.size) ? section.size : 'normal';
  const type = section.type === 'image' ? 'image' : 'text';
  let content;
  if (type === 'image') {
    content = normalizeLogo(section.content) || '';
    if (section.enabled !== false && section.content && !content) {
      console.warn('[print] image section content empty after normalize');
    }
  } else {
    content = String(section.content || '').slice(0, PRINTER_WIDTH);
  }
  return {
    enabled: section.enabled !== false,
    type,
    align,
    size,
    content,
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
 * Resize/re-encode image for thermal.
 * - boxSize: tight N×N contain square (no stretch). Horizontal center is done at print via ESC $.
 * - maxWidth only: scale preserving aspect, pad width to multiple of 8
 * Always returns PNG so get-pixels / escpos Image.load get a consistent format.
 * @param {Buffer} buf
 * @param {string} [mime]
 * @param {{ maxWidth?: number, forceMono?: boolean, boxSize?: number, paperWidth?: number, hAlign?: string }} [opts]
 * @returns {Promise<Buffer|null>}
 */
function prepareImageForPrint(buf, mime, opts) {
  const options = opts || {};
  const maxWidth = Math.max(8, options.maxWidth || MAX_IMAGE_WIDTH_PX);
  const forceMono = options.forceMono !== false;
  const boxSize = options.boxSize != null ? Math.max(8, Number(options.boxSize) || 0) : 0;
  const hAlign = options.hAlign === 'left' || options.hAlign === 'right' ? options.hAlign : 'center';

  return new Promise((resolve) => {
    try {
      const { loadImage, createCanvas } = require('canvas');
      loadImage(buf)
        .then((img) => {
          if (!img || !img.width || !img.height) {
            resolve(null);
            return;
          }

          if (boxSize > 0) {
            // Tight square only — padding left/right white on a full paper canvas left-aligns
            // on 80mm printers (paper wider than 384). Centering is applyAbsoluteHorizontalPosition.
            const side = Math.max(8, Math.ceil(boxSize / 8) * 8);
            const canvas = createCanvas(side, side);
            const ctx = canvas.getContext('2d');
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, side, side);
            drawContainInSquare(ctx, img, 0, 0, side);
            if (forceMono) forceCanvasMono(ctx, side, side);
            resolve(canvas.toBuffer('image/png'));
            return;
          }

          let outW = img.width;
          let outH = img.height;
          if (outW > maxWidth) {
            const scale = maxWidth / outW;
            outW = maxWidth;
            outH = Math.max(1, Math.round(img.height * scale));
          }
          const canvasW = Math.max(8, Math.ceil(outW / 8) * 8);
          const canvas = createCanvas(canvasW, outH);
          const ctx = canvas.getContext('2d');
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, canvasW, outH);
          // Image starts at left of its own canvas; print time ESC $ does centering
          let dx = 0;
          if (hAlign === 'center') dx = Math.floor((canvasW - outW) / 2);
          else if (hAlign === 'right') dx = canvasW - outW;
          ctx.drawImage(img, dx, 0, outW, outH);
          if (forceMono) forceCanvasMono(ctx, canvasW, outH);
          resolve(canvas.toBuffer('image/png'));
        })
        .catch((err) => {
          console.warn('[print] prepareImageForPrint load failed', err && err.message);
          resolve(null);
        });
    } catch (e) {
      console.warn('[print] prepareImageForPrint error', e && e.message);
      resolve(null);
    }
  });
}

/**
 * Print store / header / footer image: 150×150 contain, paper-padded, D24.
 * @param {Object} printer - escpos Printer
 * @param {*} logo
 * @param {{ align?: string, hAlign?: string }} opts
 * @returns {Promise<void>}
 */
function printLogo(printer, logo, opts) {
  const options = opts || {};
  const hAlign = options.hAlign || options.align || 'center';
  return printEscposImage(printer, logo, {
    boxSize: STORE_LOGO_BOX_PX,
    paperWidth: PAPER_IMAGE_WIDTH_PX,
    hAlign,
    align: 'lt',
    forceMono: true,
  }).then((ok) => {
    if (ok) {
      try {
        hardResetLayout(printer);
        if (typeof printer.feed === 'function') printer.feed(1);
      } catch (e) {
        // ignore
      }
    } else {
      console.warn('[print] printLogo failed');
    }
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
 * Format current print time like the final bill footer (app timezone + locale).
 * @param {Object} [config]
 * @returns {string}
 */
function formatPrintingTimestamp(config) {
  const cfg = config || {};
  const now = new Date();
  const locale = cfg.locale || 'en-US';
  const formatOpts = {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  };
  if (cfg.timezone) formatOpts.timeZone = cfg.timezone;
  try {
    return now.toLocaleString(locale, formatOpts);
  } catch (e) {
    try {
      return now.toLocaleString('en-US', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      });
    } catch (e2) {
      return now.toISOString();
    }
  }
}

/**
 * Centered print timestamp at bottom of receipts (matches final bill).
 * @param {Object} printer
 * @param {Object} [config]
 */
function printPrintingTimestamp(printer, config) {
  const ts = formatPrintingTimestamp(config);
  if (!ts) return;
  try {
    if (typeof printer.feed === 'function') printer.feed(2);
  } catch (e) {
    // ignore
  }
  printCenteredText(printer, ts);
  try {
    if (typeof printer.feed === 'function') printer.feed(2);
  } catch (e) {
    // ignore
  }
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
      if (section.type === 'image') {
        if (!section.content) {
          console.warn('[print] skipping empty image section');
          return Promise.resolve();
        }
        // Same pipeline as store logo: 150×150 contain + paper pad + feed after
        return printLogo(printer, section.content, { align: section.align, hAlign: section.align });
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

const FISCAL_LOGO_PX = STORE_LOGO_BOX_PX;
const FISCAL_QR_PX = 150;
const FISCAL_QR_GAP_PX = 12;
/** Target total strip width (≈58mm @ ~203dpi). Padded so GS v0 / bitmaps centre better. */
const FISCAL_STRIP_WIDTH_PX = PAPER_IMAGE_WIDTH_PX;

/**
 * Decode data URI / raw base64 into a Buffer + mime.
 * @param {*} logo
 * @returns {{ buf: Buffer, mime: string } | null}
 */
function decodeImagePayload(logo) {
  return decodeImageInput(logo);
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

/** Force pure B/W for thermal thresholding. */
function forceCanvasMono(ctx, width, height) {
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
    const v = lum < 210 ? 0 : 255;
    d[i] = v;
    d[i + 1] = v;
    d[i + 2] = v;
    d[i + 3] = 255;
  }
  ctx.putImageData(imageData, 0, 0);
}

/**
 * Build PNG buffer: optional logo + QR side by side, padded to strip width.
 * @param {string} qrValue
 * @param {string} [logoDataUri]
 * @returns {Promise<Buffer|null>}
 */
function composeFiscalQrRowBuffer(qrValue, logoDataUri) {
  return new Promise((resolve) => {
    try {
      const qr = require('qr-image');
      const { loadImage, createCanvas } = require('canvas');

      const qrPng = qr.imageSync(String(qrValue), { type: 'png', size: 6, margin: 1 });
      const hasLogo = Boolean(logoDataUri && String(logoDataUri).trim());

      const contentW = hasLogo
        ? FISCAL_LOGO_PX + FISCAL_QR_GAP_PX + FISCAL_QR_PX
        : FISCAL_QR_PX;
      const height = Math.max(FISCAL_LOGO_PX, FISCAL_QR_PX);
      // Width as multiple of 8 for clean raster packing
      const width = Math.max(
        contentW,
        Math.ceil(FISCAL_STRIP_WIDTH_PX / 8) * 8
      );
      const offsetX = Math.floor((width - contentW) / 2);

      const canvas = createCanvas(width, height);
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, width, height);

      const finish = (logoImg) => {
        loadImage(qrPng)
          .then((qrImg) => {
            if (hasLogo) {
              if (logoImg) {
                drawContainInSquare(ctx, logoImg, offsetX, 0, FISCAL_LOGO_PX);
              } else {
                ctx.strokeStyle = '#000000';
                ctx.lineWidth = 3;
                ctx.strokeRect(offsetX + 2, 2, FISCAL_LOGO_PX - 4, FISCAL_LOGO_PX - 4);
              }
              drawContainInSquare(
                ctx,
                qrImg,
                offsetX + FISCAL_LOGO_PX + FISCAL_QR_GAP_PX,
                0,
                FISCAL_QR_PX
              );
            } else {
              drawContainInSquare(ctx, qrImg, offsetX, 0, FISCAL_QR_PX);
            }
            forceCanvasMono(ctx, width, height);
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

      const raw = String(logoDataUri).trim();
      let loadPromise;
      if (raw.startsWith('data:')) {
        const m = /^data:([^;]+);base64,([\s\S]+)$/i.exec(raw);
        if (m) {
          const cleaned = `data:${m[1]};base64,${m[2].replace(/\s+/g, '')}`;
          loadPromise = loadImage(cleaned);
        } else {
          loadPromise = loadImage(raw);
        }
      } else {
        const decoded = decodeImageInput(raw);
        if (!decoded) {
          console.warn('[print] fiscal logo decode failed');
          finish(null);
          return;
        }
        loadPromise = loadImage(decoded.buf);
      }

      loadPromise
        .then((img) => finish(img))
        .catch((err) => {
          console.warn('[print] fiscal logo load failed', err && err.message);
          const decoded = decodeImageInput(raw);
          if (!decoded) {
            finish(null);
            return;
          }
          loadImage(decoded.buf)
            .then((img) => finish(img))
            .catch(() => finish(null));
        });
    } catch (e) {
      console.warn('[print] fiscal QR compose error', e && e.message);
      resolve(null);
    }
  });
}

/**
 * ESC $ nL nH — absolute horizontal print position (in dots).
 * Required so bit-images can sit in the center of the paper (ESC a does not move graphics on most firmware).
 * @param {Object} printer
 * @param {number} dots
 */
function setAbsoluteHorizontalPosition(printer, dots) {
  const n = Math.max(0, Math.min(65535, Math.floor(Number(dots) || 0)));
  try {
    printer.buffer.write('\x1b\x24');
    printer.buffer.writeUInt16LE(n);
  } catch (e) {
    // ignore
  }
}

/**
 * Synchronous ESC * d24 bit-image write (double density, correct aspect ratio).
 * m=33 = 24-dot double density (~180 dpi H and V). m=32 (s24) is single density
 * horizontally (~90 dpi) and stretches images ~2× wide.
 * Horizontally centers (or left/right) via ESC $ on each strip — bitmaps always start
 * at the current print head position, and white canvas padding alone is wrong for 80mm paper.
 * @param {Object} printer
 * @param {Object} image - escpos Image instance
 * @param {{ paperWidth?: number, hAlign?: string }} [opts]
 */
function writeBitmapD24(printer, image, opts) {
  const options = opts || {};
  const paperWidth = Math.max(8, options.paperWidth || PAPER_IMAGE_WIDTH_PX);
  const hAlign = options.hAlign === 'left' || options.hAlign === 'right' ? options.hAlign : 'center';
  const imgW = image && image.size && image.size.width ? image.size.width : 0;
  let offset = 0;
  if (imgW > 0 && paperWidth > imgW) {
    if (hAlign === 'center') offset = Math.floor((paperWidth - imgW) / 2);
    else if (hAlign === 'right') offset = paperWidth - imgW;
  }

  const header = '\x1b\x2a\x21'; // ESC * 33 (24-dot double density)
  const n = 3;
  const bitmap = image.toBitmap(24);
  try {
    if (typeof printer.lineSpace === 'function') printer.lineSpace(0);
  } catch (e) {
    // ignore
  }
  bitmap.data.forEach((line) => {
    // Re-position every band — LF returns head to left margin
    if (offset > 0) setAbsoluteHorizontalPosition(printer, offset);
    printer.buffer.write(header);
    printer.buffer.writeUInt16LE(line.length / n);
    printer.buffer.write(line);
    printer.buffer.write('\n');
  });
  setAbsoluteHorizontalPosition(printer, 0);
  try {
    if (typeof printer.lineSpace === 'function') printer.lineSpace();
  } catch (e) {
    // ignore
  }
}

/** @deprecated use writeBitmapD24 */
function writeBitmapS24(printer, image) {
  return writeBitmapD24(printer, image);
}

/**
 * Load PNG buffer into escpos Image.
 * @param {Buffer} buf
 * @param {string} mime
 * @returns {Promise<Object|null>}
 */
function loadEscposImage(buf, mime) {
  return new Promise((resolve) => {
    Image.load(buf, mime || 'image/png', (arg0, arg1) => {
      if (!arg0) {
        resolve(null);
        return;
      }
      if (arg0 instanceof Error) {
        console.warn('[print] Image.load error', arg0.message);
        resolve(null);
        return;
      }
      if (arg0.pixels) {
        resolve(arg0);
        return;
      }
      if (arg1 && arg1.pixels) {
        resolve(arg1);
        return;
      }
      resolve(null);
    });
  });
}

/**
 * Unified ESC/POS image print: decode → prepare → D24 bit-image (raster fallback).
 * @param {Object} printer
 * @param {*} input - data URI, base64, Buffer, byte array
 * @param {{ align?: string, maxWidth?: number, forceMono?: boolean, mime?: string, skipPrepare?: boolean, boxSize?: number, paperWidth?: number, hAlign?: string }} [opts]
 * @returns {Promise<boolean>}
 */
async function printEscposImage(printer, input, opts) {
  const options = opts || {};
  if (input == null || input === '') return false;

  let buf;
  let mime = options.mime || 'image/png';

  if (Buffer.isBuffer(input)) {
    buf = input;
    mime = options.mime || detectImageMime(input);
  } else {
    const decoded = decodeImageInput(input);
    if (!decoded) {
      console.warn('[print] printEscposImage: decode failed');
      return false;
    }
    buf = decoded.buf;
    mime = decoded.mime;
  }

  let pngBuf = buf;
  if (!options.skipPrepare) {
    pngBuf = await prepareImageForPrint(buf, mime, {
      maxWidth: options.maxWidth || MAX_IMAGE_WIDTH_PX,
      forceMono: options.forceMono !== false,
      boxSize: options.boxSize,
      paperWidth: options.paperWidth || PAPER_IMAGE_WIDTH_PX,
      hAlign: options.hAlign || 'center',
    });
    if (!pngBuf || !pngBuf.length) {
      console.warn('[print] printEscposImage: prepare failed');
      return false;
    }
  }

  const img = await loadEscposImage(pngBuf, 'image/png');
  if (!img) {
    console.warn('[print] printEscposImage: Image.load failed');
    return false;
  }

  const align = options.align || 'center';
  try {
    hardResetLayout(printer);
    printer.align(escposAlign(align));

    let wrote = false;
    try {
      writeBitmapD24(printer, img, {
        paperWidth: options.paperWidth || PAPER_IMAGE_WIDTH_PX,
        hAlign: options.hAlign || 'center',
      });
      wrote = true;
    } catch (e) {
      console.warn('[print] D24 bitmap failed', e && e.message);
    }

    if (!wrote && typeof printer.raster === 'function') {
      try {
        printer.raster(img, 'normal');
        wrote = true;
      } catch (e) {
        console.warn('[print] raster fallback failed', e && e.message);
      }
    }

    hardResetLayout(printer);
    if (!wrote) {
      console.warn('[print] printEscposImage: no image command written');
    }
    return wrote;
  } catch (e) {
    console.warn('[print] printEscposImage failed', e && e.message);
    try {
      hardResetLayout(printer);
    } catch (e2) {
      // ignore
    }
    return false;
  }
}

/**
 * Print a PNG/JPEG buffer via unified box pipeline.
 * @param {Object} printer
 * @param {Buffer} buf
 * @param {string} [mime='image/png']
 * @returns {Promise<boolean>}
 */
async function printImageBuffer(printer, buf, mime) {
  if (!buf || !buf.length) return false;
  return printEscposImage(printer, buf, {
    mime: mime || detectImageMime(buf),
    align: 'lt',
    boxSize: STORE_LOGO_BOX_PX,
    paperWidth: PAPER_IMAGE_WIDTH_PX,
    hAlign: 'center',
    forceMono: true,
  });
}

/**
 * Print QR via native escpos, or QR PNG + same image pipeline as logos.
 * @param {Object} printer
 * @param {string} qrValue
 * @returns {Promise<boolean>}
 */
async function printFiscalQrOnly(printer, qrValue) {
  if (!qrValue) return false;

  // Prefer raster QR image so it uses the same reliable D24 path when native fails
  try {
    const qr = require('qr-image');
    const qrPng = qr.imageSync(String(qrValue), { type: 'png', size: 6, margin: 1 });
    const ok = await printEscposImage(printer, qrPng, {
      mime: 'image/png',
      align: 'lt',
      boxSize: FISCAL_QR_PX,
      paperWidth: PAPER_IMAGE_WIDTH_PX,
      hAlign: 'center',
      forceMono: true,
    });
    if (ok) {
      try {
        hardResetLayout(printer);
        if (typeof printer.feed === 'function') printer.feed(1);
      } catch (e) {
        // ignore
      }
      return true;
    }
  } catch (e) {
    console.warn('[print] QR PNG path failed', e && e.message);
  }

  // Native fallback
  return new Promise((resolve) => {
    let settled = false;
    const done = (ok) => {
      if (settled) return;
      settled = true;
      try {
        hardResetLayout(printer);
      } catch (e) {
        // ignore
      }
      resolve(Boolean(ok));
    };
    try {
      hardResetLayout(printer);
      if (typeof printer.qrimage === 'function') {
        printer.align('ct').qrimage(qrValue, { type: 'png', mode: 'normal', size: 3, margin: 1 }, () => done(true));
        setTimeout(() => done(true), 2500);
        return;
      }
    } catch (e) {
      // fall through
    }
    try {
      hardResetLayout(printer);
      printer.align('ct').qrcode(qrValue, undefined, 'M', 4);
      done(true);
      return;
    } catch (e) {
      console.warn('[print] native QR failed', e && e.message);
    }
    done(false);
  });
}

/**
 * Fiscal QR: provider logo then QR on consecutive lines (same image path as store logo).
 * @param {Object} printer
 * @param {string} qrValue
 * @param {string} [logoDataUri]
 * @returns {Promise<boolean>}
 */
async function printFiscalQrRow(printer, qrValue, logoDataUri) {
  if (!qrValue) return false;
  const hasLogo = Boolean(logoDataUri && String(logoDataUri).trim());
  console.info(
    '[print] fiscal stacked',
    hasLogo ? `logo then QR (${String(logoDataUri).length} chars)` : 'QR only',
    'value=',
    String(qrValue).slice(0, 32)
  );

  if (hasLogo) {
    const logoOk = await printEscposImage(printer, logoDataUri, {
      boxSize: STORE_LOGO_BOX_PX,
      paperWidth: PAPER_IMAGE_WIDTH_PX,
      hAlign: 'center',
      align: 'lt',
      forceMono: true,
    });
    if (!logoOk) {
      console.warn('[print] fiscal provider logo print failed');
    }
    try {
      hardResetLayout(printer);
      if (typeof printer.feed === 'function') printer.feed(1);
    } catch (e) {
      // ignore
    }
  }

  const qrOk = await printFiscalQrOnly(printer, qrValue);
  if (!qrOk) {
    console.warn('[print] fiscal QR print failed');
  }
  // Still true if QR printed (description follows regardless)
  return qrOk;
}

/**
 * @deprecated Alias — stacked logo + QR is now the primary path (`printFiscalQrRow`).
 * @param {Object} printer
 * @param {string} qrValue
 * @param {string} [logoDataUri]
 * @returns {Promise<void>}
 */
async function printFiscalLogoThenQrFallback(printer, qrValue, logoDataUri) {
  await printFiscalQrRow(printer, qrValue, logoDataUri);
}

module.exports = {
  normalizeConfig,
  normalizeLogo,
  normalizeSections,
  applyMargins,
  printLogo,
  printEscposImage,
  printVatLine,
  formatPrintingTimestamp,
  printPrintingTimestamp,
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
  printFiscalLogoThenQrFallback,
  printFiscalQrOnly,
  composeFiscalQrRowBuffer,
  detectImageMime,
  decodeImageInput,
  prepareImageForPrint,
  writeBitmapD24,
  PRINTER_WIDTH,
  MAX_IMAGE_WIDTH_PX,
  PAPER_IMAGE_WIDTH_PX,
  STORE_LOGO_BOX_PX,
};
