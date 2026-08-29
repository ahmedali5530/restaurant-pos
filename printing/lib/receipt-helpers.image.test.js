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

test('computeBoxCanvasLayout applies horizontal offset from print settings', () => {
  const base = computeBoxCanvasLayout(STORE_LOGO_BOX_PX, 480, 'center');
  const shifted = computeBoxCanvasLayout(STORE_LOGO_BOX_PX, 480, 'center', 16);
  assert.equal(shifted.dx, base.dx + 16);
  const left = computeBoxCanvasLayout(STORE_LOGO_BOX_PX, 480, 'center', -16);
  assert.equal(left.dx, base.dx - 16);
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
