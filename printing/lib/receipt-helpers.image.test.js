'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  computeBoxCanvasLayout,
  resolvePaperWidthPx,
  resolveLogoOffsetX,
  PAPER_IMAGE_WIDTH_PX,
  PAPER_IMAGE_WIDTH_80MM_PX,
  FIRMWARE_LINE_COLS,
  DOTS_PER_COL,
  STORE_LOGO_BOX_PX,
} = require('./receipt-helpers');

test('computeBoxCanvasLayout centers logo box on default paper width', () => {
  const { canvasWidth, side, dx } = computeBoxCanvasLayout(
    STORE_LOGO_BOX_PX,
    PAPER_IMAGE_WIDTH_PX,
    'center'
  );
  assert.equal(canvasWidth, PAPER_IMAGE_WIDTH_PX);
  assert.equal(side, 152);
  assert.equal(dx, Math.floor((PAPER_IMAGE_WIDTH_PX - 152) / 2));
  const boxCenter = dx + side / 2;
  const paperCenter = canvasWidth / 2;
  assert.ok(Math.abs(boxCenter - paperCenter) < 1);
});

test('computeBoxCanvasLayout hAlign left pins box to paper left', () => {
  const { dx } = computeBoxCanvasLayout(STORE_LOGO_BOX_PX, PAPER_IMAGE_WIDTH_PX, 'left');
  assert.equal(dx, 0);
});

test('computeBoxCanvasLayout hAlign right pins box to paper right', () => {
  const { canvasWidth, side, dx } = computeBoxCanvasLayout(
    STORE_LOGO_BOX_PX,
    PAPER_IMAGE_WIDTH_PX,
    'right'
  );
  assert.equal(dx, canvasWidth - side);
});

test('computeBoxCanvasLayout rounds paper width up to multiple of 8', () => {
  const { canvasWidth } = computeBoxCanvasLayout(STORE_LOGO_BOX_PX, 378, 'center');
  assert.equal(canvasWidth, 384);
});

test('resolvePaperWidthPx defaults to midpoint of 48-col and 72-col (480)', () => {
  assert.equal(PAPER_IMAGE_WIDTH_PX, 480);
  assert.equal(resolvePaperWidthPx({}), 480);
  assert.equal(resolvePaperWidthPx({ escposLineWidth: 42 }), 480);
});

test('resolvePaperWidthPx supports explicit 80mm width', () => {
  assert.equal(resolvePaperWidthPx({ paperWidthPx: PAPER_IMAGE_WIDTH_80MM_PX }), 576);
  assert.equal(resolvePaperWidthPx({ escposLineWidth: 72 }), 576);
});

test('computeBoxCanvasLayout supports rectangular boxes', () => {
  const { canvasWidth, boxW, boxH, dx } = computeBoxCanvasLayout(200, 480, 'center', 0, 80);
  assert.equal(canvasWidth, 480);
  assert.equal(boxW, 200);
  assert.equal(boxH, 80);
  assert.equal(dx, Math.floor((480 - 200) / 2));
});

test('computeBoxCanvasLayout clamps rectangle height to multiple of 8', () => {
  const { boxW, boxH } = computeBoxCanvasLayout(100, 480, 'left', 0, 75);
  assert.equal(boxW, 104);
  assert.equal(boxH, 80);
});

test('prepareImageForPrint stretches to boxWidth × boxHeight when canvas is available', async (t) => {
  let canvas;
  try {
    canvas = require('canvas');
  } catch (e) {
    t.skip('canvas native module not available');
    return;
  }

  const { prepareImageForPrint } = require('./receipt-helpers');
  const { createCanvas, loadImage } = canvas;
  const srcCanvas = createCanvas(40, 30);
  const ctx = srcCanvas.getContext('2d');
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, 40, 30);
  const src = srcCanvas.toBuffer('image/png');

  const out = await prepareImageForPrint(src, 'image/png', {
    boxWidth: 200,
    boxHeight: 80,
    stretch: true,
    paperWidth: PAPER_IMAGE_WIDTH_PX,
    hAlign: 'center',
    forceMono: false,
  });
  assert.ok(out && out.length);
  const img = await loadImage(out);
  assert.equal(img.width, PAPER_IMAGE_WIDTH_PX);
  assert.equal(img.height, 80);
});

