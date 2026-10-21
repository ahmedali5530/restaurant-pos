'use strict';

/**
 * Star Graphic Mode (TSP100 / TSP100III).
 * These printers have no internal fonts. ESC/POS text is accepted and discarded.
 * Spec: STAR Graphic Mode Commands, Rev 2.32.
 * Numeric parameters are ASCII digits followed by NUL.
 */

/**
 * @param {number} n
 * @returns {Buffer}
 */
function asciiParam(n) {
  return Buffer.from(`${Number(n)}`, 'ascii');
}

/**
 * @param {string} cmd ASCII after ESC, e.g. "*rE"
 * @param {number|null} [n]
 * @returns {Buffer}
 */
function esc(cmd, n) {
  const head = Buffer.concat([Buffer.from([0x1b]), Buffer.from(cmd, 'ascii')]);
  if (n == null) return head;
  return Buffer.concat([head, asciiParam(n), Buffer.from([0x00])]);
}

/**
 * Encode packed 1-bit rows (MSB leftmost, 1 = black) as a Star raster document.
 * EOT 13 = feed + partial cut (cutter models). EOT 1 = print, no cut.
 * @param {Buffer[]} rows
 * @param {{ eot?: number, pulseDrawer?: boolean }} [opts]
 * @returns {Buffer}
 */
function encodeStarGraphic(rows, opts) {
  const options = opts || {};
  const list = Array.isArray(rows) ? rows.filter((row) => row && row.length) : [];
  if (!list.length) {
    throw new Error('Star graphic encode needs at least one raster row');
  }
  const bytesPerLine = list[0].length;
  for (const row of list) {
    if (row.length !== bytesPerLine) {
      throw new Error('Star graphic rows must share the same width');
    }
  }

  const parts = [
    esc('*rR'),
    esc('*rA'),
    esc('*rP', 0),
    esc('*rE', options.eot == null ? 13 : options.eot),
  ];
  if (options.pulseDrawer) {
    parts.push(esc('*rD', 1));
  }
  const n1 = bytesPerLine & 0xff;
  const n2 = (bytesPerLine >> 8) & 0xff;
  for (const row of list) {
    parts.push(Buffer.from([0x62, n1, n2]));
    parts.push(row);
  }
  parts.push(esc('*rB'));
  return Buffer.concat(parts);
}

/**
 * Pack RGBA (or RGB) pixels into Star rows. Dark pixels become black dots.
 * Width is padded to a multiple of 8 with white.
 * @param {Uint8ClampedArray|Buffer|ArrayLike<number>} data
 * @param {number} width
 * @param {number} height
 * @param {{ threshold?: number, channels?: number }} [opts]
 * @returns {Buffer[]}
 */
function rgbaToStarRows(data, width, height, opts) {
  const options = opts || {};
  const threshold = options.threshold == null ? 180 : options.threshold;
  const channels = options.channels || 4;
  const srcW = Math.max(1, width | 0);
  const srcH = Math.max(1, height | 0);
  const dstW = Math.ceil(srcW / 8) * 8;
  const bytesPerLine = dstW / 8;
  const rows = [];
  for (let y = 0; y < srcH; y++) {
    const row = Buffer.alloc(bytesPerLine);
    for (let x = 0; x < srcW; x++) {
      const i = (y * srcW + x) * channels;
      const r = data[i] || 0;
      const g = data[i + 1] || 0;
      const b = data[i + 2] || 0;
      if ((r + g + b) / 3 < threshold) {
        row[x >> 3] |= 0x80 >> (x & 7);
      }
    }
    rows.push(row);
  }
  return rows;
}

/**
 * @param {Buffer} png
 * @param {{ eot?: number, pulseDrawer?: boolean, threshold?: number }} [opts]
 * @returns {Promise<Buffer>}
 */
async function pngToStarGraphic(png, opts) {
  const { loadImage, createCanvas } = require('canvas');
  const img = await loadImage(png);
  const width = Math.max(1, img.width);
  const height = Math.max(1, img.height);
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(img, 0, 0, width, height);
  const image = ctx.getImageData(0, 0, width, height);
  const rows = rgbaToStarRows(image.data, width, height, opts);
  return encodeStarGraphic(rows, opts);
}

module.exports = {
  encodeStarGraphic,
  rgbaToStarRows,
  pngToStarGraphic,
};
