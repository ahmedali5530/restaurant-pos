'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  mergeEffectiveConfig,
  resolvePrintMode,
  paperWidthMmToPx,
  PAPER_WIDTH_DOTS,
  DEFAULT_PRINT_MODE,
} = require('./print-mode');
const { normalizeConfig, getEngine } = (() => {
  const helpers = require('./receipt-helpers');
  const engines = require('./engines');
  return { normalizeConfig: helpers.normalizeConfig, getEngine: engines.getEngine };
})();

test('paperWidthMmToPx maps 58→384, 72→512, and 80→576', () => {
  assert.equal(paperWidthMmToPx(58), 384);
  assert.equal(paperWidthMmToPx(72), 512);
  assert.equal(paperWidthMmToPx(80), 576);
  assert.equal(paperWidthMmToPx(70), null);
  assert.equal(PAPER_WIDTH_DOTS[58], 384);
  assert.equal(PAPER_WIDTH_DOTS[72], 512);
  assert.equal(PAPER_WIDTH_DOTS[80], 576);
});

test('resolvePrintMode defaults and normalizes', () => {
  assert.equal(resolvePrintMode(undefined), DEFAULT_PRINT_MODE);
  assert.equal(resolvePrintMode(''), DEFAULT_PRINT_MODE);
  assert.equal(resolvePrintMode('Raster'), 'raster');
  assert.equal(resolvePrintMode('TEXT'), 'text');
});

test('mergeEffectiveConfig: printer overrides type settings', () => {
  const typeCfg = normalizeConfig({
    printMode: 'text',
    paperWidthMm: 80,
  });
  const merged = mergeEffectiveConfig(typeCfg, {
    print_mode: 'raster',
    paper_width_mm: 58,
  });
  assert.equal(merged.printMode, 'raster');
  assert.equal(merged.paperWidthMm, 58);
  assert.equal(merged.paperWidthPx, 384);
});

test('mergeEffectiveConfig: empty printer keeps type settings', () => {
  const typeCfg = normalizeConfig({
    printMode: 'raster',
    paperWidthMm: 58,
  });
  const merged = mergeEffectiveConfig(typeCfg, {});
  assert.equal(merged.printMode, 'raster');
  assert.equal(merged.paperWidthMm, 58);
  assert.equal(merged.paperWidthPx, 384);
});

test('normalizeConfig applies paperWidthMm to paperWidthPx', () => {
  const cfg58 = normalizeConfig({ paperWidthMm: 58 });
  assert.equal(cfg58.paperWidthMm, 58);
  assert.equal(cfg58.paperWidthPx, 384);
  assert.equal(cfg58.printMode, 'text');
  assert.equal(cfg58.rasterThreshold, 180);

  const cfg72 = normalizeConfig({ paperWidthMm: 72 });
  assert.equal(cfg72.paperWidthMm, 72);
  assert.equal(cfg72.paperWidthPx, 512);

  const cfg80 = normalizeConfig({ paperWidthMm: 80, printMode: 'raster', rasterThreshold: 200 });
  assert.equal(cfg80.paperWidthPx, 576);
  assert.equal(cfg80.printMode, 'raster');
  assert.equal(cfg80.rasterThreshold, 200);
});

test('getEngine falls back to text for unknown modes', () => {
  const eng = getEngine('qz-future');
  assert.equal(eng.name, 'text');
  assert.equal(typeof eng.print, 'function');

  const raster = getEngine('raster');
  assert.equal(raster.name, 'raster');
});

test('raster render width matches paperWidthMm', async (t) => {
  let canvas;
  try {
    canvas = require('canvas');
  } catch {
    t.skip('canvas native module not available');
    return;
  }
  assert.ok(canvas);

  const { renderTempRaster } = require('./raster-render');
  const { loadImage } = canvas;
  const png = await renderTempRaster(
    {
      order: {
        id: 'order:test',
        invoice_number: '1001',
        items: [{ name: 'Burger', quantity: 1, price: 10, total: 10 }],
        tax_amount: 0,
        tax: 0,
      },
    },
    { paperWidthMm: 58, printMode: 'raster', showLogo: false }
  );
  const img = await loadImage(png);
  assert.equal(img.width, 384);
  assert.ok(img.height > 8);
});