test('resolveLogoOffsetX reads config', () => {
  assert.equal(resolveLogoOffsetX({}), 0);
  assert.equal(resolveLogoOffsetX({ logoOffsetX: -24 }), -24);
  assert.equal(resolveLogoOffsetX({ logoOffsetX: 8 }), 8);
});

test('resolvePaperWidthPx reads env override', () => {
  const prev = process.env.PRINT_PAPER_WIDTH_PX;
  process.env.PRINT_PAPER_WIDTH_PX = '400';
  try {
    assert.equal(resolvePaperWidthPx({}), 400);
  } finally {
    if (prev === undefined) delete process.env.PRINT_PAPER_WIDTH_PX;
    else process.env.PRINT_PAPER_WIDTH_PX = prev;
  }
});

test('raster metrics scale font to paper width like ESC/POS Font A', () => {
  const { getRasterMetrics } = require('./raster-metrics');
  const m58 = getRasterMetrics(384);
  const m80 = getRasterMetrics(576);
  assert.ok(m58.normalFontPx >= 14, `58mm font too small: ${m58.normalFontPx}`);
  assert.ok(m80.normalFontPx >= 22, `80mm font too small: ${m80.normalFontPx}`);
  assert.ok(m80.normalFontPx > m58.normalFontPx);
  assert.equal(m80.lineHeightNormal, Math.round(m80.lineHeightLarge / 2));
});

test('raster fonts render readable text without system Courier New', async (t) => {
  let canvas;
  try {
    canvas = require('canvas');
  } catch (e) {
    t.skip('canvas native module not available');
    return;
  }

  const prev = process.env.FONTCONFIG_FILE;
  process.env.FONTCONFIG_FILE = '/dev/null';

  try {
    const { getRasterFonts } = require('./raster-fonts');
    const { createCanvas } = canvas;
    const { normal } = getRasterFonts();
    const c = createCanvas(200, 32);
    const ctx = c.getContext('2d');
    ctx.font = normal;
    ctx.fillStyle = '#000000';
    ctx.fillText('Receipt 123', 8, 16);
    const d = ctx.getImageData(8, 4, 120, 16).data;
    let ink = 0;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i] < 128) ink += 1;
    }
    assert.ok(ink > 80, `expected glyph ink pixels, got ${ink}`);
  } finally {
    if (prev === undefined) delete process.env.FONTCONFIG_FILE;
    else process.env.FONTCONFIG_FILE = prev;
  }
});

test('printEscposImage accepts image/png buffers from canvas', async (t) => {
  let canvas;
  try {
    canvas = require('canvas');
  } catch (e) {
    t.skip('canvas native module not available');
    return;
  }

  const escpos = require('escpos');
  const { printEscposImage } = require('./receipt-helpers');
  const { createCanvas } = canvas;
  const srcCanvas = createCanvas(64, 32);
  const ctx = srcCanvas.getContext('2d');
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, 64, 32);
  const src = srcCanvas.toBuffer('image/png');

  const mockDevice = { open: (cb) => cb(null), write: () => {}, close: () => {} };
  const printer = new escpos.Printer(mockDevice, { encoding: 'UTF-8', width: 42 });
  const ok = await printEscposImage(printer, src, {
    mime: 'image/png',
    skipPrepare: true,
    forceMono: true,
    paperWidth: 64,
    hAlign: 'left',
    maxWidth: 64,
  });
  assert.equal(ok, true);
});

test('prepareImageForPrint outputs full paper width when canvas is available', async (t) => {
  let canvas;
  try {
    canvas = require('canvas');
  } catch (e) {
    t.skip('canvas native module not available');
    return;
  }

  const { prepareImageForPrint } = require('./receipt-helpers');
  const { createCanvas } = canvas;
  const srcCanvas = createCanvas(40, 30);
  const ctx = srcCanvas.getContext('2d');
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, 40, 30);
  const src = srcCanvas.toBuffer('image/png');

  const out = await prepareImageForPrint(src, 'image/png', {
    boxSize: STORE_LOGO_BOX_PX,
    paperWidth: PAPER_IMAGE_WIDTH_PX,
    hAlign: 'center',
    forceMono: false,
  });
  assert.ok(out && out.length);
  const { loadImage } = canvas;
  const img = await loadImage(out);
  assert.equal(img.width, PAPER_IMAGE_WIDTH_PX);
});
